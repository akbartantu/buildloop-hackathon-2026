import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "bun:test";

import { AdkGeminiWorker } from "../adk/gemini-agent";
import { setAdkRunnerOverride, type AdkAgentRunner } from "../adk/runner";
import { BootstrapOrchestrator } from "../bootstrap/orchestrator";
import { DeterministicChecker } from "../checker/deterministic-checker";
import { GeminiClientError } from "../gemini/client";
import { PASS_DEMO_TARGET_RELATIVE } from "../scenarios/pass";
import { createTempSandbox, cleanupTempSandbox, testContract } from "./test-helpers";

function workspaceRoot(): string {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

function mockAdkRunner(handler: AdkAgentRunner["run"]): AdkAgentRunner {
  return {
    isConfigured: () => true,
    run: handler,
  };
}

const ORCHESTRATOR_TEST_TIMEOUT_MS = 20_000;

describe("LIVE-429 operational failure isolation", () => {
  afterEach(() => {
    setAdkRunnerOverride(null);
  });

  test("LIVE-429-1: quota exhausted on orchestration path yields 0 corrections", async () => {
    setAdkRunnerOverride(
      mockAdkRunner(async () => {
        throw new GeminiClientError(
          "GEMINI_QUOTA_EXHAUSTED",
          "Gemini HTTP 429: quota exhausted",
          429,
          undefined,
          { adkRunnerInvoked: true, operationalRetries: 3, geminiCallCount: 4 },
        );
      }),
    );

    const orchestrator = new BootstrapOrchestrator({
      workspaceRoot: workspaceRoot(),
      worker: new AdkGeminiWorker(),
    });
    const result = await orchestrator.executeContractRun(testContract());

    expect(result.run.counters.correctionCount).toBe(0);
    expect(result.run.counters.workerCalls).toBe(1);
    expect(result.run.verdict).toBe("FAILED");
    expect(result.decisionLog.some((entry) => entry.rule === "OPERATIONAL_FAILURE")).toBe(true);
    expect(result.decisionLog.some((entry) => entry.rule === "CORRECTION_LIMIT")).toBe(false);
    expect(result.run.verdictReason).not.toContain("Correction limit reached");
  }, ORCHESTRATOR_TEST_TIMEOUT_MS);

  test("LIVE-429-2: ADK empty response with 429 message is operational, checker skips command checks", async () => {
    const sandbox = await createTempSandbox("live429-checker");
    try {
      const checker = new DeterministicChecker();
      const result = await checker.run({
        runId: crypto.randomUUID(),
        attemptNumber: 1,
        contract: testContract(),
        sandboxRoot: sandbox,
        workspaceRoot: workspaceRoot(),
        workerReport: {
          workerId: "adk-gemini-worker",
          attemptNumber: 1,
          filesChanged: [],
          commandsRequested: ["adk.runEphemeral"],
          commandsExecuted: [],
          summary: "Quota exhausted",
          patchSummary: "Quota exhausted",
          error: {
            code: "ADK_EMPTY_RESPONSE",
            message: "HTTP 429 RESOURCE_EXHAUSTED quota exceeded",
          },
        },
        sourceRevisionAtStart: "rev-a",
        sourceRevisionNow: "rev-a",
      });

      expect(result.operationalFailure).toBe(true);
      expect(result.evidence.some((item) => item.name === "worker_operational_error")).toBe(true);
      expect(result.evidence.some((item) => item.name === "zero_file_changes")).toBe(false);
      expect(result.evidence.some((item) => item.category === "command")).toBe(false);
    } finally {
      await cleanupTempSandbox(sandbox);
    }
  });

  test("LIVE-429-3: exhausted internal retries still leaves correction count at 0", async () => {
    setAdkRunnerOverride(
      mockAdkRunner(async () => {
        throw new GeminiClientError(
          "GEMINI_QUOTA_EXHAUSTED",
          "Gemini HTTP 429 after retries",
          429,
          undefined,
          { adkRunnerInvoked: true, operationalRetries: 3, geminiCallCount: 4 },
        );
      }),
    );

    const worker = new AdkGeminiWorker();
    const orchestrator = new BootstrapOrchestrator({
      workspaceRoot: workspaceRoot(),
      worker,
    });
    const result = await orchestrator.executeContractRun(testContract());

    expect(result.run.counters.correctionCount).toBe(0);
    expect(result.workerReports[0]?.usageMetadata?.operationalRetries).toBe(3);
    expect(result.workerReports[0]?.usageMetadata?.geminiCallCount).toBe(4);
  }, ORCHESTRATOR_TEST_TIMEOUT_MS);

  test("LIVE-429-4: ADK runner invoked but Gemini returns 429 reports adkRunnerInvoked true", async () => {
    setAdkRunnerOverride(
      mockAdkRunner(async () => {
        throw new GeminiClientError(
          "GEMINI_QUOTA_EXHAUSTED",
          "Gemini HTTP 429",
          429,
          undefined,
          { adkRunnerInvoked: true, operationalRetries: 0, geminiCallCount: 1 },
        );
      }),
    );

    const worker = new AdkGeminiWorker();

    const report = await worker.execute({
      contract: testContract(),
      sandboxRoot: process.cwd(),
      workspaceRoot: process.cwd(),
      sourceRevision: "rev",
      attemptNumber: 1,
    });

    expect(report.error?.code).toBe("GEMINI_QUOTA_EXHAUSTED");
    expect(report.usageMetadata?.adkRunnerInvoked).toBe(1);
  });

  test("LIVE-429-5: operational retry inside worker succeeds with 0 corrections", async () => {
    let geminiCalls = 0;
    setAdkRunnerOverride({
      isConfigured: () => true,
      run: async () => {
        let operationalRetries = 0;
        for (let attempt = 0; attempt <= 3; attempt++) {
          geminiCalls += 1;
          try {
            if (geminiCalls === 1) {
              throw new GeminiClientError("GEMINI_QUOTA_EXHAUSTED", "Gemini HTTP 429", 429);
            }
            return {
              text: JSON.stringify({
                summary: "Updated workspace copy",
                changedFiles: [
                  {
                    path: PASS_DEMO_TARGET_RELATIVE,
                    content: `<p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">Sandbox workspace requires approval for sensitive actions.</p>`,
                  },
                ],
              }),
              model: "gemini-3.6-flash",
              latencyMs: 5,
              operationalRetries,
              geminiCallCount: geminiCalls,
              adkRunnerInvoked: true as const,
              adkAgentName: "buildloop_coding_worker",
            };
          } catch (error) {
            operationalRetries = attempt + 1;
            if (attempt >= 3) {
              throw error;
            }
          }
        }
        throw new Error("unreachable");
      },
    });

    const orchestrator = new BootstrapOrchestrator({
      workspaceRoot: workspaceRoot(),
      worker: new AdkGeminiWorker(),
    });
    const result = await orchestrator.runPassDemo();

    expect(result.run.verdict).toBe("PASS");
    expect(result.run.counters.correctionCount).toBe(0);
    expect(result.run.counters.workerCalls).toBe(1);
    expect(geminiCalls).toBe(2);
    expect(result.workerReports[0]?.usageMetadata?.operationalRetries).toBe(1);
  }, ORCHESTRATOR_TEST_TIMEOUT_MS);

  test("LIVE-SEMANTIC-1: patch with failing acceptance may consume automatic correction", async () => {
    setAdkRunnerOverride(
      mockAdkRunner(async (request) => {
        const isCorrection = request.userPrompt.includes("Correction feedback");
        if (!isCorrection) {
          return {
            text: JSON.stringify({
              summary: "Incomplete copy",
              changedFiles: [
                {
                  path: "src/components/site/app-shell.tsx",
                  content: `<p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">Missing keywords.</p>`,
                },
              ],
            }),
            model: "gemini-3.6-flash",
            latencyMs: 1,
            operationalRetries: 0,
            geminiCallCount: 1,
            adkRunnerInvoked: true,
            adkAgentName: "buildloop_coding_worker",
          };
        }
        return {
          text: JSON.stringify({
            summary: "Fixed copy",
            changedFiles: [
              {
                path: "src/components/site/app-shell.tsx",
                content: `<p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">Sandbox workspace requires approval for sensitive actions.</p>`,
              },
            ],
          }),
          model: "gemini-3.6-flash",
          latencyMs: 1,
          operationalRetries: 0,
          geminiCallCount: 1,
          adkRunnerInvoked: true,
          adkAgentName: "buildloop_coding_worker",
        };
      }),
    );

    const orchestrator = new BootstrapOrchestrator({
      workspaceRoot: workspaceRoot(),
      worker: new AdkGeminiWorker(),
    });
    const result = await orchestrator.runPassDemo();

    expect(result.run.verdict).toBe("PASS");
    expect(result.run.counters.correctionCount).toBeGreaterThan(0);
    expect(result.decisionLog.some((entry) => entry.rule === "CORRECTION_ALLOWED")).toBe(true);
    expect(result.decisionLog.some((entry) => entry.rule === "OPERATIONAL_FAILURE")).toBe(false);
  }, ORCHESTRATOR_TEST_TIMEOUT_MS);
});
