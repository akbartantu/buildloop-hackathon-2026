import type { TaskRecord } from "@/lib/tasks-schema";
import { translate, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import type { ProgressVisualState } from "@/lib/lifecycle-progress";
import { mapStepToVisualState } from "@/lib/lifecycle-progress";
import type { DeliveryActionState, TaskLifecycleViewModel } from "@/lib/task-lifecycle";

export type SafetyGuaranteeRow = {
  key: "commit" | "push" | "merge" | "deploy";
  label: string;
};

export type DeliveryStripStepView = {
  key: "task" | "approval" | "worker" | "checker" | "verdict" | "delivery";
  label: string;
  statusLabel: string;
  visualState: ProgressVisualState;
};

function t(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const translated = translate(locale, key, params);
  return translated === key ? key : translated;
}

function safetyLabelForAction(
  action: SafetyGuaranteeRow["key"],
  state: DeliveryActionState,
  locale: Locale,
): string {
  const actionName = t(locale, `runClarity.safety.actions.${action}`);
  switch (state) {
    case "EXECUTED":
      return t(locale, "runClarity.safety.executed", { action: actionName });
    case "APPROVED":
      return t(locale, "runClarity.safety.approvedNotExecuted", { action: actionName });
    case "FAILED":
      return t(locale, "runClarity.safety.failed", { action: actionName });
    case "AWAITING_APPROVAL":
      return t(locale, "runClarity.safety.notExecuted", { action: actionName });
    case "NOT_REQUESTED":
    case "NOT_APPROVED":
    default:
      return t(locale, "runClarity.safety.notExecuted", { action: actionName });
  }
}

/** Compact safety guarantees derived from actual delivery permission state. */
export function buildSafetyGuarantees(
  lifecycle: TaskLifecycleViewModel,
  locale: Locale = DEFAULT_LOCALE,
): SafetyGuaranteeRow[] {
  const actions: SafetyGuaranteeRow["key"][] = ["commit", "push", "merge", "deploy"];
  return actions.map((key) => ({
    key,
    label: safetyLabelForAction(key, lifecycle.delivery[key], locale),
  }));
}

function stepVisualFromOrchestration(
  lifecycle: TaskLifecycleViewModel,
  stepKey: string,
): ProgressVisualState {
  const step = lifecycle.orchestrationSteps.find((item) => item.key === stepKey);
  return step ? mapStepToVisualState(step.state) : "waiting";
}

function verdictVisualState(lifecycle: TaskLifecycleViewModel): ProgressVisualState {
  if (lifecycle.implementationVerdict === "PASS") {
    return "completed";
  }
  if (lifecycle.implementationVerdict === "FAILED") {
    return "failed";
  }
  if (lifecycle.implementationVerdict === "BLOCKED") {
    return "blocked";
  }
  if (lifecycle.taskStatus === "CHECKING" || lifecycle.taskStatus === "RUNNING") {
    return "active";
  }
  return "waiting";
}

function taskStripVisualState(lifecycle: TaskLifecycleViewModel): ProgressVisualState {
  if (lifecycle.isBlocked) {
    return "blocked";
  }
  if (lifecycle.implementationVerdict === "FAILED") {
    return "failed";
  }
  if (lifecycle.runCompleted || lifecycle.isPassLike) {
    return "completed";
  }
  if (lifecycle.hasRun) {
    return "active";
  }
  return "waiting";
}

function approvalStripVisualState(lifecycle: TaskLifecycleViewModel): ProgressVisualState {
  const commit = lifecycle.delivery.commit;
  if (commit === "EXECUTED" || commit === "APPROVED") {
    return "completed";
  }
  if (commit === "AWAITING_APPROVAL") {
    return "blocked";
  }
  if (lifecycle.implementationVerdict === "PASS" && lifecycle.taskStatus === "AWAITING_APPROVAL") {
    return "blocked";
  }
  if (lifecycle.runCompleted && lifecycle.implementationVerdict === "PASS") {
    return "blocked";
  }
  return "waiting";
}

function approvalStripStatusLabel(
  task: TaskRecord,
  lifecycle: TaskLifecycleViewModel,
  locale: Locale,
): string {
  const commit = lifecycle.delivery.commit;
  if (commit === "EXECUTED") {
    return t(locale, "runClarity.strip.approval.executed");
  }
  if (commit === "APPROVED") {
    return t(locale, "runClarity.strip.approval.approvedNotExecuted");
  }
  if (commit === "AWAITING_APPROVAL") {
    return t(locale, "runClarity.strip.approval.awaiting");
  }
  if (task.runnerState?.orchestration?.approvalType === "AUTO_APPROVED_BY_POLICY") {
    return t(locale, "runClarity.strip.approval.autoApproved");
  }
  return t(locale, "runClarity.strip.approval.pending");
}

function deliveryStripVisualState(lifecycle: TaskLifecycleViewModel): ProgressVisualState {
  const states = [
    lifecycle.delivery.commit,
    lifecycle.delivery.push,
    lifecycle.delivery.merge,
    lifecycle.delivery.deploy,
  ];
  if (states.every((state) => state === "NOT_APPROVED" || state === "NOT_REQUESTED")) {
    return lifecycle.implementationVerdict === "PASS" ? "blocked" : "waiting";
  }
  if (states.some((state) => state === "EXECUTED")) {
    return "active";
  }
  if (states.some((state) => state === "APPROVED" || state === "AWAITING_APPROVAL")) {
    return "blocked";
  }
  return "waiting";
}

function deliveryStripStatusLabel(lifecycle: TaskLifecycleViewModel, locale: Locale): string {
  const executed = (["commit", "push", "merge", "deploy"] as const).filter(
    (key) => lifecycle.delivery[key] === "EXECUTED",
  );
  if (executed.length === 0) {
    return t(locale, "runClarity.strip.delivery.humanGated");
  }
  return t(locale, "runClarity.strip.delivery.partial", {
    actions: executed.map((key) => t(locale, `runClarity.safety.actions.${key}`)).join(", "),
  });
}

/** Lightweight run summary strip for PASS / approval contexts. */
export function buildHumanGatedDeliveryStrip(
  task: TaskRecord,
  lifecycle: TaskLifecycleViewModel,
  locale: Locale = DEFAULT_LOCALE,
): DeliveryStripStepView[] {
  const workerVisual = stepVisualFromOrchestration(lifecycle, "worker");
  const checkerVisual = stepVisualFromOrchestration(lifecycle, "checker");

  const taskStatus =
    lifecycle.runCompleted || lifecycle.isPassLike
      ? t(locale, "runClarity.strip.task.completed")
      : lifecycle.hasRun
        ? t(locale, "runClarity.strip.task.inProgress")
        : t(locale, "runClarity.strip.task.notStarted");

  const workerStatus =
    workerVisual === "completed"
      ? t(locale, "runClarity.strip.worker.completed")
      : workerVisual === "active"
        ? t(locale, "runClarity.strip.worker.running")
        : workerVisual === "failed"
          ? t(locale, "runClarity.strip.worker.failed")
          : t(locale, "runClarity.strip.worker.pending");

  const checkerStatus =
    checkerVisual === "completed"
      ? t(locale, "runClarity.strip.checker.completed")
      : checkerVisual === "active"
        ? t(locale, "runClarity.strip.checker.running")
        : checkerVisual === "failed"
          ? t(locale, "runClarity.strip.checker.failed")
          : t(locale, "runClarity.strip.checker.pending");

  const verdictStatus =
    lifecycle.implementationVerdict === "PASS"
      ? t(locale, "runClarity.strip.verdict.pass")
      : lifecycle.implementationVerdict === "FAILED"
        ? t(locale, "runClarity.strip.verdict.failed")
        : lifecycle.implementationVerdict === "BLOCKED"
          ? t(locale, "runClarity.strip.verdict.blocked")
          : t(locale, "runClarity.strip.verdict.pending");

  return [
    {
      key: "task",
      label: t(locale, "runClarity.strip.labels.task"),
      statusLabel: taskStatus,
      visualState: taskStripVisualState(lifecycle),
    },
    {
      key: "approval",
      label: t(locale, "runClarity.strip.labels.approval"),
      statusLabel: approvalStripStatusLabel(task, lifecycle, locale),
      visualState: approvalStripVisualState(lifecycle),
    },
    {
      key: "worker",
      label: t(locale, "runClarity.strip.labels.worker"),
      statusLabel: workerStatus,
      visualState: workerVisual,
    },
    {
      key: "checker",
      label: t(locale, "runClarity.strip.labels.checker"),
      statusLabel: checkerStatus,
      visualState: checkerVisual,
    },
    {
      key: "verdict",
      label: t(locale, "runClarity.strip.labels.verdict"),
      statusLabel: verdictStatus,
      visualState: verdictVisualState(lifecycle),
    },
    {
      key: "delivery",
      label: t(locale, "runClarity.strip.labels.delivery"),
      statusLabel: deliveryStripStatusLabel(lifecycle, locale),
      visualState: deliveryStripVisualState(lifecycle),
    },
  ];
}

export function shouldShowHumanGatedDeliveryStrip(lifecycle: TaskLifecycleViewModel): boolean {
  return (
    lifecycle.implementationVerdict === "PASS" ||
    lifecycle.taskStatus === "AWAITING_APPROVAL" ||
    lifecycle.taskStatus === "CLOSED" ||
    lifecycle.isPassLike
  );
}

export function deliveryStripImpliesUnexecutedGitActions(steps: DeliveryStripStepView[]): boolean {
  const delivery = steps.find((step) => step.key === "delivery");
  const approval = steps.find((step) => step.key === "approval");
  if (!delivery || !approval) {
    return true;
  }
  const serialized = `${approval.statusLabel} ${delivery.statusLabel}`.toLowerCase();
  return !serialized.includes("executed") || serialized.includes("not executed");
}
