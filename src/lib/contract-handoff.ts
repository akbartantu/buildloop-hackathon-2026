import type { TaskRecord } from "@/lib/tasks-schema";
import type { TaskStatus } from "@/lib/task-contract";
import type { DemoTab } from "@/lib/task-display";
import { isOrchestrationInProgress } from "@/lib/evidence-analysis";
import { translate, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import { friendlyStatusLabel } from "@/lib/task-overview";

export type ContractHandoffAction =
  | "approve"
  | "run"
  | "view-orchestration"
  | "view-evidence"
  | "view-approval"
  | "none";

export type ContractHandoff = {
  primaryLabel: string;
  primaryAction: ContractHandoffAction;
  secondaryLabel?: string;
  secondaryAction?: Exclude<ContractHandoffAction, "approve" | "run" | "none">;
  statusNote?: string;
  showNextSteps: boolean;
  showApproveActions: boolean;
};

const ACTIVE_RUN_STATUSES: TaskStatus[] = [
  "INSPECTING",
  "RUNNING",
  "CHECKING",
  "NEEDS_CORRECTION",
];

const ORCHESTRATED_STATUSES: TaskStatus[] = [
  ...ACTIVE_RUN_STATUSES,
  "PASS",
  "FAILED",
  "AWAITING_APPROVAL",
  "BLOCKED",
  "CLOSED",
];

export function isActiveRun(status: TaskStatus): boolean {
  return ACTIVE_RUN_STATUSES.includes(status);
}

export function isOrchestrated(status: TaskStatus): boolean {
  return ORCHESTRATED_STATUSES.includes(status);
}

export function getContractHandoff(
  task: TaskRecord,
  options: { running: boolean; approving: boolean },
  locale: Locale = DEFAULT_LOCALE,
): ContractHandoff {
  const { status } = task;
  const locked = status === "APPROVED_FOR_EXECUTION" || Boolean(task.lockedAt);
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(locale, key, params);

  if (status === "BLOCKED") {
    return {
      primaryLabel: t("taskDetail.handoff.viewOrchestration"),
      primaryAction: "view-orchestration",
      secondaryLabel: t("taskDetail.handoff.viewEvidence"),
      secondaryAction: "view-evidence",
      statusNote: t("taskDetail.handoff.blockedNote"),
      showNextSteps: true,
      showApproveActions: false,
    };
  }

  if (status === "CONTRACT_READY" || status === "DRAFT") {
    return {
      primaryLabel: options.approving ? t("taskDetail.handoff.saving") : t("taskDetail.handoff.approveContract"),
      primaryAction: "approve",
      statusNote: t("taskDetail.handoff.approveNote"),
      showNextSteps: true,
      showApproveActions: true,
    };
  }

  if (status === "APPROVED_FOR_EXECUTION") {
    return {
      primaryLabel: options.running ? t("taskDetail.handoff.running") : t("taskDetail.handoff.startOrchestration"),
      primaryAction: "run",
      showNextSteps: true,
      showApproveActions: false,
    };
  }

  if (isActiveRun(status)) {
    return {
      primaryLabel: t("taskDetail.handoff.viewOrchestration"),
      primaryAction: "view-orchestration",
      statusNote: t("taskDetail.handoff.workingNote", {
        status: friendlyStatusLabel(status, locale),
      }),
      showNextSteps: true,
      showApproveActions: false,
    };
  }

  if (status === "AWAITING_APPROVAL") {
    return {
      primaryLabel: t("taskDetail.handoff.viewApproval"),
      primaryAction: "view-approval",
      secondaryLabel: t("taskDetail.handoff.viewEvidence"),
      secondaryAction: "view-evidence",
      showNextSteps: false,
      showApproveActions: false,
    };
  }

  if (status === "PASS") {
    return {
      primaryLabel: t("taskDetail.handoff.viewEvidence"),
      primaryAction: "view-evidence",
      secondaryLabel: t("taskDetail.handoff.viewOrchestration"),
      secondaryAction: "view-orchestration",
      showNextSteps: false,
      showApproveActions: false,
    };
  }

  if (status === "FAILED") {
    return {
      primaryLabel: t("taskDetail.handoff.viewEvidence"),
      primaryAction: "view-evidence",
      secondaryLabel: t("taskDetail.handoff.viewOrchestration"),
      secondaryAction: "view-orchestration",
      statusNote: t("taskDetail.handoff.failedNote"),
      showNextSteps: false,
      showApproveActions: false,
    };
  }

  if (locked) {
    return {
      primaryLabel: t("taskDetail.handoff.viewOrchestration"),
      primaryAction: "view-orchestration",
      showNextSteps: true,
      showApproveActions: false,
    };
  }

  return {
    primaryLabel: t("taskDetail.handoff.viewOrchestration"),
    primaryAction: "view-orchestration",
    showNextSteps: true,
    showApproveActions: false,
  };
}

export function handoffActionToTab(action: ContractHandoffAction): DemoTab | null {
  switch (action) {
    case "view-orchestration":
      return "orchestration";
    case "view-evidence":
      return "evidence";
    case "view-approval":
      return "approval";
    default:
      return null;
  }
}

export function getTabProgress(status: TaskStatus, tab: DemoTab): "complete" | "current" | "upcoming" {
  const order: DemoTab[] = ["overview", "contract", "orchestration", "evidence", "approval"];
  const index = order.indexOf(tab);

  if (tab === "overview") return index >= 0 ? "complete" : "upcoming";
  if (tab === "contract") {
    if (status === "CONTRACT_READY" || status === "DRAFT") return "current";
    return "complete";
  }
  if (tab === "orchestration") {
    if (isActiveRun(status)) return "current";
    if (isOrchestrated(status) || status === "CLOSED") return "complete";
    if (status === "APPROVED_FOR_EXECUTION") return "current";
    return "upcoming";
  }
  if (tab === "evidence") {
    if (isOrchestrationInProgress(status)) return "upcoming";
    if (status === "FAILED" || status === "BLOCKED") return "current";
    if (status === "PASS" || status === "AWAITING_APPROVAL" || status === "CLOSED") return "complete";
    if (isOrchestrated(status)) return "upcoming";
    return "upcoming";
  }
  if (tab === "approval") {
    if (isOrchestrationInProgress(status)) return "upcoming";
    if (status === "AWAITING_APPROVAL" || status === "PASS") return "current";
    if (status === "CLOSED") return "complete";
    return "upcoming";
  }
  return "upcoming";
}

export function contractNextStepsCopy(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "taskDetail.contract.nextStepsCopy");
}
