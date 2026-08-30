import { createSign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StoredRun } from "./local-store";
import type { RuntimeRunStore } from "./store-factory";
import type { DecisionLogEntry } from "../types";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

export class FirestoreRunStore implements RuntimeRunStore {
  private readonly emulatorRoot: string;
  private readonly projectId: string | null;
  private readonly serviceAccount: ServiceAccount | null;
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(workspaceRoot: string) {
    this.emulatorRoot = path.join(workspaceRoot, ".buildloop", "firestore");
    this.projectId = process.env["FIRESTORE_PROJECT_ID"] ?? process.env["GOOGLE_CLOUD_PROJECT"] ?? null;
    this.serviceAccount = parseServiceAccount();
    if (!this.projectId && !process.env["BUILDLOOP_FIRESTORE_EMULATOR"]) {
      throw new Error(
        "Firestore persistence requested but FIRESTORE_PROJECT_ID is not configured.",
      );
    }
  }

  private localDocPath(runId: string): string {
    return path.join(this.emulatorRoot, "runs", `${runId}.json`);
  }

  async saveRun(run: StoredRun): Promise<void> {
    if (process.env["BUILDLOOP_FIRESTORE_EMULATOR"] === "1" || !this.serviceAccount || !this.projectId) {
      const filePath = this.localDocPath(run.run.id);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(run, null, 2), "utf8");
      return;
    }

    const token = await this.getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/buildloopRuns/${run.run.id}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: documentToFirestoreFields({ json: JSON.stringify(run) }),
      }),
    });
    if (!response.ok) {
      throw new Error(`Firestore save failed: HTTP ${response.status}`);
    }
  }

  async getRun(runId: string): Promise<StoredRun | null> {
    if (process.env["BUILDLOOP_FIRESTORE_EMULATOR"] === "1" || !this.serviceAccount || !this.projectId) {
      try {
        const raw = await readFile(this.localDocPath(runId), "utf8");
        return JSON.parse(raw) as StoredRun;
      } catch {
        return null;
      }
    }

    const token = await this.getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/buildloopRuns/${runId}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Firestore get failed: HTTP ${response.status}`);
    }
    const payload = (await response.json()) as { fields?: FirestoreFields };
    const json = payload.fields?.["json"]?.stringValue;
    return json ? (JSON.parse(json) as StoredRun) : null;
  }

  async appendDecision(runId: string, entry: DecisionLogEntry): Promise<void> {
    const existing = await this.getRun(runId);
    if (!existing) {
      throw new Error(`Cannot append decision — run ${runId} not found.`);
    }
    existing.decisionLog = [...(existing.decisionLog ?? []), entry];
    await this.saveRun(existing);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return this.accessToken.value;
    }
    if (!this.serviceAccount) {
      throw new Error("Firestore service account not configured.");
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = base64Url(
      JSON.stringify({
        iss: this.serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/datastore",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
    const unsigned = `${header}.${claim}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    const signature = signer.sign(this.serviceAccount.private_key).toString("base64url");
    const jwt = `${unsigned}.${signature}`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!tokenResponse.ok) {
      throw new Error(`Failed to obtain Firestore access token: HTTP ${tokenResponse.status}`);
    }
    const tokenPayload = (await tokenResponse.json()) as { access_token: string; expires_in: number };
    this.accessToken = {
      value: tokenPayload.access_token,
      expiresAt: Date.now() + tokenPayload.expires_in * 1000,
    };
    return this.accessToken.value;
  }
}

type FirestoreFieldValue = { stringValue?: string };
type FirestoreFields = Record<string, FirestoreFieldValue>;

function documentToFirestoreFields(input: Record<string, string>): FirestoreFields {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, { stringValue: value }]),
  );
}

function parseServiceAccount(): ServiceAccount | null {
  const inline = process.env["FIRESTORE_SERVICE_ACCOUNT_JSON"];
  if (inline) {
    try {
      return JSON.parse(inline) as ServiceAccount;
    } catch {
      return null;
    }
  }
  return null;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}
