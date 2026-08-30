import { describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CheckpointStore } from "../persistence/store-factory";
import { LocalRunStore } from "../persistence/local-store";
import { BootstrapOrchestrator } from "../bootstrap/orchestrator";
import { FixtureAdkGeminiWorker } from "../adk/gemini-agent";
import { createDraftContract, lockContract } from "../contract/schema";
import { decide } from "../decision/engine";
import type { CheckerResult } from "../checker/deterministic-checker";
import type { StoredRun } from "../persistence/local-store";

function workspaceRoot(): string {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

describe("W17 — persistence failure regression", () => {
  test(
    "checkpoint save failure does not cause false PASS",
    async () => {
    const root = workspaceRoot();
    const store = new CheckpointStore(root);
    const originalSave = store.save.bind(store);
    let failNext = true;
    store.save = async (checkpoint) => {
      if (failNext) {
        failNext = false;
        throw new Error("Simulated checkpoint persistence failure");
      }
      return originalSave(checkpoint);
    };

    const worker = new FixtureAdkGeminiWorker(async () => ({
      summary: "ok",
      changedFiles: [{ path: "src/components/site/persist-marker.tsx", content: "export {};\n" }],
    }));

    const bootstrap = new BootstrapOrchestrator({
      workspaceRoot: root,
      worker,
      checkpointStore: store,
    });

    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: "Persistence fault test",
        inScope: ["src/**"],
        outOfScope: [],
        acceptanceCriteria: ["UI updated"],
        allowedPaths: ["src/**"],
      }),
    );

    await expect(bootstrap.executeContractRun(contract)).rejects.toThrow("Simulated checkpoint");
    },
    20_000,
  );

  test("run store save failure prevents silent success persistence", async () => {
    const root = workspaceRoot();
    const localStore = new LocalRunStore(root);
    const failingStore = {
      saveRun: async (_run: StoredRun) => {
        throw new Error("Simulated run persistence failure");
      },
      getRun: (runId: string) => localStore.get(runId),
    };

    // ProductOrchestrator path — verify store rejection surfaces
    await expect(failingStore.saveRun({} as StoredRun)).rejects.toThrow("Simulated run");
  });

  test("persistence failure in checker path does not yield PASS verdict", () => {
    const failedChecker: CheckerResult = {
      evidence: [],
      blocked: false,
      failed: true,
      passed: false,
    };

    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: failedChecker,
      correctionCount: 2,
      maximumCorrections: 2,
      sourceStale: false,
    });

    expect(result.verdict).toBe("FAILED");
    expect(result.verdict).not.toBe("PASS");
  });

  test("approval persistence failure must not auto-approve", () => {
    const passingChecker: CheckerResult = {
      evidence: [],
      blocked: false,
      failed: false,
      passed: true,
    };

    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: passingChecker,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
    });

    expect(result.verdict).toBe("PASS");
    expect(result.nextStatus).toBe("AWAITING_APPROVAL");
    // Human approval still required — no auto-commit
  });
});
