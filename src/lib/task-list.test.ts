import { describe, expect, test } from "bun:test";

import type { TaskRecord } from "@/lib/tasks-schema";
import {
  buildTaskListItemViewModel,
  displaysRawLifecycleStatus,
  listPrimaryAction,
  listStatusLabel,
  sortTasksByRecency,
} from "@/lib/task-list";
import { formatTaskRef } from "@/lib/task-display";

function baseTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    workspace: "buildloop-demo",
    goal: "Update README subtitle to mention governed autonomous software delivery.",
    status: "APPROVED_FOR_EXECUTION",
    contract: {
      goal: "Update README subtitle to mention governed autonomous software delivery.",
      inScope: ["README.md"],
      outOfScope: ["Deployment"],
      acceptanceCriteria: ["Only README.md is modified."],
      allowedActions: [],
      protectedPaths: [".env"],
      requiredChecks: ["file-scope check"],
      maxAttempts: 2,
    },
    blockedReasons: [],
    runnerState: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T12:00:00.000Z",
    lockedAt: "2026-01-01T12:00:00.000Z",
    projectId: null,
    sourceCommitSha: "ce2dcd82abcd1234567890abcdef1234567890abcd",
    ...overrides,
  };
}

describe("task list presentation", () => {
  test("FAILED renders human-readable status", () => {
    expect(listStatusLabel("FAILED", "en")).toBe("Failed");
    expect(listStatusLabel("FAILED", "id")).toBe("Gagal");
    expect(displaysRawLifecycleStatus(listStatusLabel("FAILED", "en"), "FAILED")).toBe(false);
  });

  test("APPROVED_FOR_EXECUTION renders Ready to run", () => {
    expect(listStatusLabel("APPROVED_FOR_EXECUTION", "en")).toBe("Ready to run");
    expect(listStatusLabel("APPROVED_FOR_EXECUTION", "id")).toBe("Siap dijalankan");
  });

  test("FAILED gets View evidence action", () => {
    const action = listPrimaryAction("FAILED", "en");
    expect(action?.label).toBe("View evidence");
    expect(action?.tab).toBe("evidence");
  });

  test("execution-ready task gets Run task action", () => {
    const action = listPrimaryAction("APPROVED_FOR_EXECUTION", "en");
    expect(action?.label).toBe("Run task");
    expect(action?.tab).toBe("orchestration");
  });

  test("identical goal text remains distinguishable by task ID and status", () => {
    const first = buildTaskListItemViewModel(
      baseTask({ id: "11111111-1111-4111-8111-111111111111", status: "FAILED" }),
      "en",
    );
    const second = buildTaskListItemViewModel(
      baseTask({ id: "22222222-2222-4222-8222-222222222222", status: "APPROVED_FOR_EXECUTION" }),
      "en",
    );

    expect(first.taskRef).not.toBe(second.taskRef);
    expect(first.statusLabel).not.toBe(second.statusLabel);
    expect(formatTaskRef("11111111-1111-4111-8111-111111111111")).toBe("BL-2026-1111");
    expect(formatTaskRef("22222222-2222-4222-8222-222222222222")).toBe("BL-2026-2222");
  });

  test("raw lifecycle enums are not displayed in list labels", () => {
    const statuses = [
      "APPROVED_FOR_EXECUTION",
      "FAILED",
      "BLOCKED",
      "AWAITING_APPROVAL",
      "CONTRACT_READY",
    ] as const;

    for (const status of statuses) {
      expect(displaysRawLifecycleStatus(listStatusLabel(status, "en"), status)).toBe(false);
    }
  });

  test("EN and ID labels resolve correctly", () => {
    expect(buildTaskListItemViewModel(baseTask({ status: "FAILED" }), "en").explanation).toContain(
      "Automatic correction reached the limit",
    );
    expect(buildTaskListItemViewModel(baseTask({ status: "FAILED" }), "id").explanation).toContain(
      "Perbaikan otomatis mencapai batas",
    );
    expect(
      buildTaskListItemViewModel(baseTask({ status: "APPROVED_FOR_EXECUTION" }), "en").explanation,
    ).toContain("Contract locked and ready for orchestration");
  });

  test("invalid actions are not shown for unknown lifecycle state", () => {
    expect(listPrimaryAction("DRAFT", "en")?.tab).toBe("contract");
    expect(listPrimaryAction("INSPECTING", "en")?.label).toBe("View orchestration");
    expect(listPrimaryAction("STALE", "en")?.label).toBe("Refresh contract");
  });

  test("tasks sort by latest updated first", () => {
    const sorted = sortTasksByRecency([
      baseTask({ id: "11111111-1111-4111-8111-111111111111", updatedAt: "2026-01-01T00:00:00.000Z" }),
      baseTask({ id: "22222222-2222-4222-8222-222222222222", updatedAt: "2026-01-03T00:00:00.000Z" }),
      baseTask({ id: "33333333-3333-4333-8333-333333333333", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ]);

    expect(sorted.map((task) => task.id)).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "11111111-1111-4111-8111-111111111111",
    ]);
  });
});
