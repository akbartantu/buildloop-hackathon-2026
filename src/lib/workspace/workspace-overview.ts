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

/** Ensures overview layout classes do not introduce horizontal overflow. */
export function workspaceOverviewLayoutClassName(): string {
  return "mx-auto w-full max-w-full overflow-x-hidden";
}

/**
 * Desktop grid: workspace header in row 1 / col 1; card area row 2 / col 1; usage row 2 / col 2.
 * Usage aligns with the workspace cards, not the page heading.
 */
export function workspaceOverviewContentClassName(): string {
  return "grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-9 lg:gap-y-8 xl:grid-cols-[minmax(0,1fr)_360px]";
}

/** Workspace title + create button — occupies main column only on desktop. */
export function workspaceOverviewHeaderClassName(): string {
  return "min-w-0 lg:col-start-1 lg:row-start-1";
}

/** Section label + workspace card grid — main column, second row on desktop. */
export function workspaceOverviewCardsRegionClassName(): string {
  return "min-w-0 space-y-6 lg:col-start-1 lg:row-start-2";
}

/** Usage sidebar — right column, aligned with card row on desktop. */
export function workspaceOverviewSidebarClassName(): string {
  return "w-full shrink-0 self-start lg:col-start-2 lg:row-start-2 lg:w-full lg:max-w-[360px]";
}

/**
 * Two-column workspace card grid with bounded width so cards stay normal size
 * and a single empty-state tile does not stretch across both columns.
 */
export function workspaceOverviewGridClassName(): string {
  return "grid w-full max-w-[788px] grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-7";
}
