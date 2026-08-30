import { describe, expect, test } from "bun:test";
import { getContractHandoff, handoffActionToTab, isActiveRun } from "./contract-handoff";
import type { TaskRecord } from "./tasks-schema";

function taskWithStatus(status: TaskRecord["status"], overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    workspace: "buildloop-demo",
    goal: "Demo task",
    status,
    contract: {
      goal: "Demo task",
      inScope: ["src"],
      outOfScope: [],
      acceptanceCriteria: ["Done"],
      allowedActions: ["edit"],
      protectedPaths: [".env"],
      requiredChecks: ["typecheck"],
      maxAttempts: 2,
    },
    blockedReasons: [],
    runnerState: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lockedAt: status === "APPROVED_FOR_EXECUTION" ? "2026-01-01T00:00:00.000Z" : null,
    projectId: null,
    sourceCommitSha: null,
    ...overrides,
  };
}

describe("getContractHandoff", () => {
  test("CONTRACT_READY offers approve as primary", () => {
    const handoff = getContractHandoff(taskWithStatus("CONTRACT_READY"), {
      running: false,
      approving: false,
    });
    expect(handoff.primaryAction).toBe("approve");
    expect(handoff.showNextSteps).toBe(true);
  });

  test("APPROVED_FOR_EXECUTION offers run orchestration", () => {
    const handoff = getContractHandoff(taskWithStatus("APPROVED_FOR_EXECUTION"), {
      running: false,
      approving: false,
    });
    expect(handoff.primaryLabel).toBe("Start orchestration");
    expect(handoff.primaryAction).toBe("run");
  });

  test("active run shows view orchestration", () => {
    const handoff = getContractHandoff(taskWithStatus("RUNNING"), {
      running: false,
      approving: false,
    });
    expect(handoff.primaryAction).toBe("view-orchestration");
    expect(isActiveRun("RUNNING")).toBe(true);
  });

  test("BLOCKED does not offer run", () => {
    const handoff = getContractHandoff(taskWithStatus("BLOCKED"), {
      running: false,
      approving: false,
    });
    expect(handoff.primaryAction).not.toBe("run");
    expect(handoff.primaryAction).toBe("view-orchestration");
  });

  test("PASS directs to evidence", () => {
    const handoff = getContractHandoff(taskWithStatus("PASS"), {
      running: false,
      approving: false,
    });
    expect(handoff.primaryAction).toBe("view-evidence");
  });
});

describe("handoffActionToTab", () => {
  test("maps view actions to tabs", () => {
    expect(handoffActionToTab("view-orchestration")).toBe("orchestration");
    expect(handoffActionToTab("view-evidence")).toBe("evidence");
    expect(handoffActionToTab("run")).toBeNull();
  });
});
