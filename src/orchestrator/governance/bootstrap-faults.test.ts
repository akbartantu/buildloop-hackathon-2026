import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

import { BootstrapOrchestrator } from "../bootstrap/orchestrator";
import { GeminiWorker } from "../worker/gemini-worker";
import { crashingWorker, stubWorker } from "./test-helpers";
import { PASS_DEMO_TARGET_RELATIVE } from "../scenarios/pass";

function workspaceRoot(): string {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

/** Full orchestrator runs include manifest hashing and sandbox I/O — allow headroom under load. */
const ORCHESTRATOR_TEST_TIMEOUT_MS = 20_000;

describe("bootstrap fault paths", () => {
  test(
    "worker crash yields FAILED after correction limit, not unhandled throw",
    async () => {
      const orchestrator = new BootstrapOrchestrator({
        workspaceRoot: workspaceRoot(),
        worker: crashingWorker(),
      });
      const result = await orchestrator.runPassDemo();
      expect(result.run.counters.workerCalls).toBeGreaterThan(0);
      expect(result.run.verdict).toBe("FAILED");
      expect(result.run.status).toBe("FAILED");
      expect(result.workerReports.some((report) => report.error?.code === "WORKER_CRASH")).toBe(true);
    },
    ORCHESTRATOR_TEST_TIMEOUT_MS,
  );

  test(
    "always-failing worker respects correction limit",
    async () => {
      const orchestrator = new BootstrapOrchestrator({
        workspaceRoot: workspaceRoot(),
        worker: stubWorker("always-fail", (input) => ({
          workerId: "always-fail",
          attemptNumber: input.attemptNumber,
          filesChanged: [],
          commandsRequested: [],
          commandsExecuted: [],
          summary: "All tests passed",
          patchSummary: "Worker claims success without changes",
        })),
      });
      const result = await orchestrator.runPassDemo();
      expect(result.run.counters.correctionCount).toBeLessThanOrEqual(2);
      expect(result.run.verdict).toBe("FAILED");
      expect(result.run.counters.workerCalls).toBeLessThanOrEqual(3);
    },
    ORCHESTRATOR_TEST_TIMEOUT_MS,
  );

  test(
    "blocked preflight never invokes worker",
    async () => {
      const orchestrator = new BootstrapOrchestrator({ workspaceRoot: workspaceRoot() });
      const result = await orchestrator.runBlockedDemo();
      expect(result.run.verdict).toBe("BLOCKED");
      expect(result.run.counters.workerCalls).toBe(0);
    },
    ORCHESTRATOR_TEST_TIMEOUT_MS,
  );

  test(
    "PASS demo completes with exactly one correction",
    async () => {
      const orchestrator = new BootstrapOrchestrator({ workspaceRoot: workspaceRoot() });
      const result = await orchestrator.runPassDemo();
      expect(result.run.verdict).toBe("PASS");
      expect(result.run.counters.correctionCount).toBe(1);
      expect(result.run.counters.workerCalls).toBe(2);
      expect(
        result.workerReports.every((report) => report.filesChanged.includes(PASS_DEMO_TARGET_RELATIVE)),
      ).toBe(true);
    },
    ORCHESTRATOR_TEST_TIMEOUT_MS,
  );

  test(
    "gemini stub without API key does not PASS",
    async () => {
      const previous = process.env["GEMINI_API_KEY"];
      delete process.env["GEMINI_API_KEY"];
      try {
        const orchestrator = new BootstrapOrchestrator({
          workspaceRoot: workspaceRoot(),
          worker: new GeminiWorker(),
        });
        const result = await orchestrator.runPassDemo();
        expect(result.run.verdict).not.toBe("PASS");
        expect(result.run.counters.workerCalls).toBeGreaterThan(0);
      } finally {
        if (previous !== undefined) {
          process.env["GEMINI_API_KEY"] = previous;
        }
      }
    },
    ORCHESTRATOR_TEST_TIMEOUT_MS,
  );
});
