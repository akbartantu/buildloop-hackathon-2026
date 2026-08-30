import type { CheckerEvidence, RunStatus, Verdict } from "../types";
import type { CheckerResult } from "../checker/deterministic-checker";

export type DecisionInput = {
  currentStatus: RunStatus;
  preflightSafe: boolean;
  checkerResult: CheckerResult | null;
  correctionCount: number;
  maximumCorrections: number;
  sourceStale: boolean;
};

export type DecisionOutput = {
  nextStatus: RunStatus;
  verdict: Verdict;
  verdictReason: string | null;
  rule: string;
  shouldInvokeWorker: boolean;
  shouldInvokeChecker: boolean;
  shouldCorrect: boolean;
  correctionInstruction: string | null;
};

export function decide(input: DecisionInput): DecisionOutput {
  if (input.sourceStale) {
    return {
      nextStatus: "STALE",
      verdict: null,
      verdictReason: "Workspace manifest revision changed during run.",
      rule: "SOURCE_REVISION_CHANGED",
      shouldInvokeWorker: false,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    };
  }

  if (!input.preflightSafe) {
    return {
      nextStatus: "BLOCKED",
      verdict: "BLOCKED",
      verdictReason: "Preflight policy detected forbidden intent.",
      rule: "PREFLIGHT_BLOCKED",
      shouldInvokeWorker: false,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    };
  }

  if (!input.checkerResult) {
    return {
      nextStatus: "RUNNING",
      verdict: null,
      verdictReason: null,
      rule: "READY_FOR_WORKER",
      shouldInvokeWorker: true,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    };
  }

  if (input.checkerResult.blocked) {
    return {
      nextStatus: "BLOCKED",
      verdict: "BLOCKED",
      verdictReason: "Checker detected protected or forbidden change.",
      rule: "CHECKER_BLOCKED",
      shouldInvokeWorker: false,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    };
  }

  if (input.checkerResult.operationalFailure) {
    return {
      nextStatus: "FAILED",
      verdict: "FAILED",
      verdictReason:
        input.checkerResult.evidence.find((item) => item.name === "worker_operational_error")
          ?.details ?? "Gemini/ADK operational failure.",
      rule: "OPERATIONAL_FAILURE",
      shouldInvokeWorker: false,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    };
  }

  if (input.checkerResult.passed) {
    return {
      nextStatus: "AWAITING_APPROVAL",
      verdict: "PASS",
      verdictReason: "All checks passed. Awaiting human approval for delivery actions.",
      rule: "CHECKS_PASSED",
      shouldInvokeWorker: false,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    };
  }

  if (input.correctionCount < input.maximumCorrections) {
    return {
      nextStatus: "NEEDS_CORRECTION",
      verdict: null,
      verdictReason: "Acceptance or quality checks failed; correction allowed.",
      rule: "CORRECTION_ALLOWED",
      shouldInvokeWorker: true,
      shouldInvokeChecker: false,
      shouldCorrect: true,
      correctionInstruction: buildCorrectionInstruction(input.checkerResult.evidence),
    };
  }

  return {
    nextStatus: "FAILED",
    verdict: "FAILED",
    verdictReason: "Correction limit reached with remaining check failures.",
    rule: "CORRECTION_LIMIT",
    shouldInvokeWorker: false,
    shouldInvokeChecker: false,
    shouldCorrect: false,
    correctionInstruction: null,
  };
}

function buildCorrectionInstruction(evidence: CheckerEvidence[]): string {
  const failures = evidence.filter((item) => item.status === "fail");
  if (failuresEmpty(failures)) {
    return "Address remaining check failures without expanding scope.";
  }
  return failures
    .map((item) => `${item.name}: ${item.summary}`)
    .join(" | ");
}

function failuresEmpty(failures: CheckerEvidence[]): boolean {
  return failures.length === 0;
}

export function transitionStatus(current: RunStatus, event: "inspect" | "worker_done" | "check_done"): RunStatus {
  const table: Record<RunStatus, Partial<Record<typeof event, RunStatus>>> = {
    DRAFT: {},
    CONTRACT_READY: {},
    APPROVED_FOR_EXECUTION: { inspect: "INSPECTING" },
    INSPECTING: { worker_done: "RUNNING" },
    RUNNING: { check_done: "CHECKING" },
    CHECKING: {},
    NEEDS_CORRECTION: { worker_done: "RUNNING" },
    PASS: {},
    FAILED: {},
    BLOCKED: {},
    AWAITING_APPROVAL: {},
    CLOSED: {},
    STALE: {},
  };
  return table[current][event] ?? current;
}
