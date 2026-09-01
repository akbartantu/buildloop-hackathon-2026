import { describe, expect, test } from "bun:test";

import { translate } from "@/i18n";
import type { ProjectRecord } from "@/lib/projects/project-record";
import { buildContract } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import {
  buildWorkspaceUsageRows,
  formatRelativeTime,
  formatTaskCountLabel,
  formatWorkspaceCountSummary,
  LIST_TASKS_RESULT_LIMIT,
  resolveWorkspaceOverviewStats,
  workspaceOverviewLayoutClassName,
  workspaceOverviewGridClassName,
} from "@/lib/workspace/workspace-overview";

function makeProject(id: string): ProjectRecord {
  const now = "2026-09-01T10:00:00.000Z";
  return {
    id,
    name: "owner/repo",
    sourceType: "public_github",
    repositoryUrl: "https://github.com/owner/repo",
    repositoryOwner: "owner",
    repositoryName: "repo",
    defaultBranch: "main",
    connectedCommitSha: "abc123",
    disconnectedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeTask(id: string, projectId: string, updatedAt: string): TaskRecord {
  return {
    id,
    workspace: "https://github.com/owner/repo",
    goal: "Example task",
    status: "DRAFT",
    contract: buildContract("Example task"),
    blockedReasons: [],
    runnerState: null,
    createdAt: updatedAt,
    updatedAt,
    lockedAt: null,
    projectId,
    sourceCommitSha: null,
  };
}

describe("workspace overview helpers", () => {
  test("formats workspace count summary without inventing limits", () => {
    const t = (key: Parameters<typeof formatWorkspaceCountSummary>[1] extends infer Fn ? Fn extends (...args: infer A) => string ? A[0] : never : never, params?: { count: number }) =>
      translate("en", key, params);

    expect(formatWorkspaceCountSummary(0, t)).toBe("No workspaces yet");
    expect(formatWorkspaceCountSummary(1, t)).toBe("1 active workspace");
    expect(formatWorkspaceCountSummary(3, t)).toBe("3 active workspaces");
  });

  test("usage rows only include real workspace count", () => {
    expect(buildWorkspaceUsageRows(2)).toEqual([
      { id: "workspaces", labelKey: "workspaceOverview.workspacesLabel", value: "2" },
    ]);
    expect(buildWorkspaceUsageRows(2).some((row) => row.value.includes("/"))).toBe(false);
  });

  test("resolves per-project stats from real task records", () => {
    const project = makeProject("project-a");
    const tasks = [
      makeTask("task-1", "project-a", "2026-09-01T12:00:00.000Z"),
      makeTask("task-2", "other-project", "2026-09-01T11:00:00.000Z"),
    ];

    expect(resolveWorkspaceOverviewStats(tasks, project)).toEqual({
      taskCount: 1,
      taskCountCapped: false,
      latestTaskStatus: "DRAFT",
      lastActivityAt: "2026-09-01T12:00:00.000Z",
    });
  });

  test("marks task count as capped when listTasks result limit is reached", () => {
    const project = makeProject("project-a");
    const tasks = Array.from({ length: LIST_TASKS_RESULT_LIMIT }, (_, index) =>
      makeTask(`task-${index}`, "project-a", "2026-09-01T12:00:00.000Z"),
    );

    expect(resolveWorkspaceOverviewStats(tasks, project).taskCountCapped).toBe(true);
    expect(resolveWorkspaceOverviewStats(tasks, project).taskCount).toBe(LIST_TASKS_RESULT_LIMIT);
  });

  test("formats exact task count labels below the listTasks cap", () => {
    const t = (
      key: "workspaceOverview.taskCount" | "workspaceOverview.taskCountSingle" | "workspaceOverview.taskCountCapped",
      params?: { count: number; limit: number },
    ) => translate("en", key, params);

    expect(formatTaskCountLabel(0, t)).toBe("0 tasks");
    expect(formatTaskCountLabel(1, t)).toBe("1 task");
    expect(formatTaskCountLabel(12, t)).toBe("12 tasks");
    expect(formatTaskCountLabel(LIST_TASKS_RESULT_LIMIT - 1, t)).toBe("19 tasks");
  });

  test("formats capped task count labels at the listTasks limit", () => {
    const tEn = (
      key: "workspaceOverview.taskCount" | "workspaceOverview.taskCountSingle" | "workspaceOverview.taskCountCapped",
      params?: { count: number; limit: number },
    ) => translate("en", key, params);
    const tId = (
      key: "workspaceOverview.taskCount" | "workspaceOverview.taskCountSingle" | "workspaceOverview.taskCountCapped",
      params?: { count: number; limit: number },
    ) => translate("id", key, params);

    expect(formatTaskCountLabel(LIST_TASKS_RESULT_LIMIT, tEn, { capped: true })).toBe("20+ tasks");
    expect(formatTaskCountLabel(LIST_TASKS_RESULT_LIMIT, tId, { capped: true })).toBe("20+ tugas");
  });

  test("formats task count labels", () => {
    const t = (key: "workspaceOverview.taskCount" | "workspaceOverview.taskCountSingle", params?: { count: number }) =>
      translate("en", key, params);

    expect(formatTaskCountLabel(1, t)).toBe("1 task");
    expect(formatTaskCountLabel(4, t)).toBe("4 tasks");
  });

  test("layout class avoids intentional horizontal overflow", () => {
    expect(workspaceOverviewLayoutClassName()).toContain("overflow-x-hidden");
    expect(workspaceOverviewLayoutClassName()).toContain("max-w-full");
  });

  test("grid class supports create-first responsive columns", () => {
    expect(workspaceOverviewGridClassName()).toContain("grid-cols-1");
    expect(workspaceOverviewGridClassName()).toContain("sm:grid-cols-2");
    expect(workspaceOverviewGridClassName()).toContain("xl:grid-cols-4");
  });

  test("relative time formatting supports EN locale", () => {
    const now = Date.parse("2026-09-01T12:00:00.000Z");
    expect(formatRelativeTime("2026-09-01T11:30:00.000Z", "en", now)).toMatch(/minute|hour|ago/i);
  });
});

describe("workspace overview i18n", () => {
  test("EN and ID labels render correctly", () => {
    expect(translate("en", "workspaceOverview.title")).toBe("Your Workspaces");
    expect(translate("id", "workspaceOverview.title")).toBe("Workspace Anda");
    expect(translate("en", "workspaceOverview.allWorkspaces")).toBe("All workspaces");
    expect(translate("id", "workspaceOverview.allWorkspaces")).toBe("Semua workspace");
    expect(translate("en", "workspaceOverview.noPlanData")).toContain("not available");
    expect(translate("id", "workspaceOverview.noPlanData")).toContain("belum tersedia");
  });
});
