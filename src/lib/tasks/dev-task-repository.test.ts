import { afterEach, describe, expect, test } from "bun:test";

import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import { BLOCKED_DEMO_GOAL } from "@/orchestrator/scenarios/pass";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";
import { createDevTaskRepository } from "./dev-task-repository";

describe("DevTaskRepository", () => {
  const repo = createDevTaskRepository();

  afterEach(async () => {
    await repo.resetForTests();
  });

  test("creates a low-risk task with auto-approval when policy allows", async () => {
    const task = await repo.createTask({
      userId: DEV_AUTH_BYPASS_USER_ID,
      goal: "Ubah teks penjelasan workspace menjadi lebih jelas.",
    });

    expect(task.status).toBe("APPROVED_FOR_EXECUTION");
    expect(task.runnerState?.orchestration?.approvalType).toBe("AUTO_APPROVED_BY_POLICY");
    expect(task.contract.goal).toContain("workspace");
    expect(task.runnerState?.runnerInvoked).toBe(false);
  });

  test("blocks sensitive goals at creation with zero worker invocation", async () => {
    const task = await repo.createTask({
      userId: DEV_AUTH_BYPASS_USER_ID,
      goal: BLOCKED_DEMO_GOAL,
    });

    expect(task.status).toBe("BLOCKED");
    expect(task.blockedReasons.length).toBeGreaterThan(0);
    expect(task.runnerState?.runnerInvoked).toBe(false);
    expect(task.runnerState?.filesChanged).toBe(0);
  });

  test("supports approve → orchestrator update workflow", async () => {
    const created = await repo.createTask({
      userId: DEV_AUTH_BYPASS_USER_ID,
      goal: "Refactor API endpoint response format for workspace listings",
    });
    expect(created.status).toBe("CONTRACT_READY");

    const approved = await repo.lockContract({
      id: created.id,
      userId: DEV_AUTH_BYPASS_USER_ID,
    });
    expect(approved.status).toBe("APPROVED_FOR_EXECUTION");
    expect(approved.lockedAt).not.toBeNull();

    const updated = await repo.updateAfterRun({
      id: created.id,
      status: "AWAITING_APPROVAL",
      runnerState: {
        runnerInvoked: true,
        filesChanged: 1,
        commandsExecuted: 2,
        commit: false,
        push: false,
        note: "PASS demo",
        runId: "run-test-1",
        correctionCount: 1,
        evidence: [{ category: "check", name: "typecheck", status: "pass", summary: "ok" }],
      },
    });

    expect(updated.status).toBe("AWAITING_APPROVAL");
    expect(updated.runnerState?.runnerInvoked).toBe(true);
    expect(updated.runnerState?.evidence?.length).toBe(1);

    const listed = await repo.listTasks(DEV_AUTH_BYPASS_USER_ID);
    expect(listed[0]?.id).toBe(created.id);
  });

  test("recordHumanApproval persists commit permission and closes task", async () => {
    const created = await repo.createTask({
      userId: DEV_AUTH_BYPASS_USER_ID,
      goal: PASS_DEMO_GOAL,
    });
    if (created.status === "CONTRACT_READY") {
      await repo.lockContract({ id: created.id, userId: DEV_AUTH_BYPASS_USER_ID });
    }
    await repo.updateAfterRun({
      id: created.id,
      status: "AWAITING_APPROVAL",
      runnerState: {
        runnerInvoked: true,
        filesChanged: 1,
        commandsExecuted: 2,
        commit: false,
        push: false,
        note: "PASS demo",
        runId: "run-test-2",
        correctionCount: 0,
      },
    });

    const approved = await repo.recordHumanApproval({
      id: created.id,
      userId: DEV_AUTH_BYPASS_USER_ID,
      decision: "APPROVE_COMMIT",
      action: "COMMIT",
      confirmedReview: true,
    });

    expect(approved.status).toBe("CLOSED");
    expect(approved.runnerState?.commitApproved).toBe(true);
    expect(approved.runnerState?.commit).toBe(false);
    expect(approved.runnerState?.push).toBe(false);

    const reloaded = await repo.getTask(created.id);
    expect(reloaded?.status).toBe("CLOSED");
    expect(reloaded?.runnerState?.commitApproved).toBe(true);
  });

  test("recordHumanApproval is idempotent for duplicate submit", async () => {
    const created = await repo.createTask({
      userId: DEV_AUTH_BYPASS_USER_ID,
      goal: PASS_DEMO_GOAL,
    });
    if (created.status === "CONTRACT_READY") {
      await repo.lockContract({ id: created.id, userId: DEV_AUTH_BYPASS_USER_ID });
    }
    await repo.updateAfterRun({
      id: created.id,
      status: "AWAITING_APPROVAL",
      runnerState: {
        runnerInvoked: true,
        filesChanged: 1,
        commandsExecuted: 2,
        commit: false,
        push: false,
        note: "PASS demo",
        runId: "run-test-3",
      },
    });

    await repo.recordHumanApproval({
      id: created.id,
      userId: DEV_AUTH_BYPASS_USER_ID,
      decision: "APPROVE_COMMIT",
      action: "COMMIT",
      confirmedReview: true,
    });

    const second = await repo.recordHumanApproval({
      id: created.id,
      userId: DEV_AUTH_BYPASS_USER_ID,
      decision: "APPROVE_COMMIT",
      action: "COMMIT",
      confirmedReview: true,
    });

    expect(second.runnerState?.humanApprovals).toHaveLength(1);
  });

  test("recordHumanApproval rejects wrong lifecycle status", async () => {
    const created = await repo.createTask({
      userId: DEV_AUTH_BYPASS_USER_ID,
      goal: PASS_DEMO_GOAL,
    });

    await expect(
      repo.recordHumanApproval({
        id: created.id,
        userId: DEV_AUTH_BYPASS_USER_ID,
        decision: "APPROVE_COMMIT",
        action: "COMMIT",
        confirmedReview: true,
      }),
    ).rejects.toThrow(/tidak tersedia/);
  });
});
