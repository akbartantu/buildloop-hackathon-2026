import { describe, expect, test } from "bun:test";

import type { TaskRecord } from "@/lib/tasks-schema";
import {
  assertTaskOrchestrationEligible,
  canReviseTask,
  canUpdateDraft,
  detectSourceCommitDrift,
  getContractVersion,
  isOrchestrationEligible,
  isTaskLocked,
  taskHasExecuted,
} from "./task-lifecycle-ops";

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    workspace: "https://github.com/owner/a",
    goal: "Goal",
    status: "CONTRACT_READY",
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
    lockedAt: null,
    projectId: "11111111-1111-4111-8111-111111111111",
    sourceCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    ...overrides,
  };
}

describe("task lifecycle ops", () => {
  test("draft task is editable", () => {
    expect(canUpdateDraft(task({ status: "DRAFT" }))).toBe(true);
    expect(canUpdateDraft(task({ status: "CONTRACT_READY" }))).toBe(true);
  });

  test("locked task is not editable as draft", () => {
    expect(canUpdateDraft(task({ status: "APPROVED_FOR_EXECUTION", lockedAt: "2026-01-02T00:00:00.000Z" }))).toBe(
      false,
    );
  });

  test("locked task without execution can be revised", () => {
    expect(
      canReviseTask(task({ status: "APPROVED_FOR_EXECUTION", lockedAt: "2026-01-02T00:00:00.000Z" })),
    ).toBe(true);
  });

  test("executed task cannot be revised in place", () => {
    expect(
      canReviseTask(
        task({
          status: "RUNNING",
          lockedAt: "2026-01-02T00:00:00.000Z",
          runnerState: { runnerInvoked: true, filesChanged: 0, commandsExecuted: 0, commit: false, push: false, note: "" },
        }),
      ),
    ).toBe(false);
  });

  test("source commit drift detection", () => {
    const base = task();
    expect(detectSourceCommitDrift(base, "abc1234567890abcdef1234567890abcdef123456")).toBe(false);
    expect(detectSourceCommitDrift(base, "def4567890abcdef4567890abcdef4567890abcd")).toBe(true);
    expect(detectSourceCommitDrift(task({ projectId: null, sourceCommitSha: null }), "abc")).toBe(false);
  });

  test("contract version defaults to 1", () => {
    expect(getContractVersion(task().contract)).toBe(1);
  });

  test("isTaskLocked and taskHasExecuted", () => {
    expect(isTaskLocked(task())).toBe(false);
    expect(isTaskLocked(task({ lockedAt: "2026-01-02T00:00:00.000Z" }))).toBe(true);
    expect(taskHasExecuted(task())).toBe(false);
  });

  test("orchestration eligibility rejects completed runs and allows human revision", () => {
    expect(
      isOrchestrationEligible(
        task({ status: "APPROVED_FOR_EXECUTION", lockedAt: "2026-01-02T00:00:00.000Z" }),
      ),
    ).toBe(true);
    expect(
      isOrchestrationEligible(
        task({
          status: "AWAITING_APPROVAL",
          lockedAt: "2026-01-02T00:00:00.000Z",
          runnerState: {
            runnerInvoked: true,
            filesChanged: 1,
            commandsExecuted: 0,
            commit: false,
            push: false,
            note: "PASS",
            runId: "run-1",
          },
        }),
      ),
    ).toBe(false);
    expect(
      isOrchestrationEligible(
        task({
          status: "APPROVED_FOR_EXECUTION",
          lockedAt: "2026-01-02T00:00:00.000Z",
          runnerState: {
            runnerInvoked: true,
            filesChanged: 1,
            commandsExecuted: 0,
            commit: false,
            push: false,
            note: "PASS",
            runId: "run-1",
            revisionRequested: true,
          },
        }),
      ),
    ).toBe(true);
    expect(() =>
      assertTaskOrchestrationEligible(
        task({
          status: "AWAITING_APPROVAL",
          lockedAt: "2026-01-02T00:00:00.000Z",
          runnerState: {
            runnerInvoked: true,
            filesChanged: 1,
            commandsExecuted: 0,
            commit: false,
            push: false,
            note: "PASS",
            runId: "run-1",
          },
        }),
      ),
    ).toThrow("Task harus berstatus APPROVED_FOR_EXECUTION sebelum diorkestrasi.");
  });
});
