import { afterEach, describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import {
  applyProtectedPathApprovalAction,
  buildPendingProtectedPathApprovalRequest,
  describeProtectedPathApprovalReason,
  finalizeRunnerStateAfterOrchestration,
  findProtectedPathApprovalEvidence,
  hydrateTaskProtectedPathApproval,
  isPendingProtectedPathApproval,
  isProtectedPathApprovalStop,
  mergeProtectedPathApprovalRunState,
  parseProtectedPathFromStopMessage,
  parseProtectedPathFromWorkerError,
  resolveApprovalSurface,
  summarizeEvidenceForTaskPersistence,
} from "@/lib/protected-path-approval-flow";
import { extractApprovedProtectedPaths } from "@/lib/protected-path-approval";
import { evaluateProtectedPathPolicy } from "@/lib/contract-governance";
import { evaluatePolicy } from "@/orchestrator/policy/evaluator";
import { resolveProjectPolicy } from "@/orchestrator/policy/policy-schema";
import { assertTaskOrchestrationEligible } from "@/lib/task-lifecycle-ops";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import { toTaskRecord } from "@/lib/tasks/task-record";
import { deriveApprovalRecommendation } from "@/lib/approval-recommendation";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import type { TaskRecord } from "@/lib/tasks-schema";

const CLEVIA_GOAL =
  "CLEVIA-001 — Initialize the Clevia frontend foundation and responsive dashboard shell using mock data only.";

function cleviaProductionEvidence() {
  return [
    {
      category: "scope",
      name: "worker_error",
      status: "fail",
      summary: "Worker reported an execution error.",
      details: "PROTECTED_PATH_APPROVAL_REQUIRED: Protected path approval required before writing: package.json",
      attemptNumber: 1,
    },
    {
      category: "scope",
      name: "worker_invocation",
      status: "pass",
      summary: "Worker report received.",
      attemptNumber: 1,
    },
    {
      category: "preflight",
      name: "runtime_escalation_approval",
      status: "fail",
      summary: "Sensitive action discovered during execution — human approval required.",
      details: "RUNTIME_ESCALATION_APPROVAL",
      attemptNumber: 1,
    },
  ];
}

function cleviaAwaitingTaskWithoutPending(overrides: Partial<TaskRecord> = {}): TaskRecord {
  const contract = {
    ...buildContract(CLEVIA_GOAL),
    approvalRequiredPaths: ["package.json", "bun.lock"],
  };
  const evidence = summarizeEvidenceForTaskPersistence(cleviaProductionEvidence());
  return {
    id: "00000000-0000-4000-8000-000000000030",
    workspace: "https://github.com/akbartantu/clevia",
    goal: CLEVIA_GOAL,
    status: "AWAITING_APPROVAL",
    contract,
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState(
        "Sensitive action discovered during execution — human approval required.",
      ),
      runnerInvoked: true,
      filesChanged: 0,
      runId: "run-clevia-1",
      evidence,
      decisionLog: [
        {
          rule: "RUNTIME_ESCALATION_APPROVAL",
          summary: "Sensitive action discovered during execution — human approval required.",
          nextStatus: "AWAITING_APPROVAL",
          verdict: null,
        },
      ],
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

  test("parses protected path from worker_error details payload", () => {
    expect(
      parseProtectedPathFromWorkerError(
        "PROTECTED_PATH_APPROVAL_REQUIRED: Protected path approval required before writing: package.json",
      ),
    ).toBe("package.json");
  });

  test("creates pending request from worker_error evidence without dedicated protected_path row", () => {
    const evidence = summarizeEvidenceForTaskPersistence(cleviaProductionEvidence());
    const found = findProtectedPathApprovalEvidence(evidence, "run-1");
    expect(found?.path).toBe("package.json");

    const merged = mergeProtectedPathApprovalRunState({
      runnerState: zeroChangeRunnerState("Stopped"),
      evidence,
      runId: "run-1",
      contractGoal: CLEVIA_GOAL,
    });
    expect(isPendingProtectedPathApproval({ runnerState: merged })).toBe(true);
    expect(merged.filesChanged).toBe(0);
    expect(merged.pendingProtectedPathApproval?.paths).toEqual(["package.json"]);
  });

  test("finalizeRunnerStateAfterOrchestration persists pending request for Clevia production-style stop", () => {
    const finalized = finalizeRunnerStateAfterOrchestration({
      baseRunner: {
        ...zeroChangeRunnerState("Sensitive action discovered during execution — human approval required."),
        runnerInvoked: true,
        filesChanged: 0,
        runId: "run-clevia-1",
      },
      verdict: null,
      evidence: cleviaProductionEvidence(),
      contractGoal: CLEVIA_GOAL,
    });

    expect(finalized.pendingProtectedPathApproval?.paths).toEqual(["package.json"]);
    expect(finalized.filesChanged).toBe(0);
    expect(finalized.note).toContain("No protected files were changed");
    expect(describeProtectedPathApprovalReason({
      path: "package.json",
      contractGoal: CLEVIA_GOAL,
      operation: "create",
    })).toContain("Next.js frontend bootstrap");
  });

  test("hydrates missing pending request from persisted evidence on task read", () => {
    const raw = cleviaAwaitingTaskWithoutPending();
    expect(isPendingProtectedPathApproval(raw)).toBe(false);

    const hydrated = hydrateTaskProtectedPathApproval(raw);
    expect(isPendingProtectedPathApproval(hydrated)).toBe(true);
    expect(hydrated.runnerState?.pendingProtectedPathApproval?.paths).toEqual(["package.json"]);
    expect(resolveApprovalSurface(hydrated)).toBe("protected_path");
  });

  test("Clevia production-style task routes approval surface to protected path not commit", () => {
    const task = hydrateTaskProtectedPathApproval(cleviaAwaitingTaskWithoutPending());
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const recommendation = deriveApprovalRecommendation(task, lifecycle, "en");

    expect(resolveApprovalSurface(task)).toBe("protected_path");
    expect(isProtectedPathApprovalStop(task)).toBe(true);
    expect(lifecycle.implementationVerdict).toBeNull();
    expect(recommendation.canRecommendApprove).toBe(false);
    expect(recommendation.overviewSummary).toContain("Protected path approval required");
  });

  test("approve records bounded path and enables orchestration resume", () => {
    const task = hydrateTaskProtectedPathApproval(cleviaAwaitingTaskWithoutPending());
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
    const task = hydrateTaskProtectedPathApproval(cleviaAwaitingTaskWithoutPending());
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
      task: hydrateTaskProtectedPathApproval(cleviaAwaitingTaskWithoutPending()),
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

    const secondPending = mergeProtectedPathApprovalRunState({
      runnerState: {
        ...(approved.runnerState ?? zeroChangeRunnerState("resume")),
        filesChanged: 0,
      },
      evidence: summarizeEvidenceForTaskPersistence([
        {
          category: "scope",
          name: "worker_error",
          status: "fail",
          summary: "Worker reported an execution error.",
          details: "PROTECTED_PATH_APPROVAL_REQUIRED: Protected path approval required before writing: bun.lock",
        },
      ]),
      contractGoal: CLEVIA_GOAL,
    });
    expect(secondPending.pendingProtectedPathApproval?.paths).toEqual(["bun.lock"]);
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
      runnerState: hydrateTaskProtectedPathApproval(cleviaAwaitingTaskWithoutPending()).runnerState!,
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

  test("supabase-style task row hydration round-trips pending protected-path approval", () => {
    const hydrated = hydrateTaskProtectedPathApproval(cleviaAwaitingTaskWithoutPending());
    const row = {
      id: hydrated.id,
      workspace: hydrated.workspace,
      goal: hydrated.goal,
      status: hydrated.status,
      contract: hydrated.contract,
      blocked_reasons: hydrated.blockedReasons,
      runner_state: hydrated.runnerState,
      created_at: hydrated.createdAt,
      updated_at: hydrated.updatedAt,
      locked_at: hydrated.lockedAt,
      project_id: hydrated.projectId,
      source_commit_sha: hydrated.sourceCommitSha,
    };
    const loaded = toTaskRecord(row);
    expect(loaded.runnerState?.pendingProtectedPathApproval?.paths).toEqual(["package.json"]);
    expect(resolveApprovalSurface(loaded)).toBe("protected_path");
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
      runnerState: hydrateTaskProtectedPathApproval(cleviaAwaitingTaskWithoutPending()).runnerState!,
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
