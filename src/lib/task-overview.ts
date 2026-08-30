import type { TaskStatus } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { countPassedChecks, contractSections } from "@/lib/task-display";
import { analyzeChecks, buildTaskLifecycleViewModel, taskHasRun } from "@/lib/task-lifecycle";
import { isActiveRun, isOrchestrated } from "@/lib/contract-handoff";

export type JourneyStepState = "complete" | "current" | "upcoming" | "blocked";

export type JourneyStep = {
  key: string;
  label: string;
  state: JourneyStepState;
};

export type ActivityEvent = {
  label: string;
  timestamp?: string;
  tone: "neutral" | "pass" | "blocked" | "review";
};

export type AttentionState = {
  title: string;
  description: string;
  ctaLabel: string;
  ctaTab: "orchestration" | "evidence" | "approval";
} | null;

export type EvidenceSnapshot = {
  available: boolean;
  filesChanged: number | null;
  checksPassed: number | null;
  checksTotal: number | null;
  protectedPathsChanged: number | null;
  commandsExecuted: number | null;
};

const FRIENDLY_STATUS: Partial<Record<TaskStatus, string>> = {
  DRAFT: "Draft",
  CONTRACT_READY: "Menunggu persetujuan contract",
  APPROVED_FOR_EXECUTION: "Siap dijalankan",
  INSPECTING: "Preflight berjalan",
  RUNNING: "Worker berjalan",
  CHECKING: "Checker memverifikasi",
  NEEDS_CORRECTION: "Koreksi terbatas",
  PASS: "PASS — tinjau hasil",
  AWAITING_APPROVAL: "Menunggu approval",
  FAILED: "FAILED",
    BLOCKED: "BLOCKED",
    CLOSED: "Eksekusi selesai",
    STALE: "Contract basi",
};

export function friendlyStatusLabel(status: TaskStatus): string {
  return FRIENDLY_STATUS[status] ?? status.replaceAll("_", " ");
}

export function contractVersionLabel(task: TaskRecord): string {
  return task.lockedAt ? "v1 · Locked" : "v1 · Draft";
}

export function getJourneySteps(status: TaskStatus): JourneyStep[] {
  const steps: JourneyStep[] = [
    { key: "contract", label: "Contract", state: "upcoming" },
    { key: "preflight", label: "Preflight", state: "upcoming" },
    { key: "orchestration", label: "Orchestration", state: "upcoming" },
    { key: "check", label: "Check", state: "upcoming" },
    { key: "approval", label: "Approval", state: "upcoming" },
  ];

  const setUpTo = (index: number, state: JourneyStepState = "complete") => {
    for (let i = 0; i < index; i++) steps[i]!.state = "complete";
    if (index < steps.length) steps[index]!.state = state;
  };

  if (status === "DRAFT" || status === "CONTRACT_READY") {
    steps[0]!.state = "current";
    return steps;
  }

  if (status === "APPROVED_FOR_EXECUTION") {
    steps[0]!.state = "complete";
    steps[1]!.state = "complete";
    steps[2]!.state = "current";
    return steps;
  }

  if (status === "BLOCKED") {
    steps[0]!.state = "complete";
    steps[1]!.state = "blocked";
    return steps;
  }

  if (status === "INSPECTING") {
    setUpTo(1, "current");
    return steps;
  }

  if (status === "RUNNING" || status === "NEEDS_CORRECTION") {
    steps[0]!.state = "complete";
    steps[1]!.state = "complete";
    steps[2]!.state = "current";
    return steps;
  }

  if (status === "CHECKING") {
    steps[0]!.state = "complete";
    steps[1]!.state = "complete";
    steps[2]!.state = "complete";
    steps[3]!.state = "current";
    return steps;
  }

  if (status === "FAILED") {
    steps[0]!.state = "complete";
    steps[1]!.state = "complete";
    steps[2]!.state = "complete";
    steps[3]!.state = "complete";
    steps[4]!.state = "upcoming";
    return steps;
  }

  if (status === "PASS" || status === "AWAITING_APPROVAL" || status === "CLOSED") {
    steps.forEach((s) => {
      s.state = "complete";
    });
    steps[4]!.state = status === "AWAITING_APPROVAL" ? "current" : "complete";
    return steps;
  }

  if (isOrchestrated(status)) {
    setUpTo(2, "current");
  }

  return steps;
}

export function getJourneyDescription(status: TaskStatus): string {
  const descriptions: Partial<Record<TaskStatus, string>> = {
    DRAFT: "Lengkapi goal dan tinjau contract sebelum eksekusi.",
    CONTRACT_READY: "Contract siap ditinjau. Setujui untuk mengunci batas kerja.",
    APPROVED_FOR_EXECUTION:
      "Contract sudah disetujui. BuildLoop siap menjalankan worker sesuai batas kerja.",
    INSPECTING: "Preflight memeriksa policy dan batas contract.",
    RUNNING: "Worker menerapkan perubahan dalam scope yang disetujui.",
    CHECKING: "Checker independen memverifikasi hasil worker.",
    NEEDS_CORRECTION: "Orchestrator menyiapkan koreksi terbatas.",
    PASS: "Verdict PASS — tinjau evidence sebelum tindakan sensitif.",
    AWAITING_APPROVAL:
      "Pekerjaan otonom selesai. Commit, push, merge, dan deploy membutuhkan approval Anda.",
    CLOSED:
      "Eksekusi task selesai. Delivery actions (commit/push/deploy) terpisah dari lifecycle eksekusi.",
    FAILED: "Checker gagal setelah batas koreksi — tinjau evidence.",
    BLOCKED: "BuildLoop berhenti karena guardrail — worker tidak dijalankan.",
  };
  return descriptions[status] ?? "Lanjutkan alur task.";
}

export function buildActivityEvents(task: TaskRecord): ActivityEvent[] {
  const events: ActivityEvent[] = [
    {
      label: "Task dibuat",
      timestamp: task.createdAt,
      tone: "neutral",
    },
  ];

  if (task.status !== "DRAFT" && task.status !== "BLOCKED") {
    events.push({
      label: "Contract dibuat",
      timestamp: task.createdAt,
      tone: "neutral",
    });
  }

  if (task.lockedAt) {
    events.push({
      label: "Contract disetujui",
      timestamp: task.lockedAt,
      tone: "pass",
    });
  }

  const log = task.runnerState?.decisionLog ?? [];
  for (const entry of log) {
    events.push({
      label: entry.summary,
      timestamp: task.updatedAt,
      tone:
        entry.verdict === "BLOCKED"
          ? "blocked"
          : entry.verdict === "PASS"
            ? "pass"
            : "review",
    });
  }

  if (log.length === 0) {
    if (statusToActivityLabel(task.status)) {
      events.push({
        label: statusToActivityLabel(task.status)!,
        timestamp: task.updatedAt,
        tone: task.status === "BLOCKED" ? "blocked" : isActiveRun(task.status) ? "review" : "neutral",
      });
    }
  }

  if (task.status === "AWAITING_APPROVAL" || task.status === "PASS") {
    events.push({
      label: "Menunggu approval manusia",
      timestamp: task.updatedAt,
      tone: "review",
    });
  }

  return events.slice(-5);
}

function statusToActivityLabel(status: TaskStatus): string | null {
  const labels: Partial<Record<TaskStatus, string>> = {
    APPROVED_FOR_EXECUTION: "Siap menjalankan orchestrator",
    INSPECTING: "Preflight dimulai",
    RUNNING: "Worker dimulai",
    CHECKING: "Checker memverifikasi",
    NEEDS_CORRECTION: "Koreksi terbatas dimulai",
    PASS: "Verdict PASS",
    FAILED: "Verdict FAILED",
    BLOCKED: "Preflight BLOCKED",
    AWAITING_APPROVAL: "Verdict PASS — approval gate",
  };
  return labels[status] ?? null;
}

export function getAttentionState(task: TaskRecord): AttentionState {
  if (task.status === "BLOCKED") {
    return {
      title: "Perlu perhatian",
      description:
        task.blockedReasons[0]?.explanation ??
        "BuildLoop berhenti karena tindakan menyentuh protected boundary.",
      ctaLabel: "Tinjau block",
      ctaTab: "evidence",
    };
  }

  if (task.status === "AWAITING_APPROVAL") {
    const lifecycle = buildTaskLifecycleViewModel(task);
    return {
      title: lifecycle.approval.canRecommendApprove ? "Siap untuk approval" : "Perlu tinjauan approval",
      description: lifecycle.approval.description,
      ctaLabel: lifecycle.approval.canRecommendApprove ? "Setujui commit" : "Tinjau approval",
      ctaTab: "approval",
    };
  }

  if (task.status === "FAILED") {
    return {
      title: "Perlu tinjauan",
      description:
        "Orchestrator selesai dengan FAILED setelah batas koreksi. Tinjau evidence sebelum memutuskan langkah berikutnya.",
      ctaLabel: "Lihat hasil",
      ctaTab: "evidence",
    };
  }

  return null;
}

export function getEvidenceSnapshot(task: TaskRecord): EvidenceSnapshot {
  const runner = task.runnerState;
  const checks = analyzeChecks(task);
  const hasRun = taskHasRun(task);

  if (!hasRun) {
    return {
      available: false,
      filesChanged: null,
      checksPassed: null,
      checksTotal: null,
      protectedPathsChanged: null,
      commandsExecuted: null,
    };
  }

  const protectedChanged =
    task.status === "BLOCKED" || task.blockedReasons.length > 0
      ? task.blockedReasons.some((r) => r.rule.includes("protected"))
        ? 1
        : 0
      : 0;

  return {
    available: true,
    filesChanged: runner?.filesChanged ?? 0,
    checksPassed: checks.passed,
    checksTotal: checks.total,
    protectedPathsChanged: protectedChanged,
    commandsExecuted: runner?.commandsExecuted ?? 0,
  };
}

export function getContractSnapshot(task: TaskRecord) {
  const sections = contractSections(task.contract);
  return {
    goal: sections.goal,
    allowed: sections.willDo.slice(0, 3),
    protected: sections.wontDo.slice(0, 4),
  };
}

export function formatOverviewTimestamp(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return null;
  }
}
