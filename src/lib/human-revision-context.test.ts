import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import { applyHumanApproval } from "@/lib/human-approval";
import { assembleWorkerContext } from "@/orchestrator/context/assemble";
import { testContract } from "@/orchestrator/governance/test-helpers";
import type { ResolvedProjectPolicy } from "@/orchestrator/policy/policy-schema";

const contract = buildContract("Demo goal for revision context tests.");

const policy = {
  execution: { auto_approve_low_risk: false },
  protected_paths: [],
  instructionsSummary: null,
} as ResolvedProjectPolicy;

function awaitingTask(runId = "run-revision-1") {
  return {
    status: "AWAITING_APPROVAL" as const,
    contract,
    runnerState: {
      ...zeroChangeRunnerState("PASS demo"),
      runnerInvoked: true,
      filesChanged: 1,
      runId,
      correctionCount: 2,
    },
  };
}

describe("human revision context", () => {
  test("revision note persists in runner state and approval record", () => {
    const note = "Preserve all existing README.md content. Add only the requested sentence.";
    const result = applyHumanApproval({
      task: awaitingTask(),
      decision: "REQUEST_REVISION",
      action: "COMMIT",
      actorUserId: "user-1",
      note,
    });

    expect(result.runnerState.humanRevisionInstruction).toBe(note);
    expect(result.runnerState.humanApprovals?.at(-1)?.note).toBe(note);
    expect(result.runnerState.humanRevisionCount).toBe(1);
    expect(result.runnerState.correctionCount).toBe(2);
  });

  test("human revision count stays separate from automatic correction count", () => {
    const task = awaitingTask();
    task.runnerState.correctionCount = 2;

    const result = applyHumanApproval({
      task,
      decision: "REQUEST_REVISION",
      action: "COMMIT",
      actorUserId: "user-1",
      note: "Fix copy only.",
    });

    expect(result.runnerState.humanRevisionCount).toBe(1);
    expect(result.runnerState.correctionCount).toBe(2);
    expect(result.runnerState.lastAction).toBe("human_revision");
  });

  test("revision note reaches worker planning context payload", () => {
    const instruction = "Do not remove unrelated README sections.";
    const context = assembleWorkerContext({
      contract: testContract(),
      policy,
      humanRevisionInstruction: instruction,
    });

    expect(context.payload.humanRevisionInstruction).toBe(instruction);
  });

  test("reject persists optional reason when supplied", () => {
    const result = applyHumanApproval({
      task: awaitingTask(),
      decision: "REJECT_CHANGES",
      action: "COMMIT",
      actorUserId: "user-1",
      note: "Scope drift from contract.",
    });

    expect(result.status).toBe("CLOSED");
    expect(result.runnerState.rejected).toBe(true);
    expect(result.runnerState.humanApprovals?.at(-1)?.note).toBe("Scope drift from contract.");
  });

  test("additional review stores review type and note without implying routing", () => {
    const result = applyHumanApproval({
      task: awaitingTask(),
      decision: "ESCALATE_REVIEW",
      action: "COMMIT",
      actorUserId: "user-1",
      reviewType: "security",
      note: "Verify auth boundary changes.",
    });

    expect(result.status).toBe("AWAITING_APPROVAL");
    expect(result.runnerState.pendingAdditionalReview).toEqual({
      reviewType: "security",
      note: "Verify auth boundary changes.",
    });
    expect(result.runnerState.humanApprovals?.at(-1)?.reviewType).toBe("security");
  });

  test("old approval records without reviewType load gracefully", () => {
    const legacyRecord = {
      decision: "APPROVE_COMMIT" as const,
      action: "COMMIT" as const,
      actorUserId: "user-legacy",
      runId: "run-old",
      note: null,
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const runnerState = {
      ...zeroChangeRunnerState("legacy"),
      commitApproved: true,
      humanApprovals: [legacyRecord],
    };

    expect(runnerState.humanApprovals?.[0]?.reviewType).toBeUndefined();
    expect(runnerState.humanRevisionInstruction).toBeUndefined();
  });
});
