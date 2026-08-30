import { describe, expect, test } from "bun:test";

import { decide } from "../decision/engine";
import { executionApprovalGrantsCommit } from "../approval/model";
import { createApprovalRequest } from "../approval/model";
import type { CheckerResult } from "../checker/deterministic-checker";

const failingChecker: CheckerResult = {
  evidence: [{ id: "1", runId: "r", attemptNumber: 1, category: "test", name: "x", status: "fail", summary: "fail", details: "", affectedFiles: [], severity: "error", createdAt: "" }],
  blocked: false,
  failed: true,
  passed: false,
};

const passingChecker: CheckerResult = {
  evidence: [],
  blocked: false,
  failed: false,
  passed: true,
};

const blockedChecker: CheckerResult = {
  evidence: [],
  blocked: true,
  failed: false,
  passed: false,
};

describe("decision engine invariants", () => {
  test("hard violation (checker blocked) beats PASS claim", () => {
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: blockedChecker,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(result.verdict).toBe("BLOCKED");
    expect(result.rule).toBe("CHECKER_BLOCKED");
    expect(result.shouldInvokeWorker).toBe(false);
  });

  test("PASS only when checker passed", () => {
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: passingChecker,
      correctionCount: 1,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(result.verdict).toBe("PASS");
    expect(result.nextStatus).toBe("AWAITING_APPROVAL");
  });

  test("worker cannot set PASS — no checker result keeps run in worker phase", () => {
    const result = decide({
      currentStatus: "INSPECTING",
      preflightSafe: true,
      checkerResult: null,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(result.verdict).toBeNull();
    expect(result.shouldInvokeWorker).toBe(true);
    expect(result.nextStatus).toBe("RUNNING");
  });

  test("correction limit yields FAILED at maximum attempts", () => {
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: failingChecker,
      correctionCount: 2,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(result.verdict).toBe("FAILED");
    expect(result.rule).toBe("CORRECTION_LIMIT");
    expect(result.shouldCorrect).toBe(false);
    expect(result.shouldInvokeWorker).toBe(false);
  });

  test("third correction is not allowed when maximum is two", () => {
    const atLimit = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: failingChecker,
      correctionCount: 2,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(atLimit.nextStatus).toBe("FAILED");

    const belowLimit = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: failingChecker,
      correctionCount: 1,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(belowLimit.nextStatus).toBe("NEEDS_CORRECTION");
    expect(belowLimit.shouldCorrect).toBe(true);
  });

  test("source revision change yields STALE before checker verdict", () => {
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: passingChecker,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: true,
    });
    expect(result.nextStatus).toBe("STALE");
    expect(result.verdict).toBeNull();
    expect(result.shouldInvokeWorker).toBe(false);
  });

  test("preflight block prevents worker invocation", () => {
    const result = decide({
      currentStatus: "INSPECTING",
      preflightSafe: false,
      checkerResult: null,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(result.verdict).toBe("BLOCKED");
    expect(result.rule).toBe("PREFLIGHT_BLOCKED");
    expect(result.shouldInvokeWorker).toBe(false);
  });

  test("execution approval does not grant commit permission", () => {
    const request = createApprovalRequest({
      id: crypto.randomUUID(),
      runId: "run-1",
      action: "execute",
      requestedBy: "test",
      impactSummary: "Execute within contract",
    });
    const approved = { ...request, status: "approved" as const, decidedBy: "user", decidedAt: new Date().toISOString(), decisionReason: "ok" };
    expect(executionApprovalGrantsCommit(approved)).toBe(false);
  });
});
