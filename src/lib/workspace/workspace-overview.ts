import type { Locale } from "@/i18n";
import type { ProjectRecord } from "@/lib/projects/project-record";
import type { TaskRecord } from "@/lib/tasks-schema";
import { LIST_TASKS_RESULT_LIMIT } from "@/lib/tasks-schema";

export { LIST_TASKS_RESULT_LIMIT };

export type WorkspaceUsageRow = {
  id: string;
  labelKey: "workspaceOverview.workspacesLabel";
  value: string;
};

export type WorkspaceOverviewStats = {
  taskCount: number;
  taskCountCapped: boolean;
  latestTaskStatus: TaskRecord["status"] | null;
  lastActivityAt: string | null;
};

export function formatWorkspaceCountSummary(
  count: number,
  translate: (key: "workspaceOverview.countSummary" | "workspaceOverview.countSummarySingle" | "workspaceOverview.countSummaryZero", params?: { count: number }) => string,
): string {
  if (count === 0) {
    return translate("workspaceOverview.countSummaryZero");
  }
  if (count === 1) {
    return translate("workspaceOverview.countSummarySingle");
  }
  return translate("workspaceOverview.countSummary", { count });
}

export function buildWorkspaceUsageRows(workspaceCount: number): WorkspaceUsageRow[] {
  if (workspaceCount < 0) {
    return [];
  }

  return [
    {
      id: "workspaces",
      labelKey: "workspaceOverview.workspacesLabel",
      value: String(workspaceCount),
    },
  ];
}

export function resolveWorkspaceOverviewStats(
  tasks: TaskRecord[],
  project: ProjectRecord,
): WorkspaceOverviewStats {
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  const latestTask = projectTasks[0] ?? null;
  const lastActivityAt = latestTask?.updatedAt ?? project.updatedAt;

  return {
    taskCount: projectTasks.length,
    taskCountCapped: projectTasks.length >= LIST_TASKS_RESULT_LIMIT,
    latestTaskStatus: latestTask?.status ?? null,
    lastActivityAt,
  };
}

export function formatRelativeTime(iso: string, locale: Locale, nowMs = Date.now()): string {
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
  if (Math.abs(diffHours) < 48) {
    return rtf.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

export function formatTaskCountLabel(
  count: number,
  translate: (
    key: "workspaceOverview.taskCount" | "workspaceOverview.taskCountSingle" | "workspaceOverview.taskCountCapped",
    params?: { count?: number; limit?: number },
  ) => string,
  options?: { capped?: boolean },
): string {
  if (options?.capped) {
    return translate("workspaceOverview.taskCountCapped", { limit: LIST_TASKS_RESULT_LIMIT });
  }
  if (count === 1) {
    return translate("workspaceOverview.taskCountSingle");
  }
  return translate("workspaceOverview.taskCount", { count });
}

/** Compact centered dashboard container — fits two workspace columns plus Usage without dead space. */
export function workspaceOverviewLayoutClassName(): string {
  return "mx-auto w-full max-w-[1080px] overflow-x-hidden";
}

/**
 * Three-column dashboard grid on desktop: workspace | workspace | usage.
 * Header spans full width; cards auto-flow in columns 1–2 via display:contents wrapper.
 */
export function workspaceOverviewContentClassName(): string {
  return "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_350px] lg:gap-x-7 lg:gap-y-6";
}

/** Full-width header row spanning all dashboard columns. */
export function workspaceOverviewHeaderClassName(): string {
  return "col-span-full";
}

/** Section label above workspace columns 1–2 on desktop. */
export function workspaceOverviewSectionLabelClassName(): string {
  return "col-span-full lg:col-span-2 lg:col-start-1";
}

/** Usage occupies dashboard column 3, aligned with the first workspace-card row. */
export function workspaceOverviewUsageClassName(): string {
  return "col-span-full h-fit self-start lg:col-start-3 lg:row-start-3";
}

/** Loading / empty states in the workspace-card area only. */
export function workspaceOverviewWorkspaceAreaClassName(): string {
  return "col-span-full lg:col-span-2 lg:col-start-1";
}

/** Lets workspace cards participate directly in the parent 3-column grid. */
export function workspaceOverviewGridContentsClassName(): string {
  return "contents";
}
