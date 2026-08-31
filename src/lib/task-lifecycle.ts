import type { TaskStatus } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { isActiveRun } from "@/lib/contract-handoff";
import {
  analyzeFinalChecks,
  buildEvidenceHistory,
  deriveCorrectionPresentation,
  type CorrectionPhase,
  type CorrectionPresentation,
} from "@/lib/evidence-analysis";
import { ORCHESTRATION_STEPS } from "@/lib/task-display";
import {
  deriveApprovalRecommendation,
  type ApprovalRecommendationView,
} from "@/lib/approval-recommendation";
import { translate, type Locale, DEFAULT_LOCALE } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import { formatChecksFriendlySummary } from "@/lib/lifecycle-presentations";
import { buildRunProgressViewModel, type RunProgressViewModel } from "@/lib/lifecycle-progress";
import {
  buildAttemptHistoryViewModels,
  buildCurrentRunTimingViewModel,
  type AttemptHistoryViewModel,
  type RunTimingViewModel,
} from "@/lib/run-timing-presentation";
import {
  buildEvidenceSummaryViewModel,
  type EvidenceSummaryViewModel,
} from "@/lib/evidence-summary";
import { formatPrimaryBlockedExplanation } from "@/lib/blocked-reason-presentation";
import { isCommitApprovedForCurrentRun } from "@/lib/delivery-artifact-gate";
import {
  isPendingProtectedPathApproval,
  isProtectedPathApprovalStop,
} from "@/lib/protected-path-approval-flow";

export type ImplementationVerdict = "PASS" | "FAILED" | "BLOCKED" | null;

export type LifecycleStepState =
  | "complete"
  | "active"
  | "not_needed"
  | "not_run"
  | "blocked"
  | "failed";

export type DeliveryActionState =
  | "NOT_REQUESTED"
  | "NOT_APPROVED"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "EXECUTED"
  | "FAILED";

export type CheckBreakdown = {
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  total: number;
  allRequiredSatisfied: boolean;
  friendlySummary: string;
  technicalSummary: string;
};

export type OrchestrationStepView = {
  key: string;
  label: string;
  detail: string;
  state: LifecycleStepState;
};

export type TaskLifecycleViewModel = {
  taskStatus: TaskStatus;
  hasRun: boolean;
  runCompleted: boolean;
  implementationVerdict: ImplementationVerdict;
  workerAttemptNumber: number;
  workerAttemptLimit: number;
  correctionsUsed: number;
  correctionLimit: number;
  correction: CorrectionPresentation;
  correctionPhase: CorrectionPhase;
  evidenceHistory: ReturnType<typeof buildEvidenceHistory>;
  attemptHistory: AttemptHistoryViewModel[];
  currentRunTiming: RunTimingViewModel | null;
  checks: CheckBreakdown;
  orchestrationSteps: OrchestrationStepView[];
  orchestrationUserSummary: string;
  delivery: {
    commit: DeliveryActionState;
    push: DeliveryActionState;
    merge: DeliveryActionState;
    deploy: DeliveryActionState;
  };
  deliveryLabels: {
    commit: string;
    push: string;
    merge: string;
    deploy: string;
  };
  plainLanguageSummary: string;
  executionCompleteLabel: string | null;
  isClosed: boolean;
  showOrchestratorNotStarted: boolean;
  isPassLike: boolean;
  isBlocked: boolean;
  nextAction: string;
  approval: ApprovalRecommendationView;
  progress: RunProgressViewModel;
  evidenceSummary: EvidenceSummaryViewModel | null;
};

const POST_RUN_STATUSES: TaskStatus[] = [
  "PASS",
  "AWAITING_APPROVAL",
  "FAILED",
  "CLOSED",
];

export function taskHasRun(task: TaskRecord): boolean {
  if (task.runnerState?.runnerInvoked) {
    return true;
  }
  return [
    "INSPECTING",
    "RUNNING",
    "CHECKING",
    "NEEDS_CORRECTION",
    "PASS",
    "AWAITING_APPROVAL",
    "FAILED",
    "BLOCKED",
    "CLOSED",
  ].includes(task.status);
}

export function analyzeChecks(task: TaskRecord, locale: Locale = DEFAULT_LOCALE): CheckBreakdown {
  const evidence = task.runnerState?.evidence ?? [];
  const passed = evidence.filter((item) => item.status === "pass").length;
  const failed = evidence.filter((item) => item.status === "fail").length;
  const skipped = evidence.filter((item) => item.status === "skipped").length;
  const blocked = evidence.filter((item) => item.status === "blocked").length;
  const total = evidence.length;
  const allRequiredSatisfied = failed === 0 && blocked === 0;

  const friendlySummary = formatChecksFriendlySummary(
    { passed, failed, skipped, blocked, total, allRequiredSatisfied },
    locale,
  );

  const technicalSummary =
    total > 0
      ? `${passed} passed · ${failed} failed · ${skipped} skipped · ${blocked} blocked`
      : "—";

  return {
    passed,
    failed,
    skipped,
    blocked,
    total,
    allRequiredSatisfied,
    friendlySummary,
    technicalSummary,
  };
}

function deriveImplementationVerdict(task: TaskRecord, checks: CheckBreakdown): ImplementationVerdict {
  if (isPendingProtectedPathApproval(task) || isProtectedPathApprovalStop(task)) {
    return null;
  }
  if (task.status === "BLOCKED") {
    return "BLOCKED";
  }
  if (task.status === "FAILED") {
    return "FAILED";
  }
  if (task.runnerState?.rejected) {
    return null;
  }
  if (!task.runnerState?.runnerInvoked) {
    return null;
  }
  if (checks.total > 0 && !checks.allRequiredSatisfied) {
    return null;
  }
  if (POST_RUN_STATUSES.includes(task.status)) {
    if (task.status === "AWAITING_APPROVAL" && isProtectedPathApprovalStop(task)) {
      return null;
    }
    return "PASS";
  }
  return null;
}

function deriveDeliveryStates(task: TaskRecord): TaskLifecycleViewModel["delivery"] {
  const runner = task.runnerState;

  const commit: DeliveryActionState = runner?.commit
    ? "EXECUTED"
    : isCommitApprovedForCurrentRun(runner)
      ? "APPROVED"
      : task.status === "AWAITING_APPROVAL" || task.status === "PASS"
        ? "AWAITING_APPROVAL"
        : "NOT_APPROVED";

  return {
    commit,
    push: runner?.push ? "EXECUTED" : "NOT_APPROVED",
    merge: "NOT_APPROVED",
    deploy: "NOT_APPROVED",
  };
}

export function deliveryActionLabel(
  state: DeliveryActionState,
  actionName: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  switch (state) {
    case "NOT_REQUESTED":
      return translate(locale, "lifecycle.delivery.notRequested");
    case "NOT_APPROVED":
      return translate(locale, "lifecycle.delivery.notApproved");
    case "AWAITING_APPROVAL":
      return translate(locale, "lifecycle.delivery.awaitingApproval");
    case "APPROVED":
      return translate(locale, "lifecycle.delivery.approvedPending", { action: actionName });
    case "EXECUTED":
      return translate(locale, "lifecycle.delivery.executed", { action: actionName });
    case "FAILED":
      return translate(locale, "lifecycle.delivery.failed", { action: actionName });
  }
}

function buildOrchestrationSteps(
  task: TaskRecord,
  hasRun: boolean,
  verdict: ImplementationVerdict,
  locale: Locale = DEFAULT_LOCALE,
): OrchestrationStepView[] {
  const runner = task.runnerState;
  const corrections = runner?.correctionCount ?? 0;
  const correctionLimit = task.contract.maxAttempts;
  const blockedPreflight = task.status === "BLOCKED" && !runner?.runnerInvoked;
  const runFinished =
    hasRun &&
    (POST_RUN_STATUSES.includes(task.status) ||
      verdict === "PASS" ||
      verdict === "FAILED" ||
      verdict === "BLOCKED");

  const translateStep = (key: string): OrchestrationStepView => {
    const labelKey = `lifecycle.orchestrationStep.${key}.label` as TranslationKey;
    const detailKey = `lifecycle.orchestrationStep.${key}.detail` as TranslationKey;
    return {
      key,
      label: translate(locale, labelKey),
      detail: translate(locale, detailKey),
      state: "not_run" as LifecycleStepState,
    };
  };

  const stepTemplate = (key: string, state: LifecycleStepState, detailOverride?: string) => {
    const base = translateStep(key);
    let detail = detailOverride ?? base.detail;
    if (key === "correction") {
      if (state === "not_needed") {
        detail = translate(locale, "lifecycle.correction.stepNotNeeded");
      } else if (corrections > 0 || state === "active") {
        detail = translate(locale, "lifecycle.correction.stepProgress", {
          used: corrections > 0 ? corrections : 1,
          limit: correctionLimit,
        });
      }
    }
    return { ...base, state, detail };
  };

  if (blockedPreflight) {
    return ORCHESTRATION_STEPS.map((step) =>
      stepTemplate(
        step.key,
        step.key === "preflight" || step.key === "planning" ? "blocked" : "not_run",
      ),
    );
  }

  if (isPendingProtectedPathApproval(task) || isProtectedPathApprovalStop(task)) {
    return ORCHESTRATION_STEPS.map((step) => {
      const workerDetail =
        step.key === "worker"
          ? translate(locale, "lifecycle.orchestrationStep.worker.detailProtectedPathPause")
          : undefined;
      const state =
        step.key === "planning" || step.key === "preflight"
          ? "complete"
          : step.key === "worker"
            ? "active"
            : step.key === "correction"
              ? "not_needed"
              : "not_run";
      return stepTemplate(step.key, state, workerDetail);
    });
  }

  if (!hasRun) {
    const planningDone = Boolean(runner?.orchestration?.plannerOutput);
    return ORCHESTRATION_STEPS.map((step) =>
      stepTemplate(
        step.key,
        step.key === "planning" && planningDone
          ? "complete"
          : step.key === "planning" && task.status === "CONTRACT_READY"
            ? "active"
            : "not_run",
      ),
    );
  }

  const workerDone = Boolean(runner?.runnerInvoked);
  const securityInvoked = Boolean(runner?.orchestration?.securityReviewInvoked);
  const checkingOrLater =
    workerDone &&
    !["INSPECTING", "RUNNING"].includes(task.status) &&
    (runFinished || task.status === "CHECKING" || isActiveRun(task.status));

  const correctionState: LifecycleStepState = (() => {
    if (corrections > 0) return "complete";
    if (runFinished) return "not_needed";
    if (task.status === "NEEDS_CORRECTION") return "active";
    return workerDone ? "not_needed" : "not_run";
  })();

  const securityState: LifecycleStepState = (() => {
    if (isProtectedPathApprovalStop(task)) return "not_run";
    if (!securityInvoked) return runFinished ? "not_needed" : "not_run";
    if (runFinished || task.status === "AWAITING_APPROVAL" || task.status === "PASS") return "complete";
    if (task.status === "CHECKING") return "active";
    return "not_run";
  })();

  const decisionState: LifecycleStepState = (() => {
    if (isProtectedPathApprovalStop(task)) return "not_run";
    if (verdict === "FAILED") return "failed";
    if (verdict === "BLOCKED") return "blocked";
    if (verdict === "PASS" || runFinished) return "complete";
    if (task.status === "CHECKING") return "active";
    return "not_run";
  })();

  return ORCHESTRATION_STEPS.map((step) => {
    let state: LifecycleStepState = "not_run";
    if (step.key === "planning") {
      state = "complete";
    } else if (step.key === "preflight") {
      if (task.status === "INSPECTING") state = "active";
      else if (hasRun) state = "complete";
    } else if (step.key === "worker") {
      if (isProtectedPathApprovalStop(task)) state = "active";
      else if (task.status === "RUNNING" || task.status === "NEEDS_CORRECTION") state = "active";
      else if (workerDone) state = "complete";
    } else if (step.key === "checker") {
      if (isProtectedPathApprovalStop(task)) state = "not_run";
      else if (task.status === "CHECKING") state = "active";
      else if (checkingOrLater) state = "complete";
    } else if (step.key === "security") {
      state = securityState;
    } else if (step.key === "correction") {
      state = correctionState;
    } else if (step.key === "decision") {
      state = decisionState;
    }
    return stepTemplate(step.key, state);
  });
}

function buildPlainLanguageSummary(
  task: TaskRecord,
  verdict: ImplementationVerdict,
  checks: CheckBreakdown,
  delivery: TaskLifecycleViewModel["delivery"],
  locale: Locale,
): string {
  if (task.status === "BLOCKED") {
    return formatPrimaryBlockedExplanation(
      task.blockedReasons,
      locale,
      "lifecycle.summary.blockedDefault",
    );
  }
  if (task.status === "FAILED") {
    return translate(locale, "lifecycle.summary.failedAfterLimit");
  }
  if (verdict === "PASS" && task.status === "CLOSED" && delivery.commit === "APPROVED") {
    return translate(locale, "lifecycle.summary.passClosedCommit");
  }
  if (verdict === "PASS" && task.status === "AWAITING_APPROVAL") {
    return translate(locale, "lifecycle.summary.passAwaitingApproval");
  }
  if (verdict === "PASS") {
    return checks.friendlySummary;
  }
  if (isActiveRun(task.status)) {
    return translate(locale, "lifecycle.summary.running");
  }
  if (task.status === "APPROVED_FOR_EXECUTION") {
    return translate(locale, "lifecycle.summary.approvedReady");
  }
  return translate(locale, "lifecycle.summary.default");
}

function buildOrchestrationUserSummary(
  task: TaskRecord,
  correction: CorrectionPresentation,
  verdict: ImplementationVerdict,
  locale: Locale,
  correctionsUsed: number,
  correctionLimit: number,
): string {
  if (correction.userSummary) {
    return correction.userSummary;
  }
  if (task.status === "BLOCKED") {
    return formatPrimaryBlockedExplanation(
      task.blockedReasons,
      locale,
      "lifecycle.summary.blockedDefault",
    );
  }
  if (task.status === "FAILED") {
    return translate(locale, "lifecycle.summary.correctionExhausted");
  }
  if (isActiveRun(task.status)) {
    if (task.status === "CHECKING") {
      return translate(locale, "lifecycle.summary.runningChecking");
    }
    if (task.status === "INSPECTING") {
      return translate(locale, "lifecycle.summary.runningPreflight");
    }
    if (correctionsUsed > 0 || task.status === "NEEDS_CORRECTION" || task.status === "RUNNING") {
      return translate(locale, "lifecycle.summary.runningWithCorrections", {
        used: correctionsUsed,
        limit: correctionLimit,
      });
    }
    return translate(locale, "lifecycle.summary.runningGeneric");
  }
  if (verdict === "PASS") {
    return translate(locale, "lifecycle.summary.allFinalPassed");
  }
  if (task.status === "APPROVED_FOR_EXECUTION" && task.runnerState?.revisionRequested) {
    return translate(locale, "lifecycle.correction.humanRevisionReady");
  }
  return translate(locale, "lifecycle.summary.default");
}

export function buildTaskLifecycleViewModel(
  task: TaskRecord,
  locale: Locale = DEFAULT_LOCALE,
): TaskLifecycleViewModel {
  const hasRun = taskHasRun(task);
  const checks = analyzeFinalChecks(task, locale);
  const verdict = deriveImplementationVerdict(task, checks);
  const correction = deriveCorrectionPresentation(task, checks, verdict, locale);
  const evidenceHistory = buildEvidenceHistory(task);
  const attemptHistory = buildAttemptHistoryViewModels(task, locale);
  const currentRunTiming = buildCurrentRunTimingViewModel(task, locale);
  const delivery = deriveDeliveryStates(task);
  const runner = task.runnerState;
  const correctionLimit = task.contract.maxAttempts;
  const correctionsUsed = runner?.correctionCount ?? 0;
  const workerAttemptNumber = runner?.runnerInvoked ? correctionsUsed + 1 : 0;
  const workerAttemptLimit = correctionLimit + 1;
  const isClosed = task.status === "CLOSED";
  const runCompleted = hasRun && POST_RUN_STATUSES.includes(task.status);
  const showOrchestratorNotStarted = !hasRun && task.status !== "BLOCKED";

  const deliveryLabels = {
    commit: deliveryActionLabel(delivery.commit, "Commit", locale),
    push: deliveryActionLabel(delivery.push, "Push", locale),
    merge: deliveryActionLabel(delivery.merge, "Merge", locale),
    deploy: deliveryActionLabel(delivery.deploy, "Deploy", locale),
  };

  const orchestrationSteps = buildOrchestrationSteps(task, hasRun, verdict, locale);

  const viewModel: Omit<TaskLifecycleViewModel, "approval" | "progress" | "evidenceSummary"> = {
    taskStatus: task.status,
    hasRun,
    runCompleted,
    implementationVerdict: verdict,
    workerAttemptNumber,
    workerAttemptLimit,
    correctionsUsed,
    correctionLimit,
    correction,
    correctionPhase: correction.phase,
    checks,
    evidenceHistory,
    attemptHistory,
    currentRunTiming,
    orchestrationSteps,
    orchestrationUserSummary: buildOrchestrationUserSummary(
      task,
      correction,
      verdict,
      locale,
      correctionsUsed,
      correctionLimit,
    ),
    delivery,
    deliveryLabels,
    plainLanguageSummary: buildPlainLanguageSummary(task, verdict, checks, delivery, locale),
    executionCompleteLabel: isClosed ? translate(locale, "lifecycle.summary.executionComplete") : null,
    isClosed,
    showOrchestratorNotStarted,
    isPassLike: verdict === "PASS",
    isBlocked: task.status === "BLOCKED",
    nextAction:
      task.status === "CLOSED" && delivery.commit === "APPROVED"
        ? translate(locale, "lifecycle.summary.commitRecorded")
        : task.status === "AWAITING_APPROVAL"
          ? translate(locale, "lifecycle.summary.awaitingApprovalAction")
          : "",
  };

  return {
    ...viewModel,
    approval: deriveApprovalRecommendation(task, viewModel, locale),
    progress: buildRunProgressViewModel(
      task,
      orchestrationSteps,
      locale,
      Date.now(),
      correctionsUsed,
      correctionLimit,
    ),
    evidenceSummary: buildEvidenceSummaryViewModel(
      task,
      viewModel as unknown as TaskLifecycleViewModel,
      locale,
    ),
  };
}

/** Step index for legacy phase bar (0–4). */
export function lifecyclePhaseIndex(steps: OrchestrationStepView[]): number {
  const activeIndex = steps.findIndex((step) => step.state === "active");
  if (activeIndex >= 0) return activeIndex;
  const lastComplete = steps.reduce(
    (acc, step, index) => (step.state === "complete" || step.state === "not_needed" ? index : acc),
    0,
  );
  return lastComplete;
}

export function lifecycleStepIconState(state: LifecycleStepState): "done" | "active" | "neutral" | "blocked" {
  if (state === "complete" || state === "not_needed") return "done";
  if (state === "active") return "active";
  if (state === "blocked" || state === "failed") return "blocked";
  return "neutral";
}

export { formatLifecycleStepLabel, formatLifecycleStepStatus } from "@/lib/lifecycle-presentations";
