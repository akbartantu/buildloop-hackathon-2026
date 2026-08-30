import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getFirestoreAccessToken } from "./firestore-adc";
import {
  encodeFirestoreFields,
  firestoreRecordFromFields,
  firestoreRecordToStoredRun,
  FIRESTORE_RUNS_COLLECTION,
  storedRunToFirestoreRecord,
  type FirestoreFieldValue,
} from "./firestore-mapper";
import type { StoredRun } from "./local-store";
import type { RuntimeRunStore } from "./store-factory";
import type { DecisionLogEntry } from "../types";

export function resolveFirestoreProjectId(): string {
  const projectId =
    process.env["FIRESTORE_PROJECT_ID"] ??
    process.env["GOOGLE_CLOUD_PROJECT"] ??
    process.env["GCP_PROJECT"] ??
    null;
  if (!projectId) {
    if (isFirestoreEmulatorMode()) {
      return "buildloop-local-emulator";
    }
    throw new Error(
      "Firestore persistence requires FIRESTORE_PROJECT_ID or GOOGLE_CLOUD_PROJECT.",
    );
  }
  return projectId;
}

export function isFirestoreEmulatorMode(): boolean {
  return process.env["BUILDLOOP_FIRESTORE_EMULATOR"] === "1";
}

type FirestoreTransport = {
  patchDocument(projectId: string, collection: string, docId: string, fields: Record<string, FirestoreFieldValue>): Promise<void>;
  getDocument(projectId: string, collection: string, docId: string): Promise<Record<string, FirestoreFieldValue> | null>;
};

export class FirestoreRunStore implements RuntimeRunStore {
  private readonly emulatorRoot: string;
  private readonly projectId: string;
  private readonly transport: FirestoreTransport;

  constructor(workspaceRoot: string, transport?: FirestoreTransport) {
    this.emulatorRoot = path.join(workspaceRoot, ".buildloop", "firestore");
    this.projectId = resolveFirestoreProjectId();
    this.transport = transport ?? createDefaultTransport();
  }

  async saveRun(run: StoredRun): Promise<void> {
    const record = storedRunToFirestoreRecord(run);
    const fields = encodeFirestoreFields(record as unknown as Record<string, unknown>);

    if (isFirestoreEmulatorMode()) {
      await this.saveEmulatorDocument(run.run.id, record);
      return;
    }

    await this.transport.patchDocument(
      this.projectId,
      FIRESTORE_RUNS_COLLECTION,
      run.run.id,
      fields,
    );
  }

  async getRun(runId: string): Promise<StoredRun | null> {
    if (isFirestoreEmulatorMode()) {
      return this.getEmulatorDocument(runId);
    }

    const fields = await this.transport.getDocument(
      this.projectId,
      FIRESTORE_RUNS_COLLECTION,
      runId,
    );
    if (!fields) return null;
    const record = firestoreRecordFromFields(fields);
    return firestoreRecordToStoredRun(record);
  }

  async appendDecision(runId: string, entry: DecisionLogEntry): Promise<void> {
    const existing = await this.getRun(runId);
    if (!existing) {
      throw new Error(`Cannot append decision — run ${runId} not found.`);
    }
    existing.decisionLog = [...(existing.decisionLog ?? []), entry];
    await this.saveRun(existing);
  }

  documentPath(runId: string): string {
    return `projects/${this.projectId}/databases/(default)/documents/${FIRESTORE_RUNS_COLLECTION}/${runId}`;
  }

  private emulatorDocPath(runId: string): string {
    return path.join(this.emulatorRoot, "runs", `${runId}.json`);
  }

  private async saveEmulatorDocument(runId: string, record: ReturnType<typeof storedRunToFirestoreRecord>): Promise<void> {
    const filePath = this.emulatorDocPath(runId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
  }

  private async getEmulatorDocument(runId: string): Promise<StoredRun | null> {
    try {
      const raw = await readFile(this.emulatorDocPath(runId), "utf8");
      const record = JSON.parse(raw) as ReturnType<typeof storedRunToFirestoreRecord>;
      return firestoreRecordToStoredRun(record);
    } catch {
      return null;
    }
  }
}

function createDefaultTransport(): FirestoreTransport {
  return {
    async patchDocument(projectId, collection, docId, fields) {
      const token = await getFirestoreAccessToken();
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Firestore save failed: HTTP ${response.status} ${body.slice(0, 200)}`);
      }
    },
    async getDocument(projectId, collection, docId) {
      const token = await getFirestoreAccessToken();
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Firestore get failed: HTTP ${response.status} ${body.slice(0, 200)}`);
      }
      const payload = (await response.json()) as { fields?: Record<string, FirestoreFieldValue> };
      return payload.fields ?? null;
    },
  };
}
