/**
 * Live Firestore smoke test using Application Default Credentials.
 *
 * Usage:
 *   gcloud auth application-default login
 *   gcloud config set project buildloop-hackathon-2026
 *   BUILDLOOP_PERSISTENCE=firestore FIRESTORE_PROJECT_ID=buildloop-hackathon-2026 bun src/scripts/firestore-smoke.ts
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FirestoreRunStore } from "@/orchestrator/persistence/firestore-store";
import { FIRESTORE_RUNS_COLLECTION } from "@/orchestrator/persistence/firestore-mapper";
import type { StoredRun } from "@/orchestrator/persistence/local-store";

const PROJECT_ID = process.env["FIRESTORE_PROJECT_ID"] ?? "buildloop-hackathon-2026";
const workspaceRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function main() {
  delete process.env["BUILDLOOP_FIRESTORE_EMULATOR"];

  const runId = `smoke-${randomUUID()}`;
  const taskId = randomUUID();
  const marker = `buildloop-firestore-smoke-${new Date().toISOString()}`;

  const payload: StoredRun = {
    run: {
      id: runId,
      taskId,
      contractId: taskId,
      contractVersion: 1,
      status: "AWAITING_APPROVAL",
      verdict: "PASS",
      verdictReason: marker,
      sourceRevision: "smoke-revision",
      workerId: "firestore-smoke",
      attemptNumber: 1,
      counters: {
        workerCalls: 1,
        checkerCalls: 1,
        correctionCount: 0,
        filesChanged: 0,
        commandsExecuted: 0,
      },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    evidence: [
      {
        id: randomUUID(),
        runId,
        attemptNumber: 1,
        category: "decision",
        name: "firestore_smoke",
        status: "pass",
        summary: marker,
        details: "BuildLoop Firestore runtime persistence smoke test",
        affectedFiles: [],
        severity: "info",
        createdAt: new Date().toISOString(),
      },
    ],
    workerReports: [],
    decisionLog: [
      {
        id: randomUUID(),
        runId,
        attemptNumber: 1,
        previousStatus: "CHECKING",
        nextStatus: "AWAITING_APPROVAL",
        verdict: "PASS",
        rule: "CHECKS_PASSED",
        evidenceIds: [],
        summary: marker,
        createdAt: new Date().toISOString(),
      },
    ],
    orchestrationEvidence: {
      securityReviewInvoked: false,
      securityFindings: [],
      approvalType: "AUTO_APPROVED_BY_POLICY",
      policyDecision: "AUTO_APPROVED",
      plannerOutput: "Firestore smoke test",
    },
    storedAt: new Date().toISOString(),
    taskGoal: marker,
    workerMode: "smoke",
    workerId: "firestore-smoke",
  } as StoredRun;

  const store = new FirestoreRunStore(workspaceRoot);
  await store.saveRun(payload);
  const loaded = await store.getRun(runId);

  if (!loaded) {
    throw new Error("Smoke test document was not readable after write.");
  }
  if (loaded.run.verdictReason !== marker) {
    throw new Error(`Smoke test marker mismatch. Expected "${marker}", got "${loaded.run.verdictReason}".`);
  }

  const documentPath = store.documentPath(runId);
  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId: PROJECT_ID,
        collection: FIRESTORE_RUNS_COLLECTION,
        documentId: runId,
        documentPath,
        marker,
        taskId,
        status: loaded.run.status,
        correctionCount: loaded.run.counters.correctionCount,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: message,
        authenticateWith:
          "gcloud auth application-default login && gcloud config set project buildloop-hackathon-2026",
        runWith:
          "BUILDLOOP_PERSISTENCE=firestore FIRESTORE_PROJECT_ID=buildloop-hackathon-2026 bun src/scripts/firestore-smoke.ts",
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
