import type { TaskStatus } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { translate, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import { countPassedChecks, contractSections } from "@/lib/task-display";
import { analyzeChecks, buildTaskLifecycleViewModel, taskHasRun } from "@/lib/task-lifecycle";
import { isActiveRun, isOrchestrated } from "@/lib/contract-handoff";
import { getContractVersion } from "@/lib/task-lifecycle-ops";

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

const FRIENDLY_STATUS_EN: Partial<Record<TaskStatus, string>> = {
  DRAFT: "Draft",
  CONTRACT_READY: "Awaiting contract approval",
  APPROVED_FOR_EXECUTION: "Approved for execution",
  INSPECTING: "Preflight running",
  RUNNING: "Worker running",
  CHECKING: "Checker verifying",
  NEEDS_CORRECTION: "Limited correction",
  PASS: "PASS — review results",
  AWAITING_APPROVAL: "Awaiting approval",
  FAILED: "FAILED",
  BLOCKED: "Blocked",
  CLOSED: "Run completed",
  STALE: "Stale contract",
};

export function friendlyStatusLabel(status: TaskStatus, locale: Locale = DEFAULT_LOCALE): string {
  const key = `status.task.${status}` as TranslationKey;
  const translated = translate(locale, key);
  if (translated !== key) {
    return translated;
  }
  return FRIENDLY_STATUS_EN[status] ?? status.replaceAll("_", " ");
}

export function contractVersionLabel(task: TaskRecord, locale: Locale = DEFAULT_LOCALE): string {
  const version = getContractVersion(task.contract);
  if (task.lockedAt) {
    return locale === "id" ? `v${version} · Terkunci` : `v${version} · Locked`;
  }
  return locale === "id" ? `v${version} · Draft` : `v${version} · Draft`;
}

export function getJourneySteps(status: TaskStatus, locale: Locale = DEFAULT_LOCALE): JourneyStep[] {
  const steps: JourneyStep[] = [
    { key: "contract", label: translate(locale, "overview.journey.contract"), state: "upcoming" },
    { key: "preflight", label: translate(locale, "overview.journey.preflight"), state: "upcoming" },
    { key: "orchestration", label: translate(locale, "overview.journey.orchestration"), state: "upcoming" },
    { key: "check", label: translate(locale, "overview.journey.check"), state: "upcoming" },
    { key: "approval", label: translate(locale, "overview.journey.approval"), state: "upcoming" },
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

export function getJourneyDescription(status: TaskStatus, locale: Locale = DEFAULT_LOCALE): string {
  const key = `overview.journeyDescription.${status}` as TranslationKey;
  const translated = translate(locale, key);
  if (translated !== key) return translated;
  return translate(locale, "overview.journeyDescription.default");
}

export function buildActivityEvents(task: TaskRecord, locale: Locale = DEFAULT_LOCALE): ActivityEvent[] {
  const events: ActivityEvent[] = [
    {
      label: translate(locale, "overview.activity.taskCreated"),
      timestamp: task.createdAt,
      tone: "neutral",
    },
  ];

  if (task.status !== "DRAFT" && task.status !== "BLOCKED") {
    events.push({
      label: translate(locale, "overview.activity.contractCreated"),
      timestamp: task.createdAt,
      tone: "neutral",
    });
  }

  if (task.lockedAt) {
    events.push({
      label: translate(locale, "overview.activity.contractApproved"),
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
    const activityLabel = statusToActivityLabel(task.status, locale);
    if (activityLabel) {
      events.push({
        label: activityLabel,
        timestamp: task.updatedAt,
        tone: task.status === "BLOCKED" ? "blocked" : isActiveRun(task.status) ? "review" : "neutral",
      });
    }
  }

  if (task.status === "AWAITING_APPROVAL" || task.status === "PASS") {
    events.push({
      label: translate(locale, "overview.activity.awaitingHumanApproval"),
      timestamp: task.updatedAt,
      tone: "review",
    });
  }

  return events.slice(-5);
}

function statusToActivityLabel(status: TaskStatus, locale: Locale): string | null {
  const map: Partial<Record<TaskStatus, TranslationKey>> = {
    APPROVED_FOR_EXECUTION: "overview.activity.readyToRun",
    INSPECTING: "overview.activity.preflightStarted",
    RUNNING: "overview.activity.workerStarted",
    CHECKING: "overview.activity.checkerVerifying",
    NEEDS_CORRECTION: "overview.activity.limitedCorrectionStarted",
    PASS: "overview.activity.passVerdict",
    FAILED: "overview.activity.failedVerdict",
    BLOCKED: "overview.activity.preflightBlocked",
    AWAITING_APPROVAL: "overview.activity.passApprovalGate",
  };
  const key = map[status];
  return key ? translate(locale, key) : null;
}

export function getAttentionState(task: TaskRecord, locale: Locale = DEFAULT_LOCALE): AttentionState {
  if (task.status === "BLOCKED") {
    return {
      title: translate(locale, "overview.attention.needsAttention"),
      description:
        task.blockedReasons[0]?.explanation ??
        translate(locale, "taskDetail.evidence.blockedFallback"),
      ctaLabel: translate(locale, "overview.attention.reviewBlock"),
      ctaTab: "evidence",
    };
  }

  if (task.status === "AWAITING_APPROVAL") {
    const lifecycle = buildTaskLifecycleViewModel(task, locale);
    return {
      title: lifecycle.approval.canRecommendApprove
        ? translate(locale, "overview.attention.readyForApproval")
        : translate(locale, "overview.attention.needsApprovalReview"),
      description: lifecycle.approval.description,
      ctaLabel: lifecycle.approval.canRecommendApprove
        ? translate(locale, "overview.attention.approveCommit")
        : translate(locale, "overview.attention.reviewApproval"),
      ctaTab: "approval",
    };
  }

  if (task.status === "FAILED") {
    return {
      title: translate(locale, "overview.attention.needsReview"),
      description: translate(locale, "overview.attention.failedDescription"),
      ctaLabel: translate(locale, "overview.attention.viewResults"),
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
