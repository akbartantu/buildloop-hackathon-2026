import { afterEach, describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import {
  applyProtectedPathApprovalAction,
  buildPendingProtectedPathApprovalRequest,
  describeProtectedPathApprovalReason,
  extractProtectedPathStopFromWorkerReports,
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
import {
  DEPENDENCY_CONFIGURATION_PROTECTED_PATHS,
  evaluateProtectedPathPolicy,
  GOVERNANCE_CRITERION_APPROVAL_REQUIRED,
} from "@/lib/contract-governance";
import { evaluatePolicy } from "@/orchestrator/policy/evaluator";
import { resolveProjectPolicy } from "@/orchestrator/policy/policy-schema";
import { assertTaskOrchestrationEligible } from "@/lib/task-lifecycle-ops";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import { toTaskRecord } from "@/lib/tasks/task-record";
import { deriveApprovalRecommendation } from "@/lib/approval-recommendation";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import type { TaskRecord } from "@/lib/tasks-schema";
import { AdkGeminiWorker } from "@/orchestrator/adk/gemini-agent";
import { formatProtectedPathApprovalEvidenceDetails } from "@/orchestrator/types";
import { setAdkRunnerOverride, type AdkAgentRunner } from "@/orchestrator/adk/runner";
import { DeterministicChecker } from "@/orchestrator/checker/deterministic-checker";
import { decide } from "@/orchestrator/decision/engine";
import { createDraftContract, lockContract } from "@/orchestrator/contract/schema";
import { getWorkspaceRoot } from "@/orchestrator/product/orchestrator";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";

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

  test("parses protected path from forbidden patch rejection message", () => {
    expect(
      parseProtectedPathFromWorkerError(
        "Patch rejected for out-of-scope or protected path: package.json",
      ),
    ).toBe("package.json");
  });

  test("extracts structured stop from live worker report shape", () => {
    const stop = extractProtectedPathStopFromWorkerReports([
      {
        filesChanged: [],
        error: {
          code: "PROTECTED_PATH_APPROVAL_REQUIRED",
          message: "Protected path approval required before writing: package.json",
        },
      },
    ]);
    expect(stop?.path).toBe("package.json");
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

describe("live AdkGeminiWorker protected-path handoff", () => {
  afterEach(() => {
    setAdkRunnerOverride(null);
  });

  function mockPackageJsonAdkRunner(): AdkAgentRunner {
    return {
      isConfigured: () => true,
      run: async () => ({
        text: JSON.stringify({
          summary: "Initialize Next.js dependency manifest for Clevia frontend bootstrap.",
          changedFiles: [
            {
              path: "package.json",
              content: '{"name":"clevia","private":true,"scripts":{"dev":"next dev"}}',
            },
          ],
        }),
        model: "gemini-3.6-flash",
        latencyMs: 12,
        operationalRetries: 0,
        geminiCallCount: 1,
        adkRunnerInvoked: true,
        adkAgentName: "buildloop_coding_worker",
      }),
    };
  }

  function cleviaLockedContract() {
    return lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: CLEVIA_GOAL,
        inScope: [
          "Next.js + TypeScript frontend baseline",
          "Responsive application shell",
          "Dashboard using mock data only",
        ],
        outOfScope: [
          "Authentication",
          "Unrelated dependency or configuration changes",
        ],
        acceptanceCriteria: [
          "Next.js frontend baseline is initialized.",
          GOVERNANCE_CRITERION_APPROVAL_REQUIRED,
        ],
        allowedPaths: ["src/**", "app/**", "public/**", "tsconfig.json"],
        allowedCommands: [],
        approvalRequiredPaths: [...DEPENDENCY_CONFIGURATION_PROTECTED_PATHS],
      }),
    );
  }

  test("AdkGeminiWorker returns structured protected-path stop for package.json", async () => {
    setAdkRunnerOverride(mockPackageJsonAdkRunner());
    const worker = new AdkGeminiWorker();
    const report = await worker.execute({
      contract: cleviaLockedContract(),
      sandboxRoot: process.cwd(),
      workspaceRoot: process.cwd(),
      sourceRevision: "a10183eb",
      attemptNumber: 1,
    });

    expect(report.workerId).toBe("adk-gemini-worker");
    expect(report.filesChanged).toEqual([]);
    expect(report.error?.code).toBe("PROTECTED_PATH_APPROVAL_REQUIRED");
    expect(report.error?.path).toBe("package.json");
    expect(report.error?.operation).toBe("create");
    expect(report.error?.message).toContain("package.json");
    expect(extractProtectedPathStopFromWorkerReports([report])?.path).toBe("package.json");
  });

  test("deterministic checker skips worker_error for protected-path approval pause", async () => {
    setAdkRunnerOverride(mockPackageJsonAdkRunner());
    const root = getWorkspaceRoot();
    const sandbox = path.join(root, ".buildloop", "test-sandbox", crypto.randomUUID());
    await mkdir(sandbox, { recursive: true });

    try {
      const contract = cleviaLockedContract();
      const workerReport = await new AdkGeminiWorker().execute({
        contract,
        sandboxRoot: sandbox,
        workspaceRoot: root,
        sourceRevision: "a10183eb",
        attemptNumber: 1,
      });

      const checkerResult = await new DeterministicChecker().run({
        runId: "run-checker-protected",
        attemptNumber: 1,
        contract,
        sandboxRoot: sandbox,
        workspaceRoot: root,
        workerReport,
        sourceRevisionAtStart: "a10183eb",
        sourceRevisionNow: "a10183eb",
        skipCommandExecution: true,
      });

      expect(checkerResult.evidence.some((item) => item.name === "worker_error")).toBe(false);
      expect(checkerResult.evidence.some((item) => item.name === "worker_invocation")).toBe(true);
      expect(checkerResult.failed).toBe(false);
      expect(checkerResult.passed).toBe(true);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  test("deterministic checker still emits worker_error for ordinary worker failures", async () => {
    const root = getWorkspaceRoot();
    const sandbox = path.join(root, ".buildloop", "test-sandbox", crypto.randomUUID());
    await mkdir(sandbox, { recursive: true });
    const contract = cleviaLockedContract();

    try {
      const checkerResult = await new DeterministicChecker().run({
        runId: "run-checker-ordinary",
        attemptNumber: 1,
        contract,
        sandboxRoot: sandbox,
        workspaceRoot: root,
        workerReport: {
          workerId: "adk-gemini-worker",
          attemptNumber: 1,
          filesChanged: [],
          commandsRequested: ["adk.runEphemeral"],
          commandsExecuted: [],
          summary: "Worker failed.",
          patchSummary: "Unexpected parse failure.",
          error: { code: "WORKER_ERROR", message: "Malformed model output." },
        },
        sourceRevisionAtStart: "a10183eb",
        sourceRevisionNow: "a10183eb",
        skipCommandExecution: true,
      });

      expect(checkerResult.evidence.some((item) => item.name === "worker_error")).toBe(true);
      expect(checkerResult.failed).toBe(true);
      expect(checkerResult.passed).toBe(false);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  test("live worker through checker, decision, and finalization persists pending package.json approval", async () => {
    setAdkRunnerOverride(mockPackageJsonAdkRunner());
    const root = getWorkspaceRoot();
    const sandbox = path.join(root, ".buildloop", "test-sandbox", crypto.randomUUID());
    await mkdir(sandbox, { recursive: true });

    try {
      const contract = cleviaLockedContract();
      const worker = new AdkGeminiWorker();
      const workerReport = await worker.execute({
        contract,
        sandboxRoot: sandbox,
        workspaceRoot: root,
        sourceRevision: "a10183eb",
        attemptNumber: 1,
      });

      expect(workerReport.error?.code).toBe("PROTECTED_PATH_APPROVAL_REQUIRED");
      expect(workerReport.filesChanged).toEqual([]);

      expect(workerReport.error?.path).toBe("package.json");

      const checker = new DeterministicChecker();
      const checkerResult = await checker.run({
        runId: "run-clevia-live",
        attemptNumber: 1,
        contract,
        sandboxRoot: sandbox,
        workspaceRoot: root,
        workerReport,
        sourceRevisionAtStart: "a10183eb",
        sourceRevisionNow: "a10183eb",
        skipCommandExecution: true,
      });

      expect(checkerResult.evidence.some((item) => item.name === "worker_error")).toBe(false);

      const evidence = [...checkerResult.evidence];
      let runtimeEscalation: "AWAITING_APPROVAL" | "BLOCKED" | null = null;
      if (workerReport.error?.code === "PROTECTED_PATH_APPROVAL_REQUIRED") {
        runtimeEscalation = "AWAITING_APPROVAL";
        const protectedPath = workerReport.error.path?.replace(/\\/g, "/");
        evidence.push({
          id: crypto.randomUUID(),
          runId: "run-clevia-live",
          attemptNumber: 1,
          category: "preflight",
          name: "protected_path_approval_required",
          status: "fail",
          summary: workerReport.error.message,
          details: formatProtectedPathApprovalEvidenceDetails({
            path: protectedPath ?? "package.json",
            ...(workerReport.error.operation ? { operation: workerReport.error.operation } : {}),
          }),
          affectedFiles: protectedPath ? [protectedPath] : [],
          severity: "warning",
          createdAt: new Date().toISOString(),
        });
      }

      const decision = decide({
        currentStatus: "CHECKING",
        preflightSafe: true,
        checkerResult,
        correctionCount: 0,
        maximumCorrections: contract.maximumCorrections,
        allowedCommands: contract.allowedCommands,
        sourceStale: false,
        runtimeEscalation,
      });

      expect(decision.rule).toBe("RUNTIME_ESCALATION_APPROVAL");
      expect(decision.nextStatus).toBe("AWAITING_APPROVAL");
      expect(decision.verdict).toBeNull();
      expect(decision.shouldCorrect).toBe(false);

      const finalized = finalizeRunnerStateAfterOrchestration({
        baseRunner: {
          ...zeroChangeRunnerState(decision.verdictReason ?? decision.rule),
          runnerInvoked: true,
          filesChanged: 0,
          runId: "run-clevia-live",
          correctionCount: 0,
          decisionLog: [
            {
              rule: decision.rule,
              summary: decision.verdictReason ?? decision.rule,
              nextStatus: decision.nextStatus,
              verdict: decision.verdict,
            },
          ],
        },
        verdict: decision.verdict,
        evidence,
        contractGoal: CLEVIA_GOAL,
        workerReports: [workerReport],
      });

      expect(finalized.pendingProtectedPathApproval?.paths).toEqual(["package.json"]);
      expect(finalized.pendingProtectedPathApproval?.operation).toBe("create");
      expect(finalized.filesChanged).toBe(0);

      const task: TaskRecord = {
        id: contract.taskId,
        workspace: "https://github.com/akbartantu/clevia",
        goal: CLEVIA_GOAL,
        status: "AWAITING_APPROVAL",
        contract: buildContract(CLEVIA_GOAL),
        blockedReasons: [],
        runnerState: finalized,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lockedAt: new Date().toISOString(),
        projectId: null,
        sourceCommitSha: "a10183eb66a20fa0df619233b3e85231d2c193d9",
      };

      expect(resolveApprovalSurface(task)).toBe("protected_path");
      expect(isPendingProtectedPathApproval(task)).toBe(true);

      const lifecycle = buildTaskLifecycleViewModel(task, "en");
      expect(lifecycle.implementationVerdict).toBeNull();
      expect(lifecycle.correctionsUsed).toBe(0);
      expect(lifecycle.orchestrationSteps.find((step) => step.key === "worker")?.state).toBe("active");
      expect(lifecycle.orchestrationSteps.find((step) => step.key === "checker")?.state).toBe("not_run");
      expect(lifecycle.orchestrationSteps.find((step) => step.key === "decision")?.state).toBe("not_run");

      const recommendation = deriveApprovalRecommendation(task, lifecycle, "en");
      expect(recommendation.canRecommendApprove).toBe(false);
      expect(recommendation.overviewSummary).toContain("Protected path approval required");
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  test("runtime escalation evidence alone without worker report does not create pending path", () => {
    const finalized = finalizeRunnerStateAfterOrchestration({
      baseRunner: {
        ...zeroChangeRunnerState("Sensitive action discovered during execution — human approval required."),
        runnerInvoked: true,
        filesChanged: 0,
        runId: "run-generic-escalation",
      },
      verdict: null,
      evidence: [
        {
          category: "preflight",
          name: "runtime_escalation_approval",
          status: "fail",
          summary: "Sensitive action discovered during execution — human approval required.",
          details: "RUNTIME_ESCALATION_APPROVAL",
        },
      ],
      contractGoal: CLEVIA_GOAL,
    });

    expect(finalized.pendingProtectedPathApproval).toBeUndefined();
  });

  test("worker report path survives when evidence path parsing would fail", () => {
    const finalized = finalizeRunnerStateAfterOrchestration({
      baseRunner: {
        ...zeroChangeRunnerState("Sensitive action discovered during execution — human approval required."),
        runnerInvoked: true,
        filesChanged: 0,
        runId: "run-worker-report-fallback",
      },
      verdict: null,
      evidence: [
        {
          category: "preflight",
          name: "runtime_escalation_approval",
          status: "fail",
          summary: "Sensitive action discovered during execution — human approval required.",
          details: "RUNTIME_ESCALATION_APPROVAL",
        },
        {
          category: "scope",
          name: "worker_error",
          status: "fail",
          summary: "Worker reported an execution error.",
          details: "WORKER_ERROR: BuildLoop tidak dapat menyelesaikan langkah worker karena terjadi error sistem.",
        },
      ],
      contractGoal: CLEVIA_GOAL,
      workerReports: [
        {
          filesChanged: [],
          error: {
            code: "PROTECTED_PATH_APPROVAL_REQUIRED",
            message: "Protected path approval required before writing: package.json",
          },
        },
      ],
    });

    expect(finalized.pendingProtectedPathApproval?.paths).toEqual(["package.json"]);
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
