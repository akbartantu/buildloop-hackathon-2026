import type { TaskStatus } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { isActiveRun } from "@/lib/contract-handoff";
import { translate, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import type { LifecycleStepState, OrchestrationStepView } from "@/lib/task-lifecycle";

export type ProgressVisualState =
  | "completed"
  | "active"
  | "waiting"
  | "skipped"
  | "blocked"
  | "failed";

export type LifecycleProgressStepView = OrchestrationStepView & {
  visualState: ProgressVisualState;
  statusLabel: string;
};

export type ComponentActivityView = {
  worker: string;
  checker: string;
};

export type RunProgressViewModel = {
  steps: LifecycleProgressStepView[];
  phaseRailLabels: string[];
  runSummary: string | null;
  lastActivity: string | null;
  componentActivity: ComponentActivityView | null;
  longRunningMessage: string | null;
  delayedWarning: string | null;
  shouldPoll: boolean;
  autoRefreshLabel: string | null;
};

const PHASE_RAIL_KEYS = ["planning", "preflight", "worker", "checker", "decision"] as const;
export const RUN_ACTIVITY_DELAY_THRESHOLD_MS = 90_000;
export const TASK_RUN_POLL_INTERVAL_MS = 5_000;

const TERMINAL_POLL_STATUSES: TaskStatus[] = [
  "PASS",
  "FAILED",
  "BLOCKED",
  "CLOSED",
  "AWAITING_APPROVAL",
  "CONTRACT_READY",
  "DRAFT",
  "APPROVED_FOR_EXECUTION",
  "STALE",
];

export function mapStepToVisualState(state: LifecycleStepState): ProgressVisualState {
  switch (state) {
    case "complete":
      return "completed";
    case "active":
      return "active";
    case "not_needed":
      return "skipped";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    default:
      return "waiting";
  }
}

export function formatProgressStepStatus(
  visualState: ProgressVisualState,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const key = `lifecycle.progress.${visualState}` as TranslationKey;
  const translated = translate(locale, key);
  return translated === key ? visualState : translated;
}

export function formatDuration(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function resolveRunStartedAt(task: TaskRecord): string | null {
  if (task.lockedAt) {
    return task.lockedAt;
  }
  if (task.runnerState?.runnerInvoked) {
    return task.updatedAt;
  }
  return null;
}

export function resolveLastActivityAt(task: TaskRecord): string | null {
  return task.updatedAt || task.createdAt || null;
}

export function shouldPollTaskStatus(status: TaskStatus): boolean {
  return isActiveRun(status);
}

export function isTerminalPollBoundary(status: TaskStatus): boolean {
  return TERMINAL_POLL_STATUSES.includes(status);
}

export function buildComponentActivity(
  steps: OrchestrationStepView[],
  locale: Locale = DEFAULT_LOCALE,
): ComponentActivityView | null {
  const worker = steps.find((step) => step.key === "worker");
  const checker = steps.find((step) => step.key === "checker");
  if (!worker || !checker) {
    return null;
  }

  const workerVisual = mapStepToVisualState(worker.state);
  const checkerVisual = mapStepToVisualState(checker.state);

  return {
    worker: formatComponentLine("worker", workerVisual, locale),
    checker: formatComponentLine("checker", checkerVisual, locale),
  };
}

function formatComponentLine(
  component: "worker" | "checker",
  visualState: ProgressVisualState,
  locale: Locale,
): string {
  const suffix =
    visualState === "active" ? "Running" : visualState === "completed" ? "Completed" : "Waiting";
  const key = `lifecycle.progress.${component}${suffix}` as TranslationKey;
  const translated = translate(locale, key);
  return translated === key ? `${component} — ${suffix}` : translated;
}

export function buildPhaseRailLabels(
  steps: OrchestrationStepView[],
  locale: Locale = DEFAULT_LOCALE,
): string[] {
  return PHASE_RAIL_KEYS.flatMap((key) => {
    const step = steps.find((item) => item.key === key);
    if (!step || mapStepToVisualState(step.state) !== "completed") {
      return [];
    }
    const labelKey = `lifecycle.orchestrationStep.${key}.label` as TranslationKey;
    const label = translate(locale, labelKey);
    return label === labelKey ? [key] : [label];
  });
}

export function buildRunProgressViewModel(
  task: TaskRecord,
  steps: OrchestrationStepView[],
  locale: Locale = DEFAULT_LOCALE,
  nowMs: number = Date.now(),
  correctionsUsed = task.runnerState?.correctionCount ?? 0,
  correctionLimit = task.contract.maxAttempts,
): RunProgressViewModel {
  const progressSteps: LifecycleProgressStepView[] = steps.map((step) => {
    const visualState = mapStepToVisualState(step.state);
    return {
      ...step,
      visualState,
      statusLabel: formatProgressStepStatus(visualState, locale),
    };
  });

  const activeRun = isActiveRun(task.status);
  const runStartedAt = resolveRunStartedAt(task);
  const lastActivityAt = resolveLastActivityAt(task);
  const elapsedMs =
    activeRun && runStartedAt ? Math.max(0, nowMs - Date.parse(runStartedAt)) : null;
  const elapsed = elapsedMs !== null ? formatDuration(elapsedMs) : null;

  const runSummary =
    activeRun && elapsed
      ? translate(locale, "lifecycle.progress.runSummary", {
          elapsed,
          used: correctionsUsed,
          limit: correctionLimit,
        })
      : null;

  const lastActivity =
    lastActivityAt && activeRun
      ? translate(locale, "lifecycle.progress.lastActivity", {
          relative: formatRelativeFromNow(lastActivityAt, locale, nowMs),
        })
      : null;

  const lastActivityMs = lastActivityAt ? Date.parse(lastActivityAt) : Number.NaN;
  const delayedWarning =
    activeRun &&
    Number.isFinite(lastActivityMs) &&
    nowMs - lastActivityMs > RUN_ACTIVITY_DELAY_THRESHOLD_MS
      ? translate(locale, "lifecycle.progress.delayed")
      : null;

  const longRunningMessage =
    activeRun && !delayedWarning ? translate(locale, "lifecycle.progress.stillWorking") : null;

  return {
    steps: progressSteps,
    phaseRailLabels: buildPhaseRailLabels(steps, locale),
    runSummary,
    lastActivity,
    componentActivity: activeRun ? buildComponentActivity(steps, locale) : null,
    longRunningMessage,
    delayedWarning,
    shouldPoll: shouldPollTaskStatus(task.status),
    autoRefreshLabel: activeRun ? translate(locale, "lifecycle.progress.autoRefresh") : null,
  };
}

function formatRelativeFromNow(iso: string, locale: Locale, nowMs: number): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return "—";
  }
  const diffSeconds = Math.round((timestamp - nowMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === "id" ? "id-ID" : "en-US", { numeric: "auto" });
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 60) {
    return rtf.format(diffSeconds, "second");
  }
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, "minute");
  }
  const diffHours = Math.round(diffMinutes / 60);
  return rtf.format(diffHours, "hour");
}

export function containsFakePercentageProgress(text: string): boolean {
  return /\b\d{1,3}%\s*(complete|done|progress)?\b/i.test(text);
}
