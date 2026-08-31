import { afterEach, describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import {
  applyProtectedPathApprovalAction,
  buildPendingProtectedPathApprovalRequest,
  findProtectedPathApprovalEvidence,
  isPendingProtectedPathApproval,
  mergeProtectedPathApprovalRunState,
  parseProtectedPathFromStopMessage,
} from "@/lib/protected-path-approval-flow";
import {
  extractApprovedProtectedPaths,
} from "@/lib/protected-path-approval";
import { evaluateProtectedPathPolicy } from "@/lib/contract-governance";
import { evaluatePolicy } from "@/orchestrator/policy/evaluator";
import { resolveProjectPolicy } from "@/orchestrator/policy/policy-schema";
import { assertTaskOrchestrationEligible } from "@/lib/task-lifecycle-ops";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import type { TaskRecord } from "@/lib/tasks-schema";

const CLEVIA_GOAL =
  "CLEVIA-001 — Initialize the Clevia frontend foundation and responsive dashboard shell using mock data only.";

function cleviaTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  const contract = {
    ...buildContract(CLEVIA_GOAL),
    approvalRequiredPaths: ["package.json", "bun.lock"],
  };
  return {
    id: "00000000-0000-4000-8000-000000000030",
    workspace: "https://github.com/akbartantu/clevia",
    goal: CLEVIA_GOAL,
    status: "AWAITING_APPROVAL",
    contract,
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("Protected path approval required before writing: package.json"),
      runnerInvoked: true,
      runId: "run-clevia-1",
      pendingProtectedPathApproval: buildPendingProtectedPathApprovalRequest({
        path: "package.json",
        reason: "BuildLoop needs to create this protected file (package.json) to establish the approved task baseline.",
        runId: "run-clevia-1",
        operation: "create",
      }),
    },
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    lockedAt: "2026-08-31T00:00:00.000Z",
    projectId: "11111111-1111-4111-8111-111111111111",
    sourceCommitSha: "a10183eb66a20fa0df619233b3e85231d2c193d9",
    ...overrides,
  };
}

describe("protected path approval flow", () => {
  test("parses protected path from runtime stop message", () => {
    expect(
      parseProtectedPathFromStopMessage(
        "Protected path approval required before writing: package.json",
      ),
    ).toBe("package.json");
  });

  test("creates pending request from orchestration evidence without protected write", () => {
    const evidence = findProtectedPathApprovalEvidence([
      {
        name: "protected_path_approval_required",
        summary: "Protected path approval required before writing: package.json",
      },
    ]);
    expect(evidence?.path).toBe("package.json");

    const merged = mergeProtectedPathApprovalRunState({
      runnerState: zeroChangeRunnerState("Stopped"),
      evidence: [
        {
          name: "protected_path_approval_required",
          summary: "Protected path approval required before writing: package.json",
        },
      ],
      runId: "run-1",
      contractGoal: CLEVIA_GOAL,
    });
    expect(isPendingProtectedPathApproval({ runnerState: merged })).toBe(true);
    expect(merged.filesChanged).toBe(0);
  });

  test("approve records bounded path and enables orchestration resume", () => {
    const task = cleviaTask();
    const result = applyProtectedPathApprovalAction({
      task,
      decision: "APPROVE",
      actorUserId: "user-1",
    });

    expect(result.resumeOrchestration).toBe(true);
    expect(result.task.status).toBe("APPROVED_FOR_EXECUTION");
    expect(extractApprovedProtectedPaths(result.task.runnerState?.protectedPathApprovals)).toEqual([
      "package.json",
    ]);
    expect(result.task.runnerState?.pendingProtectedPathApproval).toBeUndefined();
    expect(result.task.runnerState?.protectedPathResumeRequested).toBe(true);
    expect(() => assertTaskOrchestrationEligible({ ...task, ...result.task })).not.toThrow();
  });

  test("reject keeps task blocked without write permission", () => {
    const task = cleviaTask();
    const result = applyProtectedPathApprovalAction({
      task,
      decision: "REJECT",
      actorUserId: "user-1",
      note: "Not now",
    });

    expect(result.resumeOrchestration).toBe(false);
    expect(result.task.status).toBe("BLOCKED");
    expect(result.task.runnerState?.rejected).toBe(true);
    expect(result.task.blockedReasons?.[0]?.rule).toBe("PROTECTED_PATH_APPROVAL_REJECTED");
    expect(extractApprovedProtectedPaths(result.task.runnerState?.protectedPathApprovals)).toEqual([]);
  });

  test("approved package.json does not approve bun.lock", () => {
    const approved = applyProtectedPathApprovalAction({
      task: cleviaTask(),
      decision: "APPROVE",
      actorUserId: "user-1",
    }).task;

    const policy = resolveProjectPolicy(null, null);
    const lockEval = evaluateProtectedPathPolicy({
      changedFiles: ["bun.lock"],
      protectedPaths: policy.protected_paths,
      approvalRequiredPaths: ["package.json", "bun.lock"],
      approvedProtectedPaths: extractApprovedProtectedPaths(approved.runnerState?.protectedPathApprovals),
    });
    expect(lockEval.decision).toBe("REQUIRES_PROTECTED_PATH_APPROVAL");

    const envEval = evaluateProtectedPathPolicy({
      changedFiles: [".env"],
      protectedPaths: policy.protected_paths,
      approvalRequiredPaths: ["package.json", "bun.lock"],
      approvedProtectedPaths: extractApprovedProtectedPaths(approved.runnerState?.protectedPathApprovals),
    });
    expect(envEval.decision).toBe("FORBIDDEN");
  });

  test("contract approval alone does not satisfy protected-path policy", () => {
    const evaluation = evaluatePolicy({
      goal: CLEVIA_GOAL,
      changedFiles: ["package.json"],
      policy: resolveProjectPolicy(null, null),
      approvalRequiredPaths: ["package.json", "bun.lock"],
      approvedProtectedPaths: [],
    });
    expect(evaluation.decision).toBe("HUMAN_APPROVAL_REQUIRED");
  });

  test("repository approve is idempotent and unauthorized users are rejected", async () => {
    const repo = createDevTaskRepository();
    const userId = DEV_AUTH_BYPASS_USER_ID;
    const created = await repo.createTask({ userId, goal: CLEVIA_GOAL });

    await repo.updateAfterRun({
      id: created.id,
      status: "AWAITING_APPROVAL",
      runnerState: cleviaTask().runnerState!,
    });

    const approved = await repo.respondToProtectedPathApproval({
      id: created.id,
      userId,
      decision: "APPROVE",
    });
    expect(approved.task.id).toBe(created.id);
    expect(approved.resumeOrchestration).toBe(true);

    const duplicate = await repo.respondToProtectedPathApproval({
      id: created.id,
      userId,
      decision: "APPROVE",
    });
    expect(duplicate.idempotent).toBe(true);
    expect(duplicate.resumeOrchestration).toBe(false);

    try {
      await repo.respondToProtectedPathApproval({
        id: created.id,
        userId: "00000000-0000-4000-8000-000000000099",
        decision: "APPROVE",
      });
      expect.unreachable("Expected unauthorized protected-path approval to fail.");
    } catch (error) {
      expect(error instanceof Error ? error.message : String(error)).toContain("Unauthorized");
    }

    await repo.resetForTests();
  });
});

describe("clevia stop approve resume sequence", () => {
  afterEach(async () => {
    await createDevTaskRepository().resetForTests();
  });

  test("same task identity preserved through approve", async () => {
    const repo = createDevTaskRepository();
    const userId = DEV_AUTH_BYPASS_USER_ID;
    const created = await repo.createTask({ userId, goal: CLEVIA_GOAL });
    await repo.updateAfterRun({
      id: created.id,
      status: "AWAITING_APPROVAL",
      runnerState: cleviaTask().runnerState!,
    });

    const approved = await repo.respondToProtectedPathApproval({
      id: created.id,
      userId,
      decision: "APPROVE",
    });

    expect(approved.task.id).toBe(created.id);
    expect(approved.task.status).toBe("APPROVED_FOR_EXECUTION");
    expect(approved.task.runnerState?.protectedPathResumeRequested).toBe(true);
    expect((await repo.listTasks(userId)).filter((task) => task.id === created.id)).toHaveLength(1);
  });
});
