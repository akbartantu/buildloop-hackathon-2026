import { isActiveRun } from "@/lib/contract-handoff";
import { buildEvidenceHistory } from "@/lib/evidence-analysis";
import { formatDuration, resolveRunStartedAt } from "@/lib/lifecycle-progress";
import type { TaskRunSnapshot } from "@/lib/task-rerun";
import { translate, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import type { TaskRecord } from "@/lib/tasks-schema";

export type RunTimingViewModel = {
  startedAtIso: string | null;
  completedAtIso: string | null;
  startedAtLabel: string;
  completedAtLabel: string;
  durationLabel: string | null;
  durationIsElapsed: boolean;
  showDuration: boolean;
};

export type AttemptHistoryViewModel = {
  attemptNumber: number;
  title: string;
  checksSummary: string;
  outcome: string;
  startedAtLabel: string | null;
  completedAtLabel: string | null;
  durationLabel: string | null;
  hasTiming: boolean;
  compactTechnicalLine: string;
};

export type RunHistoryTimingViewModel = {
  runNumber: number;
  runId: string;
  verdictLabel: string;
  startedAtLabel: string;
  completedAtLabel: string;
  durationLabel: string | null;
  compactTechnicalLine: string;
};

function timingKey(field: string): TranslationKey {
  return `timing.${field}` as TranslationKey;
}

export function resolveLocaleTag(locale: Locale): string {
  return locale === "id" ? "id-ID" : "en-GB";
}

export function formatMissingTimestamp(locale: Locale): string {
  return translate(locale, timingKey("notRecorded"));
}

export function formatPersistedTime(iso: string | null | undefined, locale: Locale): string | null {
  if (!iso) {
    return null;
  }
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return new Intl.DateTimeFormat(resolveLocaleTag(locale), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

export function formatPersistedDateTime(iso: string | null | undefined, locale: Locale): string | null {
  if (!iso) {
    return null;
  }
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return new Intl.DateTimeFormat(resolveLocaleTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

export function computePersistedDurationMs(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
): number | null {
  if (!startedAt || !completedAt) {
    return null;
  }
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(completedAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return null;
  }
  return endMs - startMs;
}

const TERMINAL_RUN_STATUSES = new Set([
  "PASS",
  "AWAITING_APPROVAL",
  "FAILED",
  "BLOCKED",
  "CLOSED",
  "STALE",
]);

export function resolveCurrentRunCompletedAt(task: TaskRecord, activeRun: boolean): string | null {
  if (activeRun || !task.runnerState?.runnerInvoked) {
    return null;
  }
  if (!TERMINAL_RUN_STATUSES.has(task.status)) {
    return null;
  }
  return task.updatedAt || null;
}

export function buildCurrentRunTimingViewModel(
  task: TaskRecord,
  locale: Locale = DEFAULT_LOCALE,
  nowMs: number = Date.now(),
): RunTimingViewModel | null {
  if (!task.runnerState?.runnerInvoked && !task.lockedAt) {
    return null;
  }

  const startedAtIso = resolveRunStartedAt(task);
  const activeRun = isActiveRun(task.status);
  const completedAtIso = resolveCurrentRunCompletedAt(task, activeRun);

  let durationLabel: string | null = null;
  let durationIsElapsed = false;

  if (activeRun && startedAtIso) {
    const startMs = Date.parse(startedAtIso);
    if (!Number.isNaN(startMs)) {
      const elapsedMs = Math.max(0, nowMs - startMs);
      durationLabel = formatDuration(elapsedMs);
      durationIsElapsed = durationLabel !== null;
    }
  } else {
    const durationMs = computePersistedDurationMs(startedAtIso, completedAtIso);
    durationLabel = durationMs !== null ? formatDuration(durationMs) : null;
  }

  const startedAtLabel =
    formatPersistedDateTime(startedAtIso, locale) ?? formatMissingTimestamp(locale);
  const completedAtLabel = activeRun
    ? formatMissingTimestamp(locale)
    : formatPersistedDateTime(completedAtIso, locale) ?? formatMissingTimestamp(locale);

  return {
    startedAtIso,
    completedAtIso,
    startedAtLabel,
    completedAtLabel,
    durationLabel,
    durationIsElapsed,
    showDuration: durationLabel !== null,
  };
}

function formatAttemptChecksSummary(
  passed: number,
  failed: number,
  blocked: number,
  locale: Locale,
): string {
  const parts = [
    translate(locale, timingKey("checksPassed"), { count: passed }),
    translate(locale, timingKey("checksFailed"), { count: failed }),
  ];
  if (blocked > 0) {
    parts.push(translate(locale, timingKey("checksBlocked"), { count: blocked }));
  }
  return parts.join(" · ");
}

function parseAttemptChecks(checks: string): { passed: number; failed: number; blocked: number } {
  const passed = Number(/(\d+)\s+passed/.exec(checks)?.[1] ?? 0);
  const failed = Number(/(\d+)\s+failed/.exec(checks)?.[1] ?? 0);
  const blocked = Number(/(\d+)\s+blocked/.exec(checks)?.[1] ?? 0);
  return { passed, failed, blocked };
}

export function buildAttemptHistoryViewModels(
  task: TaskRecord,
  locale: Locale = DEFAULT_LOCALE,
): AttemptHistoryViewModel[] {
  return buildEvidenceHistory(task).map((entry) => {
    const { passed, failed, blocked } = parseAttemptChecks(entry.checks);
    const checksSummary = formatAttemptChecksSummary(passed, failed, blocked, locale);
    const title = translate(locale, timingKey("attemptTitle"), { number: entry.attemptNumber });

    return {
      attemptNumber: entry.attemptNumber,
      title,
      checksSummary,
      outcome: entry.outcome,
      startedAtLabel: null,
      completedAtLabel: null,
      durationLabel: null,
      hasTiming: false,
      compactTechnicalLine: `${title} · ${checksSummary} → ${entry.outcome}`,
    };
  });
}

function formatRunVerdictLabel(entry: TaskRunSnapshot, locale: Locale): string {
  if (entry.verdict === "PASS") {
    return locale === "id" ? "Lolos" : "Passed";
  }
  if (entry.verdict === "BLOCKED") {
    return locale === "id" ? "Diblokir" : "Blocked";
  }
  if (entry.verdict === "FAILED" || entry.status === "FAILED") {
    return locale === "id" ? "Gagal" : "Failed";
  }
  return entry.status.replaceAll("_", " ");
}

export function buildRunHistoryTimingViewModel(
  entry: TaskRunSnapshot,
  locale: Locale = DEFAULT_LOCALE,
): RunHistoryTimingViewModel {
  const startedAtLabel =
    formatPersistedDateTime(entry.startedAt, locale) ?? formatMissingTimestamp(locale);
  const completedAtLabel =
    formatPersistedDateTime(entry.finishedAt, locale) ?? formatMissingTimestamp(locale);
  const startedTime = formatPersistedTime(entry.startedAt, locale);
  const completedTime = formatPersistedTime(entry.finishedAt, locale);
  const durationMs = computePersistedDurationMs(entry.startedAt, entry.finishedAt);
  const durationLabel = durationMs !== null ? formatDuration(durationMs) : null;
  const verdictLabel = formatRunVerdictLabel(entry, locale);
  const timeRange =
    startedTime && completedTime ? `${startedTime}–${completedTime}` : formatMissingTimestamp(locale);
  const durationSegment = durationLabel ? ` · ${durationLabel}` : "";

  return {
    runNumber: entry.runNumber,
    runId: entry.runId,
    verdictLabel,
    startedAtLabel,
    completedAtLabel,
    durationLabel,
    compactTechnicalLine: `Run #${entry.runNumber} · ${timeRange}${durationSegment} · ${verdictLabel}`,
  };
}

export function formatApprovalDecisionTimestamp(iso: string, locale: Locale): string {
  return formatPersistedDateTime(iso, locale) ?? formatMissingTimestamp(locale);
}

export function formatApprovalDecisionTimeOnly(iso: string, locale: Locale): string {
  return formatPersistedTime(iso, locale) ?? formatMissingTimestamp(locale);
}
