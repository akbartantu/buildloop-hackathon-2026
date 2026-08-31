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

export const executeTaskRun = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => executeTaskRunSchema.parse(input))
  .handler(async ({ data, context }) => {
    const task = await context.tasks.getTask(data.id);

    if (!task) {
      throw new Error("Task tidak ditemukan.");
    }

    assertTaskOrchestrationEligible(task);

    const linkedProject = task.projectId
      ? await context.projects.getProject(task.projectId, context.auth.userId)
      : null;

    assertTaskProjectExecutionSafe({
      task,
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
    const runSandboxId = createRunSandboxId(task.id);
    const cloneOptions =
      isPublicGitHubRepoUrl(task.workspace) && task.sourceCommitSha
        ? {
            sandboxRoot: getSandboxRoot(workspaceRoot),
            runId: runSandboxId,
            commitSha: task.sourceCommitSha,
          }
        : isPublicGitHubRepoUrl(task.workspace)
          ? { sandboxRoot: getSandboxRoot(workspaceRoot), runId: runSandboxId }
          : {};

    const repoPath = await resolveWorkspacePathAsync(task.workspace, workspaceRoot, cloneOptions);
    const gitBaseline = (await captureGitBaseline(repoPath)) ?? undefined;

    if (task.sourceCommitSha && gitBaseline && gitBaseline.headSha !== task.sourceCommitSha) {
      throw new Error("Repository baseline tidak cocok dengan source commit SHA task.");
    }

    const orchestrator = new ProductOrchestrator(workspaceRoot);
    const result = await orchestrator.execute({
      goal: task.goal,
      taskId: task.id,
      contractId: task.id,
      workspace: task.workspace,
      allowDirtyWorkspace: false,
      storedContract: task.contract,
      projectId: task.projectId,
      repositoryUrl: task.workspace,
      ...(task.sourceCommitSha ? { sourceCommitSha: task.sourceCommitSha } : {}),
      runSandboxId,
    });

    const nextStatus = mapRunStatus(result.run.status, result.run.verdict);
    const isHumanRevision = Boolean(task.runnerState?.revisionRequested);
    const resolvedBaseline = gitBaseline
      ? {
          repoPath: gitBaseline.repoPath,
          branch: gitBaseline.branch,
          headSha: gitBaseline.headSha,
          dirty: gitBaseline.dirty,
        }
      : task.runnerState?.gitBaseline;
    const baseRunner: import("@/lib/task-contract").RunnerState = {
      runnerInvoked: result.run.counters.workerCalls > 0,
      filesChanged: result.run.counters.filesChanged,
      commandsExecuted: result.run.counters.commandsExecuted,
      commit: false,
      push: false,
      note: result.run.verdictReason ?? result.run.status,
      runId: result.run.id,
      workerId: result.run.workerId,
      correctionCount: isHumanRevision ? 0 : result.run.counters.correctionCount,
      humanRevisionCount: task.runnerState?.humanRevisionCount ?? 0,
      revisionRequested: false,
      evidence: summarizeEvidence(result.evidence),
      decisionLog: result.decisionLog.map((entry) => ({
        rule: entry.rule,
        summary: entry.summary,
        nextStatus: entry.nextStatus,
        verdict: entry.verdict,
      })),
      orchestration: {
        phase: mapOrchestrationPhase(result.run.status, result.run.verdict),
        ...(task.runnerState?.orchestration?.plannerOutput
          ? { plannerOutput: task.runnerState.orchestration.plannerOutput }
          : {}),
        ...(task.runnerState?.orchestration?.approvalType
          ? { approvalType: task.runnerState.orchestration.approvalType }
          : {}),
        ...(task.runnerState?.orchestration?.policyDecision
          ? { policyDecision: task.runnerState.orchestration.policyDecision }
          : {}),
        workerInvoked: result.run.counters.workerCalls > 0,
        securityReviewInvoked: result.orchestrationEvidence.securityReviewInvoked,
        securityFindings: result.orchestrationEvidence.securityFindings,
        correctionCount: result.run.counters.correctionCount,
        finalVerdict: result.run.verdict,
        ...(task.contract.workPlan
          ? {
              contracts: task.contract.workPlan.contracts.map((c) => ({
                id: c.id,
                goal: c.goal,
                status: mapWorkContractExecutionStatus(result.run.status, result.run.verdict),
                approvalState: mapWorkContractApprovalState(
                  task.runnerState?.orchestration?.approvalType ?? null,
                  result.run.verdict,
                ),
              })),
            }
          : {}),
      },
      ...(resolvedBaseline ? { gitBaseline: resolvedBaseline } : {}),
      ...(isHumanRevision ? { lastAction: "human_revision" as const } : {}),
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
