import { describe, expect, test } from "bun:test";
import {
  buildActivityEvents,
  friendlyStatusLabel,
  getAttentionState,
  getEvidenceSnapshot,
  getJourneySteps,
} from "./task-overview";
import type { TaskRecord } from "./tasks-schema";

function baseTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    workspace: "buildloop-demo",
    goal: "Demo task goal",
    status: "APPROVED_FOR_EXECUTION",
    contract: {
      goal: "Demo task goal",
      inScope: ["File sumber aplikasi yang relevan"],
      outOfScope: ["Deployment"],
      acceptanceCriteria: ["Done"],
      allowedActions: ["edit"],
      protectedPaths: [".env"],
      requiredChecks: ["typecheck"],
      maxAttempts: 2,
    },
    blockedReasons: [],
    runnerState: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    lockedAt: "2026-01-01T12:00:00.000Z",
    projectId: null,
    sourceCommitSha: null,
    ...overrides,
  };
}

describe("friendlyStatusLabel", () => {
  test("maps technical status to user-facing label", () => {
    expect(friendlyStatusLabel("APPROVED_FOR_EXECUTION")).toBe("Approved for execution");
    expect(friendlyStatusLabel("CONTRACT_READY")).toBe("Awaiting contract approval");
    expect(friendlyStatusLabel("APPROVED_FOR_EXECUTION", "id")).toBe("Disetujui untuk dieksekusi");
    expect(friendlyStatusLabel("BLOCKED")).toBe("Blocked");
    expect(friendlyStatusLabel("BLOCKED", "id")).toBe("Diblokir");
    expect("BLOCKED").toBe("BLOCKED");
  });
});

describe("getJourneySteps", () => {
  test("approved task has orchestration as current", () => {
    const steps = getJourneySteps("APPROVED_FOR_EXECUTION");
    expect(steps.find((s) => s.key === "contract")?.state).toBe("complete");
    expect(steps.find((s) => s.key === "orchestration")?.state).toBe("current");
  });

  test("blocked task marks preflight blocked", () => {
    const steps = getJourneySteps("BLOCKED");
    expect(steps.find((s) => s.key === "preflight")?.state).toBe("blocked");
  });
});

describe("getEvidenceSnapshot", () => {
  test("returns unavailable before run", () => {
    const snapshot = getEvidenceSnapshot(baseTask());
    expect(snapshot.available).toBe(false);
  });

  test("returns real metrics after run", () => {
    const snapshot = getEvidenceSnapshot(
      baseTask({
        status: "PASS",
        runnerState: {
          runnerInvoked: true,
          filesChanged: 2,
          commandsExecuted: 3,
          commit: false,
          push: false,
          note: "ok",
          correctionCount: 0,
          evidence: [
            { category: "check", name: "typecheck", status: "pass", summary: "ok" },
          ],
        },
      }),
    );
    expect(snapshot.available).toBe(true);
    expect(snapshot.filesChanged).toBe(2);
  });
});

describe("buildActivityEvents", () => {
  test("includes created and locked milestones", () => {
    const events = buildActivityEvents(baseTask(), "en");
    expect(events.some((e) => e.label === "Task created")).toBe(true);
    expect(events.some((e) => e.label === "Contract approved")).toBe(true);
  });
});

describe("getAttentionState", () => {
  test("returns attention for blocked tasks", () => {
    const attention = getAttentionState(
      baseTask({ status: "BLOCKED", blockedReasons: [{ rule: "x", explanation: "blocked", protectedTarget: "y" }] }),
    );
    expect(attention?.ctaTab).toBe("evidence");
  });

  test("returns null for ready task", () => {
    expect(getAttentionState(baseTask())).toBeNull();
  });
});
