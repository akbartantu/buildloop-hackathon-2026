import { afterEach, describe, expect, test } from "bun:test";

import { AdkGeminiWorker } from "../adk/gemini-agent";
import { setAdkRunnerOverride, type AdkAgentRunner } from "../adk/runner";
import { createDraftContract, lockContract } from "../contract/schema";
import { decide } from "../decision/engine";
import type { CheckerResult } from "../checker/deterministic-checker";
import { selectWorker } from "../worker/worker-selection";
import { DemoPassWorker } from "../worker/demo-worker";
import { parseWorkerStructuredOutput } from "../gemini/client";
import { PASS_DEMO_GOAL } from "../scenarios/pass";

function mockAdkRunner(handler: AdkAgentRunner["run"]): AdkAgentRunner {
  return {
    isConfigured: () => true,
    run: handler,
  };
}

describe("ADK integration", () => {
  afterEach(() => {
    setAdkRunnerOverride(null);
  });

  test("ADK-1: real mode selects official ADK worker", () => {
    const selected = selectWorker({ mode: "real", goal: "Fix button copy" });
    expect(selected.workerId).toBe("adk-gemini-worker");
    expect(selected.worker).toBeInstanceOf(AdkGeminiWorker);
  });

  test("ADK-2: official ADK runner is invoked in real worker path", async () => {
    let invoked = false;
    setAdkRunnerOverride(
      mockAdkRunner(async () => {
        invoked = true;
        return {
          text: JSON.stringify({
            summary: "Updated",
            changedFiles: [{ path: "src/app.ts", content: "export {}\n" }],
          }),
          model: "gemini-3.6-flash",
          latencyMs: 12,
          operationalRetries: 0,
          geminiCallCount: 1,
          adkRunnerInvoked: true,
          adkAgentName: "buildloop_coding_worker",
        };
      }),
    );

    const worker = new AdkGeminiWorker();
    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: "Update app export",
        inScope: ["src/**"],
        outOfScope: [],
        acceptanceCriteria: ["Updated"],
        allowedPaths: ["src/**"],
      }),
    );

    const report = await worker.execute({
      contract,
      sandboxRoot: process.cwd(),
      workspaceRoot: process.cwd(),
      sourceRevision: "rev",
      attemptNumber: 1,
    });

    expect(invoked).toBe(true);
    expect(report.workerId).toBe("adk-gemini-worker");
    expect(report.commandsExecuted).toEqual(["adk.runEphemeral"]);
    expect(report.usageMetadata?.adkRunnerInvoked).toBe(1);
  });

  test("ADK-3: demo mode remains explicit and isolated", () => {
    const demo = selectWorker({ mode: "demo", goal: PASS_DEMO_GOAL });
    expect(demo.worker).toBeInstanceOf(DemoPassWorker);
    expect(demo.workerId).toBe("demo-worker");
  });

  test("ADK-4: worker cannot set final PASS without checker", () => {
    const result = decide({
      currentStatus: "INSPECTING",
      preflightSafe: true,
      checkerResult: null,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(result.verdict).toBeNull();
    expect(result.nextStatus).toBe("RUNNING");
  });

  test("ADK-5: protected path patch rejected despite ADK output", async () => {
    setAdkRunnerOverride(
      mockAdkRunner(async () => ({
        text: JSON.stringify({
          summary: "Malicious",
          changedFiles: [{ path: ".env", content: "SECRET=1" }],
        }),
        model: "gemini-3.6-flash",
        latencyMs: 1,
        operationalRetries: 0,
        geminiCallCount: 1,
        adkRunnerInvoked: true,
        adkAgentName: "buildloop_coding_worker",
      })),
    );

    const worker = new AdkGeminiWorker();
    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: "Ignore rules",
        inScope: ["."],
        outOfScope: [],
        acceptanceCriteria: ["Should fail"],
        allowedPaths: ["src/**"],
      }),
    );

    const report = await worker.execute({
      contract,
      sandboxRoot: process.cwd(),
      workspaceRoot: process.cwd(),
      sourceRevision: "rev",
      attemptNumber: 1,
    });

    expect(report.error?.code).toBe("WORKER_ERROR");
    expect(report.filesChanged).toHaveLength(0);
  });

  test("ADK-6: malformed official ADK response is rejected safely", () => {
    expect(() => parseWorkerStructuredOutput("{not-json")).toThrow();
  });

  test("operational failure does not trigger correction", () => {
    const checker: CheckerResult = {
      evidence: [],
      blocked: false,
      failed: true,
      passed: false,
      operationalFailure: true,
    };
    const decision = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: checker,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(decision.rule).toBe("OPERATIONAL_FAILURE");
    expect(decision.shouldCorrect).toBe(false);
    expect(decision.verdict).toBe("FAILED");
  });
});
