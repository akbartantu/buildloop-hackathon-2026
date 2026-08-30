import { afterEach, describe, expect, test } from "bun:test";

import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import { ProductOrchestrator } from "@/orchestrator/product/orchestrator";
import { getWorkspaceRoot } from "@/orchestrator/product/orchestrator";
import { BLOCKED_DEMO_GOAL, PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";

describe("dev bypass vertical slice", () => {
  const repo = createDevTaskRepository();
  const orchestrator = new ProductOrchestrator(getWorkspaceRoot());

  afterEach(async () => {
    await repo.resetForTests();
  });

  test(
    "PASS scenario: create → approve → orchestrate → evidence → approval state",
    async () => {
    const created = await repo.createTask({
      userId: DEV_AUTH_BYPASS_USER_ID,
      goal: PASS_DEMO_GOAL,
    });
    expect(created.status).toBe("APPROVED_FOR_EXECUTION");
    expect(created.runnerState?.orchestration?.approvalType).toBe("AUTO_APPROVED_BY_POLICY");

    const approved = created.lockedAt
      ? created
      : await repo.lockContract({
          id: created.id,
          userId: DEV_AUTH_BYPASS_USER_ID,
        });
    expect(approved.status).toBe("APPROVED_FOR_EXECUTION");

    const result = await orchestrator.execute({
      goal: approved.goal,
      taskId: approved.id,
      contractId: approved.id,
      allowDirtyWorkspace: true,
    });

    expect(result.run.verdict).toBe("PASS");
    expect(result.run.counters.workerCalls).toBeGreaterThan(0);

    const updated = await repo.updateAfterRun({
      id: approved.id,
      status: "AWAITING_APPROVAL",
      runnerState: {
        runnerInvoked: result.run.counters.workerCalls > 0,
        filesChanged: result.run.counters.filesChanged,
        commandsExecuted: result.run.counters.commandsExecuted,
        commit: false,
        push: false,
        note: result.run.verdictReason ?? "PASS",
        runId: result.run.id,
        workerId: result.run.workerId,
        correctionCount: result.run.counters.correctionCount,
        evidence: result.evidence.map((item) => ({
          category: item.category,
          name: item.name,
          status: item.status,
          summary: item.summary,
        })),
        decisionLog: result.decisionLog,
      },
    });

    expect(updated.status).toBe("AWAITING_APPROVAL");
    expect(updated.runnerState?.evidence?.length).toBeGreaterThan(0);
    expect(updated.runnerState?.correctionCount).toBe(1);

    const committed = await repo.recordHumanApproval({
      id: approved.id,
      userId: DEV_AUTH_BYPASS_USER_ID,
      decision: "APPROVE_COMMIT",
      action: "COMMIT",
      confirmedReview: true,
    });

    expect(committed.status).toBe("CLOSED");
    expect(committed.runnerState?.commitApproved).toBe(true);
    expect(committed.runnerState?.commit).toBe(false);
    expect(committed.runnerState?.push).toBe(false);

    const persisted = await repo.getTask(approved.id);
    expect(persisted?.status).toBe("CLOSED");
    expect(persisted?.runnerState?.humanApprovals?.[0]?.decision).toBe("APPROVE_COMMIT");
  },
    120_000,
  );

  test(
    "BLOCKED scenario: sensitive goal blocked with workerCalls = 0",
    async () => {
    const created = await repo.createTask({
      userId: DEV_AUTH_BYPASS_USER_ID,
      goal: BLOCKED_DEMO_GOAL,
    });

    expect(created.status).toBe("BLOCKED");
    expect(created.runnerState?.runnerInvoked).toBe(false);
    expect(created.blockedReasons.length).toBeGreaterThan(0);

    const result = await orchestrator.execute({
      goal: created.goal,
      taskId: created.id,
      contractId: created.id,
      allowDirtyWorkspace: true,
    });

    expect(result.run.verdict).toBe("BLOCKED");
    expect(result.run.counters.workerCalls).toBe(0);
    expect(result.run.counters.filesChanged).toBe(0);
  },
    120_000,
  );
});
