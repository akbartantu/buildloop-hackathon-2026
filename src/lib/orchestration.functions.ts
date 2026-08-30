import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "@/lib/auth/require-auth";
import { taskIdSchema } from "./tasks-schema";
import { getWorkspaceRoot, ProductOrchestrator } from "@/orchestrator/product/orchestrator";
import { summarizeEvidence } from "@/orchestrator/persistence/local-store";
import { zeroChangeRunnerState } from "./task-contract";
import type { TaskStatus } from "./task-contract";
import { captureGitBaseline, resolveWorkspacePathAsync } from "@/orchestrator/workspace/git-workspace";

const ACTIVE_ORCHESTRATION_STATUSES: TaskStatus[] = [
  "INSPECTING",
  "RUNNING",
  "CHECKING",
  "NEEDS_CORRECTION",
];

export const executeTaskRun = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => taskIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const task = await context.tasks.getTask(data.id);

    if (!task) {
      throw new Error("Task tidak ditemukan.");
    }

    if (task.status !== "APPROVED_FOR_EXECUTION") {
      throw new Error("Task harus berstatus APPROVED_FOR_EXECUTION sebelum diorkestrasi.");
    }

    if (ACTIVE_ORCHESTRATION_STATUSES.includes(task.status)) {
      throw new Error("Orchestrator sudah berjalan untuk task ini.");
    }

    const workspaceRoot = getWorkspaceRoot();
    const repoPath = await resolveWorkspacePathAsync(task.workspace, workspaceRoot);
    const gitBaseline = (await captureGitBaseline(repoPath)) ?? undefined;

    const orchestrator = new ProductOrchestrator(workspaceRoot);
    const result = await orchestrator.execute({
      goal: task.goal,
      taskId: task.id,
      contractId: task.id,
      workspace: task.workspace,
      allowDirtyWorkspace: false,
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
      decisionLog: result.decisionLog,
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

function mapRunStatus(status: string, verdict: string | null): TaskStatus {
  if (verdict === "BLOCKED") return "BLOCKED";
  if (verdict === "FAILED") return "FAILED";
  if (verdict === "PASS") return "AWAITING_APPROVAL";
  if (status === "STALE") return "BLOCKED";
  return status as TaskStatus;
}
