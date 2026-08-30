import type { TaskRecord } from "@/lib/tasks-schema";
import type { TaskStatus } from "@/lib/task-contract";
import type { DemoTab } from "@/lib/task-display";
import { isOrchestrationInProgress } from "@/lib/evidence-analysis";

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
): ContractHandoff {
  const { status } = task;
  const locked = status === "APPROVED_FOR_EXECUTION" || Boolean(task.lockedAt);

  if (status === "BLOCKED") {
    return {
      primaryLabel: "Lihat Orchestration",
      primaryAction: "view-orchestration",
      secondaryLabel: "Lihat Evidence",
      secondaryAction: "view-evidence",
      statusNote:
        "BuildLoop berhenti karena guardrail. Tidak ada eksekusi otomatis dari halaman ini.",
      showNextSteps: true,
      showApproveActions: false,
    };
  }

  if (status === "CONTRACT_READY" || status === "DRAFT") {
    return {
      primaryLabel: options.approving ? "Menyimpan…" : "Setujui contract",
      primaryAction: "approve",
      statusNote: "Setujui contract untuk mengunci batas kerja, lalu Anda dapat mulai orchestration.",
      showNextSteps: true,
      showApproveActions: true,
    };
  }

  if (status === "APPROVED_FOR_EXECUTION") {
    return {
      primaryLabel: options.running ? "Menjalankan…" : "Mulai Orchestration",
      primaryAction: "run",
      showNextSteps: true,
      showApproveActions: false,
    };
  }

  if (isActiveRun(status)) {
    return {
      primaryLabel: "Lihat Orchestration",
      primaryAction: "view-orchestration",
      statusNote: `BuildLoop sedang bekerja — status: ${status.replaceAll("_", " ")}.`,
      showNextSteps: true,
      showApproveActions: false,
    };
  }

  if (status === "AWAITING_APPROVAL") {
    return {
      primaryLabel: "Lihat Approval",
      primaryAction: "view-approval",
      secondaryLabel: "Lihat Evidence",
      secondaryAction: "view-evidence",
      showNextSteps: false,
      showApproveActions: false,
    };
  }

  if (status === "PASS") {
    return {
      primaryLabel: "Lihat Evidence",
      primaryAction: "view-evidence",
      secondaryLabel: "Lihat Orchestration",
      secondaryAction: "view-orchestration",
      showNextSteps: false,
      showApproveActions: false,
    };
  }

  if (status === "FAILED") {
    return {
      primaryLabel: "Lihat Evidence",
      primaryAction: "view-evidence",
      secondaryLabel: "Lihat Orchestration",
      secondaryAction: "view-orchestration",
      statusNote: "Orchestrator selesai dengan verdict FAILED setelah batas koreksi.",
      showNextSteps: false,
      showApproveActions: false,
    };
  }

  if (locked) {
    return {
      primaryLabel: "Lihat Orchestration",
      primaryAction: "view-orchestration",
      showNextSteps: true,
      showApproveActions: false,
    };
  }

  return {
    primaryLabel: "Lihat Orchestration",
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

export const CONTRACT_NEXT_STEPS_COPY =
  "BuildLoop akan menjalankan task sesuai kontrak ini di workspace terkontrol, memeriksa hasilnya, dan mencoba memperbaiki maksimal 2 kali jika diperlukan. Jika tindakan sensitif terdeteksi, proses akan berhenti dan meminta persetujuan Anda.";
