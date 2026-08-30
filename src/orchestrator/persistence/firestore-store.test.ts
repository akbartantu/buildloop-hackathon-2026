import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  encodeFirestoreFields,
  decodeFirestoreFields,
  firestoreRecordFromFields,
  firestoreRecordToStoredRun,
  storedRunToFirestoreRecord,
  FIRESTORE_RUNS_COLLECTION,
} from "./firestore-mapper";
import {
  FirestoreRunStore,
  isFirestoreEmulatorMode,
  resolveFirestoreProjectId,
} from "./firestore-store";
import {
  createRuntimeRunStoreForMode,
  resolvePersistenceMode,
} from "./store-factory";
import type { StoredRun } from "./local-store";
import type { FirestoreFieldValue } from "./firestore-mapper";

function workspaceRoot(): string {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

function sampleStoredRun(runId: string, taskId: string): StoredRun {
  return {
    run: {
      id: runId,
      taskId,
      contractId: taskId,
      contractVersion: 1,
      status: "AWAITING_APPROVAL",
      verdict: "PASS",
      verdictReason: "Checks passed",
      sourceRevision: "abc123",
      workerId: "demo-worker",
      attemptNumber: 2,
      counters: {
        workerCalls: 2,
        checkerCalls: 2,
        correctionCount: 1,
        filesChanged: 1,
        commandsExecuted: 2,
      },
      startedAt: "2026-08-30T12:00:00.000Z",
      completedAt: "2026-08-30T12:01:00.000Z",
    },
    evidence: [
      {
        id: "ev-1",
        runId,
        attemptNumber: 2,
        category: "test",
        name: "typecheck",
        status: "pass",
        summary: "Typecheck passed",
        details: "",
        affectedFiles: [],
        severity: "info",
        createdAt: "2026-08-30T12:01:00.000Z",
      },
    ],
    workerReports: [],
    decisionLog: [],
    orchestrationEvidence: {
      securityReviewInvoked: false,
      securityFindings: [],
      approvalType: null,
      policyDecision: null,
      plannerOutput: null,
    },
    storedAt: "2026-08-30T12:01:01.000Z",
    taskGoal: "Add a small safe feature and its focused test",
    workerMode: "demo",
    workerId: "demo-worker",
  } as StoredRun;
}

describe("Firestore mapper", () => {
  test("round-trips StoredRun through Firestore record encoding", () => {
    const original = sampleStoredRun("run-1", "task-1");
    const record = storedRunToFirestoreRecord(original);
    expect(record.taskId).toBe("task-1");
    expect(record.runId).toBe("run-1");
    expect(record.correctionCount).toBe(1);
    expect(record.workerMode).toBe("demo");
    expect(record.evidenceCount).toBe(1);

    const fields = encodeFirestoreFields(record as unknown as Record<string, unknown>);
    const decoded = firestoreRecordFromFields(fields);
    const restored = firestoreRecordToStoredRun(decoded);
    expect(restored.run.id).toBe("run-1");
    expect(restored.run.taskId).toBe("task-1");
    expect(restored.taskGoal).toBe(original.taskGoal);
  });

  test("encodeFirestoreFields omits undefined values", () => {
    const fields = encodeFirestoreFields({
      taskId: "task-1",
      optional: undefined,
      status: "PASS",
    });
    expect(fields["taskId"]).toBeDefined();
    expect(fields["optional"]).toBeUndefined();
    expect(fields["status"]).toBeDefined();
  });

  test("decodeFirestoreFields restores nested maps and arrays", () => {
    const fields: Record<string, FirestoreFieldValue> = {
      meta: {
        mapValue: {
          fields: {
            count: { integerValue: "2" },
            tags: {
              arrayValue: {
                values: [{ stringValue: "orchestration" }],
              },
            },
          },
        },
      },
    };
    const decoded = decodeFirestoreFields(fields) as { meta: { count: number; tags: string[] } };
    expect(decoded.meta.count).toBe(2);
    expect(decoded.meta.tags).toEqual(["orchestration"]);
  });
});

describe("Persistence provider selection", () => {
  const originalMode = process.env["BUILDLOOP_PERSISTENCE"];

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env["BUILDLOOP_PERSISTENCE"];
    } else {
      process.env["BUILDLOOP_PERSISTENCE"] = originalMode;
    }
  });

  test("defaults to local mode", () => {
    delete process.env["BUILDLOOP_PERSISTENCE"];
    expect(resolvePersistenceMode()).toBe("local");
  });

  test("selects firestore when configured", () => {
    process.env["BUILDLOOP_PERSISTENCE"] = "firestore";
    expect(resolvePersistenceMode()).toBe("firestore");
  });

  test("createRuntimeRunStoreForMode returns local store without Firestore project config", () => {
    const store = createRuntimeRunStoreForMode(workspaceRoot(), "local");
    expect(store.saveRun).toBeDefined();
    expect(store.getRun).toBeDefined();
  });
});

describe("FirestoreRunStore emulator mode", () => {
  const originalEmulator = process.env["BUILDLOOP_FIRESTORE_EMULATOR"];
  const originalProject = process.env["FIRESTORE_PROJECT_ID"];
  let tempRoot: string;

  afterEach(async () => {
    if (originalEmulator === undefined) {
      delete process.env["BUILDLOOP_FIRESTORE_EMULATOR"];
    } else {
      process.env["BUILDLOOP_FIRESTORE_EMULATOR"] = originalEmulator;
    }
    if (originalProject === undefined) {
      delete process.env["FIRESTORE_PROJECT_ID"];
    } else {
      process.env["FIRESTORE_PROJECT_ID"] = originalProject;
    }
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("writes and reads run documents in emulator mode", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "buildloop-firestore-"));
    process.env["BUILDLOOP_FIRESTORE_EMULATOR"] = "1";
    delete process.env["FIRESTORE_PROJECT_ID"];

    const store = new FirestoreRunStore(tempRoot);
    const run = sampleStoredRun("run-emulator-1", "task-emulator-1");
    await store.saveRun(run);
    const loaded = await store.getRun("run-emulator-1");

    expect(loaded?.run.id).toBe("run-emulator-1");
    expect(loaded?.run.taskId).toBe("task-emulator-1");
    expect(loaded?.run.counters.correctionCount).toBe(1);
    expect(isFirestoreEmulatorMode()).toBe(true);
  });

  test("appendDecision updates persisted run", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "buildloop-firestore-"));
    process.env["BUILDLOOP_FIRESTORE_EMULATOR"] = "1";

    const store = new FirestoreRunStore(tempRoot);
    const run = sampleStoredRun("run-emulator-2", "task-emulator-2");
    await store.saveRun(run);

    await store.appendDecision("run-emulator-2", {
      id: "decision-1",
      runId: "run-emulator-2",
      attemptNumber: 2,
      previousStatus: "CHECKING",
      nextStatus: "AWAITING_APPROVAL",
      verdict: "PASS",
      rule: "CHECKS_PASSED",
      evidenceIds: [],
      summary: "Checks passed",
      createdAt: "2026-08-30T12:01:00.000Z",
    });

    const loaded = await store.getRun("run-emulator-2");
    expect(loaded?.decisionLog).toHaveLength(1);
    expect(loaded?.decisionLog[0]?.rule).toBe("CHECKS_PASSED");
  });
});

describe("FirestoreRunStore cloud mode", () => {
  test("requires project id outside emulator mode", () => {
    delete process.env["BUILDLOOP_FIRESTORE_EMULATOR"];
    delete process.env["FIRESTORE_PROJECT_ID"];
    delete process.env["GOOGLE_CLOUD_PROJECT"];
    expect(() => resolveFirestoreProjectId()).toThrow(/requires FIRESTORE_PROJECT_ID/);
  });

  test("does not silently fall back when cloud transport fails", async () => {
    process.env["FIRESTORE_PROJECT_ID"] = "test-project";
    delete process.env["BUILDLOOP_FIRESTORE_EMULATOR"];

    const store = new FirestoreRunStore(workspaceRoot(), {
      async patchDocument() {
        throw new Error("Simulated Firestore outage");
      },
      async getDocument() {
        return null;
      },
    });

    const run = sampleStoredRun("run-cloud-fail", "task-cloud-fail");
    await expect(store.saveRun(run)).rejects.toThrow("Simulated Firestore outage");
  });

  test("uses injected transport for cloud read/write", async () => {
    process.env["FIRESTORE_PROJECT_ID"] = "test-project";
    delete process.env["BUILDLOOP_FIRESTORE_EMULATOR"];

    const bucket = new Map<string, Record<string, FirestoreFieldValue>>();
    const store = new FirestoreRunStore(workspaceRoot(), {
      async patchDocument(_projectId, collection, docId, fields) {
        bucket.set(`${collection}/${docId}`, fields);
      },
      async getDocument(_projectId, collection, docId) {
        return bucket.get(`${collection}/${docId}`) ?? null;
      },
    });

    const run = sampleStoredRun("run-cloud-1", "task-cloud-1");
    await store.saveRun(run);
    const loaded = await store.getRun("run-cloud-1");

    expect(loaded?.run.id).toBe("run-cloud-1");
    expect(store.documentPath("run-cloud-1")).toBe(
      `projects/test-project/databases/(default)/documents/${FIRESTORE_RUNS_COLLECTION}/run-cloud-1`,
    );
  });
});
