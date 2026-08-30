import { afterEach, describe, expect, test } from "bun:test";

import { AdkGeminiWorker } from "../adk/gemini-agent";
import { setAdkRunnerOverride } from "../adk/runner";
import { GeminiClientError } from "../gemini/client";
import { createDraftContract, lockContract } from "../contract/schema";
import { decide } from "../decision/engine";
import type { CheckerResult } from "../checker/deterministic-checker";
import { DEFAULT_OPERATIONAL_RETRY, runWithOperationalRetry } from "../gemini/retry-policy";

describe("W16 — Gemini timeout regression", () => {
  afterEach(() => {
    setAdkRunnerOverride(null);
  });

  test("timeout is detected with bounded retry, no infinite loop", async () => {
    let callCount = 0;
    await expect(
      runWithOperationalRetry(
        async () => {
          callCount += 1;
          throw new GeminiClientError("GEMINI_TIMEOUT", "Gemini request timed out.");
        },
        { ...DEFAULT_OPERATIONAL_RETRY, maxRetries: 1, baseDelayMs: 1, maxTotalWaitMs: 20, jitterMs: 0 },
      ),
    ).rejects.toMatchObject({ code: "GEMINI_OPERATIONAL_FAILURE" });
    expect(callCount).toBe(2);
  });

  test("timeout worker error triggers operational failure without correction", () => {
    const timeoutChecker: CheckerResult = {
      evidence: [],
      blocked: false,
      failed: true,
      passed: false,
      operationalFailure: true,
    };

    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: timeoutChecker,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
    });

    expect(result.verdict).toBe("FAILED");
    expect(result.rule).toBe("OPERATIONAL_FAILURE");
    expect(result.shouldCorrect).toBe(false);
  });

  test("AdkGeminiWorker surfaces timeout without claiming success", async () => {
    setAdkRunnerOverride({
      isConfigured: () => true,
      run: async () => {
        throw new GeminiClientError("GEMINI_TIMEOUT", "Gemini request timed out.");
      },
    });

    const worker = new AdkGeminiWorker();
    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: "Timeout test",
        inScope: ["src/**"],
        outOfScope: [],
        acceptanceCriteria: ["Should fail"],
        allowedPaths: ["src/**"],
      }),
    );

    const report = await worker.execute({
      contract,
      sandboxRoot: process.cwd(),
      workspaceRoot: process.cwd(),
      sourceRevision: "test",
      attemptNumber: 1,
    });

    expect(report.error?.code).toBe("GEMINI_TIMEOUT");
    expect(report.filesChanged).toHaveLength(0);
    expect(report.summary).not.toMatch(/berhasil|success|passed/i);
  });
});
