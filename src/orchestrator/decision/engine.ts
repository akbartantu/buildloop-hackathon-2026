import type { SecurityReviewVerdict } from "../agents/security-reviewer/reviewer";
import type { CheckerEvidence, RunStatus, Verdict } from "../types";
import type { CheckerResult } from "../checker/deterministic-checker";

export type DecisionOutcome =
  | "CONTINUE"
  | "AUTO_APPROVED"
  | "CORRECTION_ALLOWED"
  | "AWAITING_APPROVAL"
  | "PASS"
  | "FAILED"
  | "BLOCKED";

export type DecisionInput = {
  currentStatus: RunStatus;
  preflightSafe: boolean;
  checkerResult: CheckerResult | null;
  correctionCount: number;
  maximumCorrections: number;
  sourceStale: boolean;
  securityReviewVerdict?: SecurityReviewVerdict | null;
  runtimeEscalation?: "AWAITING_APPROVAL" | "BLOCKED" | null;
};

export type DecisionOutput = {
  nextStatus: RunStatus;
  verdict: Verdict;
  verdictReason: string | null;
  rule: string;
  outcome: DecisionOutcome;
  shouldInvokeWorker: boolean;
  shouldInvokeChecker: boolean;
  shouldCorrect: boolean;
  correctionInstruction: string | null;
};

function baseOutput(
  partial: Omit<DecisionOutput, "outcome"> & { outcome?: DecisionOutcome },
): DecisionOutput {
  return { outcome: "CONTINUE", ...partial };
}

export function decide(input: DecisionInput): DecisionOutput {
  if (input.sourceStale) {
    return baseOutput({
      nextStatus: "STALE",
      verdict: null,
      verdictReason: "Workspace manifest revision changed during run.",
      rule: "SOURCE_REVISION_CHANGED",
      outcome: "BLOCKED",
      shouldInvokeWorker: false,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    });
  }

  if (!input.preflightSafe) {
    return baseOutput({
      nextStatus: "BLOCKED",
      verdict: "BLOCKED",
      verdictReason: "Preflight policy detected forbidden intent.",
      rule: "PREFLIGHT_BLOCKED",
      outcome: "BLOCKED",
      shouldInvokeWorker: false,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    });
  }

  if (!input.checkerResult) {
    return baseOutput({
      nextStatus: "RUNNING",
      verdict: null,
      verdictReason: null,
      rule: "READY_FOR_WORKER",
      outcome: "CONTINUE",
      shouldInvokeWorker: true,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    });
  }

  if (input.runtimeEscalation === "BLOCKED") {
    return baseOutput({
      nextStatus: "BLOCKED",
      verdict: "BLOCKED",
      verdictReason: "Runtime policy detected prohibited action.",
      rule: "RUNTIME_ESCALATION_BLOCKED",
      outcome: "BLOCKED",
      shouldInvokeWorker: false,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    });
  }

  if (input.runtimeEscalation === "AWAITING_APPROVAL") {
    return baseOutput({
      nextStatus: "AWAITING_APPROVAL",
      verdict: null,
      verdictReason: "Sensitive action discovered during execution — human approval required.",
      rule: "RUNTIME_ESCALATION_APPROVAL",
      outcome: "AWAITING_APPROVAL",
      shouldInvokeWorker: false,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    });
  }

  if (input.checkerResult.blocked) {
    return baseOutput({
      nextStatus: "BLOCKED",
      verdict: "BLOCKED",
      verdictReason: "Checker detected protected or forbidden change.",
      rule: "CHECKER_BLOCKED",
      outcome: "BLOCKED",
      shouldInvokeWorker: false,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    });
  }

  if (input.checkerResult.operationalFailure) {
    return baseOutput({
      nextStatus: "FAILED",
      verdict: "FAILED",
      verdictReason:
        input.checkerResult.evidence.find((item) => item.name === "worker_operational_error")
          ?.details ?? "Gemini/ADK operational failure.",
      rule: "OPERATIONAL_FAILURE",
      outcome: "FAILED",
      shouldInvokeWorker: false,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    });
  }

  if (input.checkerResult.passed) {
    const securityVerdict = input.securityReviewVerdict;
    if (securityVerdict === "BLOCKED") {
      return baseOutput({
        nextStatus: "BLOCKED",
        verdict: "BLOCKED",
        verdictReason: "Security reviewer blocked high-risk findings.",
        rule: "SECURITY_REVIEW_BLOCKED",
        outcome: "BLOCKED",
        shouldInvokeWorker: false,
        shouldInvokeChecker: false,
        shouldCorrect: false,
        correctionInstruction: null,
      });
    }
    if (securityVerdict === "REQUIRES_APPROVAL") {
      return baseOutput({
        nextStatus: "AWAITING_APPROVAL",
        verdict: null,
        verdictReason: "High-risk security finding requires human approval.",
        rule: "SECURITY_REVIEW_REQUIRES_APPROVAL",
        outcome: "AWAITING_APPROVAL",
        shouldInvokeWorker: false,
        shouldInvokeChecker: false,
        shouldCorrect: false,
        correctionInstruction: null,
      });
    }
    if (securityVerdict === "CORRECTABLE") {
      if (input.correctionCount < input.maximumCorrections) {
        return baseOutput({
          nextStatus: "NEEDS_CORRECTION",
          verdict: null,
          verdictReason: "Security finding is correctable within correction limit.",
          rule: "SECURITY_CORRECTION_ALLOWED",
          outcome: "CORRECTION_ALLOWED",
          shouldInvokeWorker: true,
          shouldInvokeChecker: false,
          shouldCorrect: true,
          correctionInstruction: "Address security reviewer findings without expanding scope.",
        });
      }
      return baseOutput({
        nextStatus: "FAILED",
        verdict: "FAILED",
        verdictReason: "Security findings remain after correction limit.",
        rule: "SECURITY_CORRECTION_LIMIT",
        outcome: "FAILED",
        shouldInvokeWorker: false,
        shouldInvokeChecker: false,
        shouldCorrect: false,
        correctionInstruction: null,
      });
    }
    return baseOutput({
      nextStatus: "AWAITING_APPROVAL",
      verdict: "PASS",
      verdictReason: "All checks passed. Awaiting human approval for delivery actions.",
      rule: "CHECKS_PASSED",
      outcome: "PASS",
      shouldInvokeWorker: false,
      shouldInvokeChecker: false,
      shouldCorrect: false,
      correctionInstruction: null,
    });
  }

  if (input.correctionCount < input.maximumCorrections) {
    return baseOutput({
      nextStatus: "NEEDS_CORRECTION",
      verdict: null,
      verdictReason: "Acceptance or quality checks failed; correction allowed.",
      rule: "CORRECTION_ALLOWED",
      outcome: "CORRECTION_ALLOWED",
      shouldInvokeWorker: true,
      shouldInvokeChecker: false,
      shouldCorrect: true,
      correctionInstruction: buildCorrectionInstruction(input.checkerResult.evidence),
    });
  }

  return baseOutput({
    nextStatus: "FAILED",
    verdict: "FAILED",
    verdictReason: "Correction limit reached with remaining check failures.",
    rule: "CORRECTION_LIMIT",
    outcome: "FAILED",
    shouldInvokeWorker: false,
    shouldInvokeChecker: false,
    shouldCorrect: false,
    correctionInstruction: null,
  });
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
