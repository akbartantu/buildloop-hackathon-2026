import type { ContractHistoryEntry } from "@/lib/task-lifecycle-ops";
import type { TaskClarification } from "@/lib/planning/planning-source";
import type { PlanningSpecificationEntry } from "@/lib/specifications/specification-set-record";
import type { TaskPlanningInput } from "@/lib/task-planning";

export type PlanningDeps = {
  listPlanningSpecifications?: (
    projectId: string,
    userId: string,
  ) => Promise<PlanningSpecificationEntry[]>;
};

export async function buildPlanningInputForTask(
  task: {
    id: string;
    goal: string;
    projectId: string | null;
    sourceCommitSha: string | null;
    contract: { clarification?: TaskClarification };
    userId: string;
  },
  input: {
    goal: string;
    acceptanceCriteria?: string[];
    clarificationAnswer?: string;
  },
  deps: PlanningDeps,
  options: {
    workspaceRoot: string;
    contractVersion?: number;
    contractHistory?: ContractHistoryEntry[];
  },
): Promise<TaskPlanningInput> {
  const specifications =
    task.projectId && deps.listPlanningSpecifications
      ? await deps.listPlanningSpecifications(task.projectId, task.userId)
      : [];

  return {
    goal: input.goal,
    taskId: task.id,
    workspaceRoot: options.workspaceRoot,
    specifications,
    sourceCommitSha: task.sourceCommitSha,
    ...(options.contractVersion !== undefined ? { contractVersion: options.contractVersion } : {}),
    ...(options.contractHistory?.length ? { contractHistory: options.contractHistory } : {}),
    ...(input.acceptanceCriteria ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
    ...(input.clarificationAnswer ? { clarificationAnswer: input.clarificationAnswer } : {}),
    ...(task.contract.clarification ? { existingClarification: task.contract.clarification } : {}),
  };
}
