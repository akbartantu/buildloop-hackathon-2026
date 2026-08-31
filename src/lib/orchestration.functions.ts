import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "@/lib/auth/require-auth";
import { executeTaskRunSchema, taskIdSchema } from "./tasks-schema";
import { getWorkspaceRoot, ProductOrchestrator } from "@/orchestrator/product/orchestrator";
import { summarizeEvidence } from "@/orchestrator/persistence/local-store";
import { zeroChangeRunnerState } from "./task-contract";
import type { TaskStatus } from "./task-contract";
import { captureGitBaseline, resolveWorkspacePathAsync, createRunSandboxId } from "@/orchestrator/workspace/git-workspace";
import { getSandboxRoot } from "@/orchestrator/workspace/sandbox-root";
import { isPublicGitHubRepoUrl } from "@/lib/repository/public-github-url";
import { assertTaskProjectExecutionSafe } from "@/lib/workspace/execution-guard";
import { assertTaskOrchestrationEligible } from "@/lib/task-lifecycle-ops";
import {
  archiveCurrentRun,
  assertRerunAllowed,
  canRerunFailedTask,
  captureContractInputs,
} from "@/lib/task-rerun";
import { extractApprovedProtectedPaths } from "@/lib/protected-path-approval";
import type { RunStatus } from "@/orchestrator/types";
import {
  buildActiveRunRunnerState,
  buildRunStartupFailureRunnerState,
  isPersistableActiveRunStatus,
  RUN_START_ELIGIBLE_STATUSES,
} from "@/lib/task-run-progress";

export const executeTaskRun = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => executeTaskRunSchema.parse(input))
  .handler(async ({ data, context }) => {
    const task = await context.tasks.getTask(data.id);

    if (!task) {
      throw new Error("Task tidak ditemukan.");
    }

    assertTaskOrchestrationEligible(task);

    let workingTask = task;
    const isFailedRerun = canRerunFailedTask(task);
    if (isFailedRerun) {
      assertRerunAllowed(task);
      const preparedRunner = archiveCurrentRun(task);
      workingTask = await context.tasks.prepareForRerun({
        id: data.id,
        status: "APPROVED_FOR_EXECUTION",
        runnerState: preparedRunner,
      });
    }

    const linkedProject = workingTask.projectId
      ? await context.projects.getProject(workingTask.projectId, context.auth.userId)
      : null;

    assertTaskProjectExecutionSafe({
      task: workingTask,
      project: linkedProject
        ? {
            repositoryUrl: linkedProject.repositoryUrl,
            connectedCommitSha: linkedProject.connectedCommitSha,
            disconnectedAt: linkedProject.disconnectedAt,
          }
        : null,
      ...(data.activeProjectId !== undefined ? { activeProjectId: data.activeProjectId } : {}),
    });

    const workspaceRoot = getWorkspaceRoot();
    const runSandboxId = createRunSandboxId(workingTask.id);
    const cloneOptions =
      isPublicGitHubRepoUrl(workingTask.workspace) && workingTask.sourceCommitSha
        ? {
            sandboxRoot: getSandboxRoot(workspaceRoot),
            runId: runSandboxId,
            commitSha: workingTask.sourceCommitSha,
          }
        : isPublicGitHubRepoUrl(workingTask.workspace)
          ? { sandboxRoot: getSandboxRoot(workspaceRoot), runId: runSandboxId }
          : {};

    const repoPath = await resolveWorkspacePathAsync(workingTask.workspace, workspaceRoot, cloneOptions);
    const gitBaseline = (await captureGitBaseline(repoPath)) ?? undefined;

    if (workingTask.sourceCommitSha && gitBaseline && gitBaseline.headSha !== workingTask.sourceCommitSha) {
      throw new Error("Repository baseline tidak cocok dengan source commit SHA task.");
    }

    const orchestrator = new ProductOrchestrator(workspaceRoot);

    let latestRunnerState = workingTask.runnerState;
    const persistActiveRunStatus = async (status: RunStatus, runId: string, phase?: string) => {
      if (!isPersistableActiveRunStatus(status)) {
        return;
      }
      const updated = await context.tasks.updateRunProgress({
        id: data.id,
        status,
        runnerState: buildActiveRunRunnerState(latestRunnerState, {
          status,
          runId,
          ...(phase ? { phase } : {}),
        }),
      });
      latestRunnerState = updated.runnerState;
    };

    try {
      const started = await context.tasks.updateRunProgress({
        id: data.id,
        status: "INSPECTING",
        runnerState: buildActiveRunRunnerState(latestRunnerState, { status: "INSPECTING" }),
        onlyFromStatuses: RUN_START_ELIGIBLE_STATUSES,
      });
      latestRunnerState = started.runnerState;
    } catch (error) {
      throw error instanceof Error ? error : new Error("Failed to mark task as running.");
    }

    let result;
    try {
      result = await orchestrator.execute({
        goal: workingTask.goal,
        taskId: workingTask.id,
        contractId: workingTask.id,
        workspace: workingTask.workspace,
        allowDirtyWorkspace: false,
        storedContract: workingTask.contract,
        projectId: workingTask.projectId,
        repositoryUrl: workingTask.workspace,
        ...(workingTask.sourceCommitSha ? { sourceCommitSha: workingTask.sourceCommitSha } : {}),
        runSandboxId,
        ...(workingTask.runnerState?.humanRevisionInstruction
          ? { humanRevisionInstruction: workingTask.runnerState.humanRevisionInstruction }
          : {}),
        ...(extractApprovedProtectedPaths(workingTask.runnerState?.protectedPathApprovals).length
          ? {
              approvedProtectedPaths: extractApprovedProtectedPaths(
                workingTask.runnerState?.protectedPathApprovals,
              ),
            }
          : {}),
        onRunStatusChange: ({ status, runId, phase }) => persistActiveRunStatus(status, runId, phase),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Orchestration failed before completion.";
      try {
        await context.tasks.updateRunProgress({
          id: data.id,
          status: "APPROVED_FOR_EXECUTION",
          runnerState: buildRunStartupFailureRunnerState(workingTask.runnerState, message),
        });
      } catch {
        // Best-effort revert; terminal updateAfterRun may not run after this throw.
      }
      throw error;
    }

    const nextStatus = mapRunStatus(result.run.status, result.run.verdict);
    const isHumanRevision = Boolean(workingTask.runnerState?.revisionRequested);
    const isRerun = isFailedRerun || Boolean(workingTask.runnerState?.rerunRequested);
    const resolvedBaseline = gitBaseline
      ? {
          repoPath: gitBaseline.repoPath,
          branch: gitBaseline.branch,
          headSha: gitBaseline.headSha,
          dirty: gitBaseline.dirty,
        }
      : workingTask.runnerState?.gitBaseline;
    const priorHistory = workingTask.runnerState?.runHistory ?? [];
    const lockedInputs =
      workingTask.runnerState?.lockedContractInputs ?? captureContractInputs(workingTask.contract);
    const baseRunner: import("@/lib/task-contract").RunnerState = {
      runnerInvoked: result.run.counters.workerCalls > 0,
      filesChanged: result.run.counters.filesChanged,
      commandsExecuted: result.run.counters.commandsExecuted,
      commit: false,
      push: false,
      note: result.run.verdictReason ?? result.run.status,
      runId: result.run.id,
      workerId: result.run.workerId,
      correctionCount: isHumanRevision || isRerun ? 0 : result.run.counters.correctionCount,
      humanRevisionCount: workingTask.runnerState?.humanRevisionCount ?? 0,
      revisionRequested: false,
      rerunRequested: false,
      ...(workingTask.runnerState?.humanApprovals
        ? { humanApprovals: workingTask.runnerState.humanApprovals }
        : {}),
      ...(workingTask.runnerState?.escalated ? { escalated: workingTask.runnerState.escalated } : {}),
      ...(workingTask.runnerState?.pendingAdditionalReview
        ? { pendingAdditionalReview: workingTask.runnerState.pendingAdditionalReview }
        : {}),
      ...(workingTask.runnerState?.rejected ? { rejected: workingTask.runnerState.rejected } : {}),
      runHistory: priorHistory,
      lockedContractInputs: lockedInputs,
      evidence: summarizeEvidence(result.evidence),
      decisionLog: result.decisionLog.map((entry) => ({
        rule: entry.rule,
        summary: entry.summary,
        nextStatus: entry.nextStatus,
        verdict: entry.verdict,
      })),
      orchestration: {
        phase: mapOrchestrationPhase(result.run.status, result.run.verdict),
        ...(workingTask.runnerState?.orchestration?.plannerOutput
          ? { plannerOutput: workingTask.runnerState.orchestration.plannerOutput }
          : {}),
        ...(workingTask.runnerState?.orchestration?.approvalType
          ? { approvalType: workingTask.runnerState.orchestration.approvalType }
          : {}),
        ...(workingTask.runnerState?.orchestration?.policyDecision
          ? { policyDecision: workingTask.runnerState.orchestration.policyDecision }
          : {}),
        workerInvoked: result.run.counters.workerCalls > 0,
        securityReviewInvoked: result.orchestrationEvidence.securityReviewInvoked,
        securityFindings: result.orchestrationEvidence.securityFindings,
        correctionCount: result.run.counters.correctionCount,
        finalVerdict: result.run.verdict,
        ...(workingTask.contract.workPlan
          ? {
              contracts: workingTask.contract.workPlan.contracts.map((c) => ({
                id: c.id,
                goal: c.goal,
                status: mapWorkContractExecutionStatus(result.run.status, result.run.verdict),
                approvalState: mapWorkContractApprovalState(
                  workingTask.runnerState?.orchestration?.approvalType ?? null,
                  result.run.verdict,
                ),
              })),
            }
          : {}),
      },
      ...(resolvedBaseline ? { gitBaseline: resolvedBaseline } : {}),
      ...(isHumanRevision ? { lastAction: "human_revision" as const } : {}),
      ...(isRerun ? { lastAction: "worker" as const } : {}),
      ...(result.changeArtifact ? { changeArtifact: result.changeArtifact } : {}),
      ...(result.deliveryHandoff ? { deliveryHandoff: result.deliveryHandoff } : {}),
    };
    const runnerState =
      result.run.verdict === "BLOCKED"
        ? zeroChangeRunnerState("Runner tidak dipanggil karena task dihentikan oleh pre-flight check.")
        : baseRunner;

    const updated = await context.tasks.updateAfterRun({
      id: data.id,
      status: nextStatus,
      runnerState,
      ...(result.run.verdict === "BLOCKED"
        ? {
            blockedReasons: result.evidence
              .filter((item) => item.status === "blocked")
              .map((item) => ({
                rule: item.name,
                matchedText: item.name,
                explanation: item.summary,
                protectedTarget: item.details,
              })),
          }
        : {}),
    });

    return {
      task: updated,
      run: result.run,
      evidence: summarizeEvidence(result.evidence),
      decisionLog: result.decisionLog,
    };
  });

function mapOrchestrationPhase(status: string, verdict: string | null): string {
  if (verdict === "BLOCKED") return "BLOCKED";
  if (verdict === "FAILED") return "FAILED";
  if (verdict === "PASS") return "PASS";
  if (status === "AWAITING_APPROVAL") return "AWAITING_APPROVAL";
  if (status === "CHECKING") return "CHECKING";
  if (status === "RUNNING" || status === "NEEDS_CORRECTION") return "RUNNING";
  if (status === "INSPECTING") return "PLANNING";
  return status;
}

function mapWorkContractExecutionStatus(status: string, verdict: string | null): string {
  if (verdict === "BLOCKED") return "blocked";
  if (verdict === "FAILED") return "failed";
  if (verdict === "PASS") return "pass";
  if (status === "AWAITING_APPROVAL") return "awaiting_approval";
  if (status === "CHECKING") return "checking";
  if (status === "RUNNING" || status === "NEEDS_CORRECTION") return "running";
  if (status === "INSPECTING") return "inspecting";
  return "pending";
}

function mapWorkContractApprovalState(
  approvalType: string | null | undefined,
  verdict: string | null,
): string {
  if (approvalType === "AUTO_APPROVED_BY_POLICY") return "auto_approved_by_policy";
  if (approvalType === "APPROVED_BY_HUMAN") return "approved_by_human";
  if (verdict === "PASS") return "auto_approved_by_policy";
  if (verdict === "FAILED" || verdict === "BLOCKED") return "execution_complete";
  return "pending";
}

function mapRunStatus(status: string, verdict: string | null): TaskStatus {
  if (verdict === "BLOCKED") return "BLOCKED";
  if (verdict === "FAILED") return "FAILED";
  if (verdict === "PASS") return "AWAITING_APPROVAL";
  if (status === "STALE") return "BLOCKED";
  return status as TaskStatus;
}
