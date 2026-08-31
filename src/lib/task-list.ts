import type { TaskStatus } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { translate, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import { formatTaskRef, suggestedTab, type DemoTab } from "@/lib/task-display";
import { getContractVersion } from "@/lib/task-lifecycle-ops";
import { abbreviateCommitSha, taskSourceCommitSha } from "@/lib/repository/task-source-display";

export type TaskListStatusTone = "pass" | "blocked" | "review" | "neutral";

export type TaskListPrimaryAction = {
  label: string;
  tab: DemoTab;
};

export type TaskListItemViewModel = {
  taskRef: string;
  statusLabel: string;
  statusTone: TaskListStatusTone;
  explanation: string;
  metadataLine: string;
  primaryAction: TaskListPrimaryAction;
  defaultTab: DemoTab;
};

const LIST_STATUS_KEY: Partial<Record<TaskStatus, TranslationKey>> = {
  DRAFT: "tasks.list.status.DRAFT",
  CONTRACT_READY: "tasks.list.status.CONTRACT_READY",
  APPROVED_FOR_EXECUTION: "tasks.list.status.APPROVED_FOR_EXECUTION",
  INSPECTING: "tasks.list.status.INSPECTING",
  RUNNING: "tasks.list.status.RUNNING",
  CHECKING: "tasks.list.status.CHECKING",
  NEEDS_CORRECTION: "tasks.list.status.NEEDS_CORRECTION",
  PASS: "tasks.list.status.PASS",
  FAILED: "tasks.list.status.FAILED",
  AWAITING_APPROVAL: "tasks.list.status.AWAITING_APPROVAL",
  BLOCKED: "tasks.list.status.BLOCKED",
  CLOSED: "tasks.list.status.CLOSED",
  STALE: "tasks.list.status.STALE",
};

const LIST_EXPLANATION_KEY: Partial<Record<TaskStatus, TranslationKey>> = {
  DRAFT: "tasks.list.explanation.DRAFT",
  CONTRACT_READY: "tasks.list.explanation.CONTRACT_READY",
  APPROVED_FOR_EXECUTION: "tasks.list.explanation.APPROVED_FOR_EXECUTION",
  INSPECTING: "tasks.list.explanation.INSPECTING",
  RUNNING: "tasks.list.explanation.RUNNING",
  CHECKING: "tasks.list.explanation.CHECKING",
  NEEDS_CORRECTION: "tasks.list.explanation.NEEDS_CORRECTION",
  PASS: "tasks.list.explanation.PASS",
  FAILED: "tasks.list.explanation.FAILED",
  AWAITING_APPROVAL: "tasks.list.explanation.AWAITING_APPROVAL",
  BLOCKED: "tasks.list.explanation.BLOCKED",
  CLOSED: "tasks.list.explanation.CLOSED",
  STALE: "tasks.list.explanation.STALE",
};

const LIST_ACTION_KEY: Partial<Record<TaskStatus, TranslationKey>> = {
  DRAFT: "tasks.list.action.DRAFT",
  CONTRACT_READY: "tasks.list.action.CONTRACT_READY",
  APPROVED_FOR_EXECUTION: "tasks.list.action.APPROVED_FOR_EXECUTION",
  INSPECTING: "tasks.list.action.INSPECTING",
  RUNNING: "tasks.list.action.RUNNING",
  CHECKING: "tasks.list.action.CHECKING",
  NEEDS_CORRECTION: "tasks.list.action.NEEDS_CORRECTION",
  PASS: "tasks.list.action.PASS",
  FAILED: "tasks.list.action.FAILED",
  AWAITING_APPROVAL: "tasks.list.action.AWAITING_APPROVAL",
  BLOCKED: "tasks.list.action.BLOCKED",
  CLOSED: "tasks.list.action.CLOSED",
  STALE: "tasks.list.action.STALE",
};

const ACTION_TAB: Partial<Record<TaskStatus, DemoTab>> = {
  DRAFT: "contract",
  CONTRACT_READY: "contract",
  APPROVED_FOR_EXECUTION: "orchestration",
  INSPECTING: "orchestration",
  RUNNING: "orchestration",
  CHECKING: "orchestration",
  NEEDS_CORRECTION: "orchestration",
  PASS: "evidence",
  FAILED: "evidence",
  AWAITING_APPROVAL: "approval",
  BLOCKED: "evidence",
  CLOSED: "approval",
  STALE: "contract",
};

export function listStatusTone(status: TaskStatus): TaskListStatusTone {
  if (status === "PASS" || status === "AWAITING_APPROVAL" || status === "CLOSED") {
    return "pass";
  }
  if (status === "BLOCKED" || status === "FAILED") {
    return "blocked";
  }
  if (
    ["RUNNING", "CHECKING", "NEEDS_CORRECTION", "INSPECTING", "APPROVED_FOR_EXECUTION"].includes(
      status,
    )
  ) {
    return "review";
  }
  return "neutral";
}

export function listStatusLabel(status: TaskStatus, locale: Locale = DEFAULT_LOCALE): string {
  const key = LIST_STATUS_KEY[status];
  if (!key) {
    return status.replaceAll("_", " ");
  }
  const translated = translate(locale, key);
  return translated === key ? status.replaceAll("_", " ") : translated;
}

export function listStatusExplanation(status: TaskStatus, locale: Locale = DEFAULT_LOCALE): string {
  const key = LIST_EXPLANATION_KEY[status];
  if (!key) {
    return translate(locale, "tasks.list.explanation.default");
  }
  const translated = translate(locale, key);
  return translated === key ? translate(locale, "tasks.list.explanation.default") : translated;
}

export function listPrimaryAction(
  status: TaskStatus,
  locale: Locale = DEFAULT_LOCALE,
): TaskListPrimaryAction | null {
  const key = LIST_ACTION_KEY[status];
  const tab = ACTION_TAB[status];
  if (!key || !tab) {
    return null;
  }
  const label = translate(locale, key);
  if (label === key) {
    return null;
  }
  return { label, tab };
}

export function formatListRelativeTime(iso: string | undefined, locale: Locale = DEFAULT_LOCALE): string | null {
  if (!iso) {
    return null;
  }
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(locale === "id" ? "id-ID" : "en-US", { numeric: "auto" });

  if (absSeconds < 60) {
    return translate(locale, "tasks.list.meta.updatedRelative", {
      relative: rtf.format(diffSeconds, "second"),
    });
  }
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return translate(locale, "tasks.list.meta.updatedRelative", {
      relative: rtf.format(diffMinutes, "minute"),
    });
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) {
    return translate(locale, "tasks.list.meta.updatedRelative", {
      relative: rtf.format(diffHours, "hour"),
    });
  }
  const diffDays = Math.round(diffHours / 24);
  return translate(locale, "tasks.list.meta.updatedRelative", {
    relative: rtf.format(diffDays, "day"),
  });
}

export function buildTaskListMetadataLine(task: TaskRecord, locale: Locale = DEFAULT_LOCALE): string {
  const version = `v${getContractVersion(task.contract)}`;
  const commit = abbreviateCommitSha(taskSourceCommitSha(task));
  const updated = formatListRelativeTime(task.updatedAt, locale);
  const parts = [version, commit];
  if (updated) {
    parts.push(updated);
  }
  return parts.join(" · ");
}

export function buildTaskListItemViewModel(
  task: TaskRecord,
  locale: Locale = DEFAULT_LOCALE,
): TaskListItemViewModel {
  const primaryAction = listPrimaryAction(task.status, locale);
  const defaultTab = suggestedTab(task.status);

  return {
    taskRef: formatTaskRef(task.id),
    statusLabel: listStatusLabel(task.status, locale),
    statusTone: listStatusTone(task.status),
    explanation: listStatusExplanation(task.status, locale),
    metadataLine: buildTaskListMetadataLine(task, locale),
    primaryAction: primaryAction ?? {
      label: translate(locale, "tasks.list.action.default"),
      tab: defaultTab,
    },
    defaultTab,
  };
}

export function sortTasksByRecency(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt);
    const rightTime = Date.parse(right.updatedAt || right.createdAt);
    if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
      return 0;
    }
    if (Number.isNaN(leftTime)) {
      return 1;
    }
    if (Number.isNaN(rightTime)) {
      return -1;
    }
    return rightTime - leftTime;
  });
}

export function displaysRawLifecycleStatus(label: string, status: TaskStatus): boolean {
  return label === status || /^[A-Z0-9_]+$/.test(label);
}
