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

export function analyzeChecks(task: TaskRecord): CheckBreakdown {
  const evidence = task.runnerState?.evidence ?? [];
  const passed = evidence.filter((item) => item.status === "pass").length;
  const failed = evidence.filter((item) => item.status === "fail").length;
  const skipped = evidence.filter((item) => item.status === "skipped").length;
  const blocked = evidence.filter((item) => item.status === "blocked").length;
  const total = evidence.length;
  const allRequiredSatisfied = failed === 0 && blocked === 0;

  let friendlySummary: string;
  if (total === 0) {
    friendlySummary = "Belum ada pemeriksaan.";
  } else if (allRequiredSatisfied && skipped > 0) {
    friendlySummary = `${passed} pemeriksaan lolos. ${skipped} tidak perlu dijalankan.`;
  } else if (allRequiredSatisfied) {
    friendlySummary = `Semua pemeriksaan wajib lolos (${passed} passed).`;
  } else {
    friendlySummary = `${passed} lolos, ${failed} gagal${skipped > 0 ? `, ${skipped} dilewati` : ""}.`;
  }

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
    return "PASS";
  }
  return null;
}

function deriveDeliveryStates(task: TaskRecord): TaskLifecycleViewModel["delivery"] {
  const runner = task.runnerState;

  const commit: DeliveryActionState = runner?.commit
    ? "EXECUTED"
    : runner?.commitApproved
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

export function deliveryActionLabel(state: DeliveryActionState, actionName: string): string {
  switch (state) {
    case "NOT_REQUESTED":
      return "Tidak diminta";
    case "NOT_APPROVED":
      return "Belum disetujui";
    case "AWAITING_APPROVAL":
      return "Menunggu approval Anda";
    case "APPROVED":
      return `${actionName} disetujui, belum dijalankan`;
    case "EXECUTED":
      return `${actionName} selesai`;
    case "FAILED":
      return `${actionName} gagal`;
  }
}

function buildOrchestrationSteps(
  task: TaskRecord,
  hasRun: boolean,
  verdict: ImplementationVerdict,
): OrchestrationStepView[] {
  const runner = task.runnerState;
  const corrections = runner?.correctionCount ?? 0;
  const blockedPreflight = task.status === "BLOCKED" && !runner?.runnerInvoked;
  const runFinished =
    hasRun &&
    (POST_RUN_STATUSES.includes(task.status) ||
      verdict === "PASS" ||
      verdict === "FAILED" ||
      verdict === "BLOCKED");

  if (blockedPreflight) {
    return ORCHESTRATION_STEPS.map((step) => ({
      ...step,
      state:
        step.key === "preflight"
          ? ("blocked" as const)
          : ("not_run" as const),
    }));
  }

  if (!hasRun) {
    return ORCHESTRATION_STEPS.map((step) => ({
      ...step,
      state: "not_run" as const,
    }));
  }

  const workerDone = Boolean(runner?.runnerInvoked);
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

  const decisionState: LifecycleStepState = (() => {
    if (verdict === "FAILED") return "failed";
    if (verdict === "BLOCKED") return "blocked";
    if (verdict === "PASS" || runFinished) return "complete";
    if (task.status === "CHECKING") return "active";
    return "not_run";
  })();

  return ORCHESTRATION_STEPS.map((step) => {
    let state: LifecycleStepState = "not_run";
    if (step.key === "preflight") {
      state = hasRun ? "complete" : "not_run";
    } else if (step.key === "worker") {
      if (task.status === "RUNNING" || task.status === "NEEDS_CORRECTION") state = "active";
      else if (workerDone) state = "complete";
    } else if (step.key === "checker") {
      if (task.status === "CHECKING") state = "active";
      else if (checkingOrLater) state = "complete";
    } else if (step.key === "correction") {
      state = correctionState;
    } else if (step.key === "decision") {
      state = decisionState;
    }
    return { ...step, state };
  });
}

function buildPlainLanguageSummary(
  task: TaskRecord,
  verdict: ImplementationVerdict,
  checks: CheckBreakdown,
  delivery: TaskLifecycleViewModel["delivery"],
): string {
  if (task.status === "BLOCKED") {
    return (
      task.blockedReasons[0]?.explanation ??
      "BuildLoop berhenti sebelum worker dijalankan karena guardrail."
    );
  }
  if (task.status === "FAILED") {
    return "Checker gagal setelah batas koreksi otomatis.";
  }
  if (verdict === "PASS" && task.status === "CLOSED" && delivery.commit === "APPROVED") {
    return "Eksekusi task selesai dengan PASS. Commit sudah disetujui, tetapi Git commit belum dijalankan oleh BuildLoop.";
  }
  if (verdict === "PASS" && task.status === "AWAITING_APPROVAL") {
    return "Perubahan sesuai contract. Commit, push, merge, dan deploy membutuhkan approval terpisah.";
  }
  if (verdict === "PASS") {
    return checks.friendlySummary;
  }
  if (isActiveRun(task.status)) {
    return "Orchestrator sedang berjalan — worker dan checker bekerja terpisah.";
  }
  if (task.status === "APPROVED_FOR_EXECUTION") {
    return "Contract disetujui. Orchestrator siap dijalankan.";
  }
  return "Lanjutkan alur task sesuai contract.";
}

function buildOrchestrationUserSummary(
  task: TaskRecord,
  correction: CorrectionPresentation,
  verdict: ImplementationVerdict,
): string {
  if (correction.userSummary) {
    return correction.userSummary;
  }
  if (task.status === "BLOCKED") {
    return (
      task.blockedReasons[0]?.explanation ??
      "BuildLoop berhenti sebelum worker dijalankan karena guardrail."
    );
  }
  if (task.status === "FAILED") {
    return "Perbaikan otomatis belum menyelesaikan masalah. Batas koreksi tercapai.";
  }
  if (isActiveRun(task.status)) {
    if (task.status === "CHECKING") {
      return "BuildLoop sedang memeriksa hasil worker.";
    }
    if (task.status === "INSPECTING") {
      return "BuildLoop menjalankan preflight sebelum worker.";
    }
    return "BuildLoop masih menjalankan atau memeriksa task.";
  }
  if (verdict === "PASS") {
    return "Semua pemeriksaan akhir lolos.";
  }
  if (task.status === "APPROVED_FOR_EXECUTION" && task.runnerState?.revisionRequested) {
    return "Anda meminta revisi. Jalankan orchestrator untuk siklus revisi baru.";
  }
  return "Lanjutkan alur task sesuai contract.";
}

export function buildTaskLifecycleViewModel(task: TaskRecord): TaskLifecycleViewModel {
  const hasRun = taskHasRun(task);
  const checks = analyzeFinalChecks(task);
  const verdict = deriveImplementationVerdict(task, checks);
  const correction = deriveCorrectionPresentation(task, checks, verdict);
  const evidenceHistory = buildEvidenceHistory(task);
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
    commit: deliveryActionLabel(delivery.commit, "Commit"),
    push: deliveryActionLabel(delivery.push, "Push"),
    merge: deliveryActionLabel(delivery.merge, "Merge"),
    deploy: deliveryActionLabel(delivery.deploy, "Deploy"),
  };

  const viewModel: Omit<TaskLifecycleViewModel, "approval"> = {
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
    orchestrationSteps: buildOrchestrationSteps(task, hasRun, verdict),
    orchestrationUserSummary: buildOrchestrationUserSummary(task, correction, verdict),
    delivery,
    deliveryLabels,
    plainLanguageSummary: buildPlainLanguageSummary(task, verdict, checks, delivery),
    executionCompleteLabel: isClosed ? "Eksekusi task selesai" : null,
    isClosed,
    showOrchestratorNotStarted,
    isPassLike: verdict === "PASS",
    isBlocked: task.status === "BLOCKED",
    nextAction: task.status === "CLOSED" && delivery.commit === "APPROVED"
      ? "Izin commit tercatat. Eksekusi Git commit otomatis belum tersedia dalam versi ini."
      : task.status === "AWAITING_APPROVAL"
        ? "Tinjau dan berikan approval untuk tindakan sensitif."
        : "",
  };

  return {
    ...viewModel,
    approval: deriveApprovalRecommendation(task, viewModel),
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

export function formatLifecycleStepLabel(state: LifecycleStepState): string {
  switch (state) {
    case "not_needed":
      return "Tidak diperlukan";
    case "not_run":
      return "Belum dijalankan";
    case "blocked":
      return "BLOCKED";
    case "failed":
      return "FAILED";
    default:
      return "";
  }
}
