import { describe, expect, test } from "bun:test";

import { getContractHandoff } from "@/lib/contract-handoff";
import { shouldPollTaskStatus } from "@/lib/lifecycle-progress";
import { buildTaskListItemViewModel } from "@/lib/task-list";
import {
  assertTaskOrchestrationEligible,
  isOrchestrationEligible,
  isOrchestrationInProgressStatus,
} from "@/lib/task-lifecycle-ops";
import {
  buildActiveRunRunnerState,
  isPersistableActiveRunStatus,
  isTaskActivelyRunning,
  resolveTaskRunningState,
  RUN_START_ELIGIBLE_STATUSES,
} from "@/lib/task-run-progress";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import type { TaskRecord } from "@/lib/tasks-schema";
import { DEFAULT_LOCALE } from "@/i18n";
import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    workspace: "https://github.com/owner/a",
    goal: "Goal",
    status: "APPROVED_FOR_EXECUTION",
    contract: {
      goal: "Goal",
      inScope: ["README.md"],
      outOfScope: [],
      acceptanceCriteria: ["Done"],
      allowedActions: [],
      protectedPaths: [],
      requiredChecks: [],
      maxAttempts: 2,
    },
    blockedReasons: [],
    runnerState: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lockedAt: "2026-01-02T00:00:00.000Z",
    projectId: "11111111-1111-4111-8111-111111111111",
    sourceCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    ...overrides,
  };
}

describe("task run-state persistence", () => {
  test("APPROVED_FOR_EXECUTION transitions to INSPECTING before execution", async () => {
    const repo = createDevTaskRepository();
    await repo.resetForTests();
    const created = await repo.createTask({
      goal: "Run me",
      workspace: "buildloop-demo",
      userId: DEV_AUTH_BYPASS_USER_ID,
    });
    const locked =
      created.status === "APPROVED_FOR_EXECUTION"
        ? created
        : await repo.lockContract({ id: created.id, userId: DEV_AUTH_BYPASS_USER_ID });

    const active = await repo.updateRunProgress({
      id: locked.id,
      status: "INSPECTING",
      runnerState: buildActiveRunRunnerState(locked.runnerState, { status: "INSPECTING", runId: "run-1" }),
      onlyFromStatuses: RUN_START_ELIGIBLE_STATUSES,
    });

    expect(active.status).toBe("INSPECTING");
    expect(active.runnerState?.note).toBe("Orchestration in progress.");
    expect(active.runnerState?.runId).toBe("run-1");
  });

  test("duplicate run start is rejected while status is active", async () => {
    const repo = createDevTaskRepository();
    await repo.resetForTests();
    const created = await repo.createTask({
      goal: "Run once",
      workspace: "buildloop-demo",
      userId: DEV_AUTH_BYPASS_USER_ID,
    });
    const locked =
      created.status === "APPROVED_FOR_EXECUTION"
        ? created
        : await repo.lockContract({ id: created.id, userId: DEV_AUTH_BYPASS_USER_ID });
    await repo.updateRunProgress({
      id: locked.id,
      status: "RUNNING",
      runnerState: buildActiveRunRunnerState(locked.runnerState, { status: "RUNNING" }),
      onlyFromStatuses: RUN_START_ELIGIBLE_STATUSES,
    });

    expect(() =>
      assertTaskOrchestrationEligible(
        task({
          id: locked.id,
          status: "RUNNING",
        }),
      ),
    ).toThrow("Orchestrator sudah berjalan untuk task ini.");

    await expect(
      repo.updateRunProgress({
        id: locked.id,
        status: "INSPECTING",
        runnerState: buildActiveRunRunnerState(null, { status: "INSPECTING" }),
        onlyFromStatuses: RUN_START_ELIGIBLE_STATUSES,
      }),
    ).rejects.toThrow("Orchestrator sudah berjalan untuk task ini.");
  });

  test("active statuses are not orchestration eligible", () => {
    for (const status of ["INSPECTING", "RUNNING", "CHECKING", "NEEDS_CORRECTION"] as const) {
      expect(isOrchestrationEligible(task({ status }))).toBe(false);
      expect(isOrchestrationInProgressStatus(status)).toBe(true);
      expect(isPersistableActiveRunStatus(status)).toBe(true);
    }
  });

  test("active persisted state presents Running in task list and handoff", () => {
    const runningTask = task({ status: "RUNNING" });
    const listItem = buildTaskListItemViewModel(runningTask, DEFAULT_LOCALE);
    expect(listItem.statusLabel.toLowerCase()).toContain("running");

    const handoff = getContractHandoff(runningTask, { running: false, approving: false }, DEFAULT_LOCALE);
    expect(handoff.primaryAction).toBe("view-orchestration");
    expect(handoff.statusNote).toBeTruthy();
  });

  test("active persisted state enables polling and navigation remount semantics", () => {
    const runningTask = task({ status: "CHECKING" });
    expect(shouldPollTaskStatus(runningTask.status)).toBe(true);
    expect(isTaskActivelyRunning(runningTask)).toBe(true);
    expect(resolveTaskRunningState(runningTask, false)).toBe(true);
    expect(resolveTaskRunningState(task({ status: "APPROVED_FOR_EXECUTION" }), false)).toBe(false);
    expect(resolveTaskRunningState(task({ status: "APPROVED_FOR_EXECUTION" }), true)).toBe(true);
  });

  test("terminal updateAfterRun replaces active state", async () => {
    const repo = createDevTaskRepository();
    await repo.resetForTests();
    const created = await repo.createTask({
      goal: "Finish me",
      workspace: "buildloop-demo",
      userId: DEV_AUTH_BYPASS_USER_ID,
    });
    const locked =
      created.status === "APPROVED_FOR_EXECUTION"
        ? created
        : await repo.lockContract({ id: created.id, userId: DEV_AUTH_BYPASS_USER_ID });
    await repo.updateRunProgress({
      id: locked.id,
      status: "RUNNING",
      runnerState: buildActiveRunRunnerState(locked.runnerState, { status: "RUNNING", runId: "run-final" }),
    });

    const terminal = await repo.updateAfterRun({
      id: locked.id,
      status: "AWAITING_APPROVAL",
      runnerState: {
        runnerInvoked: true,
        filesChanged: 1,
        commandsExecuted: 1,
        commit: false,
        push: false,
        note: "PASS",
        runId: "run-final",
      },
    });

    expect(terminal.status).toBe("AWAITING_APPROVAL");
    expect(isTaskActivelyRunning(terminal)).toBe(false);
    expect(shouldPollTaskStatus(terminal.status)).toBe(false);
  });
});
