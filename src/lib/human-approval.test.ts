import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import {
  applyHumanApproval,
  findExistingHumanApproval,
  isPendingHumanApproval,
} from "@/lib/human-approval";

const contract = buildContract("Demo goal for approval tests.");

function awaitingTask(runId = "run-1") {
  return {
    status: "AWAITING_APPROVAL" as const,
    contract,
    runnerState: {
      ...zeroChangeRunnerState("PASS demo"),
      runnerInvoked: true,
      filesChanged: 1,
      runId,
      correctionCount: 0,
    },
  };
}

describe("human approval", () => {
  test("approve commit records permission without setting commit flag", () => {
    const result = applyHumanApproval({
      task: awaitingTask(),
      decision: "APPROVE_COMMIT",
      action: "COMMIT",
      actorUserId: "user-1",
    });

    expect(result.status).toBe("CLOSED");
    expect(result.runnerState.commitApproved).toBe(true);
    expect(result.runnerState.commit).toBe(false);
    expect(result.runnerState.push).toBe(false);
    expect(result.runnerState.humanApprovals).toHaveLength(1);
    expect(result.runnerState.decisionLog?.at(-1)?.rule).toBe("human_gate");
  });

  test("approve commit is idempotent for same task run and action", () => {
    const task = awaitingTask();
    const first = applyHumanApproval({
      task,
      decision: "APPROVE_COMMIT",
      action: "COMMIT",
      actorUserId: "user-1",
    });

    const second = applyHumanApproval({
      task: { ...task, status: first.status, runnerState: first.runnerState },
      decision: "APPROVE_COMMIT",
      action: "COMMIT",
      actorUserId: "user-1",
    });

    expect(second.runnerState.humanApprovals).toHaveLength(1);
    expect(findExistingHumanApproval(second.runnerState, "APPROVE_COMMIT", "COMMIT", "run-1")).toBeDefined();
  });

  test("request revision returns to approved for execution when attempts remain", () => {
    const result = applyHumanApproval({
      task: awaitingTask(),
      decision: "REQUEST_REVISION",
      action: "COMMIT",
      actorUserId: "user-1",
      note: "Perlu penyesuaian copy",
    });

    expect(result.status).toBe("APPROVED_FOR_EXECUTION");
    expect(result.runnerState.revisionRequested).toBe(true);
    expect(result.runnerState.humanRevisionCount).toBe(1);
    expect(result.runnerState.lastAction).toBe("human_revision");
  });

  test("reject changes closes task without commit permission", () => {
    const result = applyHumanApproval({
      task: awaitingTask(),
      decision: "REJECT_CHANGES",
      action: "COMMIT",
      actorUserId: "user-1",
    });

    expect(result.status).toBe("CLOSED");
    expect(result.runnerState.rejected).toBe(true);
    expect(result.runnerState.commitApproved).toBeUndefined();
  });

  test("escalate review keeps awaiting approval with escalation flag", () => {
    const result = applyHumanApproval({
      task: awaitingTask(),
      decision: "ESCALATE_REVIEW",
      action: "COMMIT",
      actorUserId: "user-1",
    });

    expect(result.status).toBe("AWAITING_APPROVAL");
    expect(result.runnerState.escalated).toBe(true);
    expect(isPendingHumanApproval({ status: result.status, runnerState: result.runnerState })).toBe(true);
  });

  test("rejects approval when task is not awaiting human gate", () => {
    expect(() =>
      applyHumanApproval({
        task: {
          status: "CONTRACT_READY",
          contract,
          runnerState: zeroChangeRunnerState("draft"),
        },
        decision: "APPROVE_COMMIT",
        action: "COMMIT",
        actorUserId: "user-1",
      }),
    ).toThrow(/tidak tersedia/);
  });
});
