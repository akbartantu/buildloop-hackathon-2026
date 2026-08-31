import type { ContractHistoryEntry } from "@/lib/task-lifecycle-ops";
import type { TaskClarification } from "@/lib/planning/planning-source";
import type { PlanningSpecificationEntry } from "@/lib/specifications/specification-set-record";
import type { ClarificationAnswerInput } from "@/lib/planning/clarification-interview";
import type { TaskPlanningInput } from "@/lib/task-planning";
import {
  resolvePlanningRepositoryRoot,
  type PlanningRepositoryResolution,
} from "@/lib/planning/resolve-planning-repository";

export type PlanningDeps = {
  listPlanningSpecifications?: (
    projectId: string,
    userId: string,
  ) => Promise<PlanningSpecificationEntry[]>;
  resolvePlanningRepository?: (input: {
    appWorkspaceRoot: string;
    repositoryUrl?: string | null;
    sourceCommitSha?: string | null;
  }) => Promise<PlanningRepositoryResolution>;
};

export async function buildPlanningInputForTask(
  task: {
    id: string;
    goal: string;
    workspace: string;
    projectId: string | null;
    sourceCommitSha: string | null;
    contract: { clarification?: TaskClarification };
    userId: string;
  },
  input: {
    goal: string;
    acceptanceCriteria?: string[];
    clarificationAnswer?: string;
    clarificationAnswers?: ClarificationAnswerInput[];
    proceedWithAssumption?: boolean;
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

  const resolveRepository = deps.resolvePlanningRepository ?? resolvePlanningRepositoryRoot;
  const repositoryResolution = task.projectId
    ? await resolveRepository({
        appWorkspaceRoot: options.workspaceRoot,
        repositoryUrl: task.workspace,
        sourceCommitSha: task.sourceCommitSha,
      })
    : {
        repositoryRoot: null,
        repositoryUrl: null,
        sourceCommitSha: null,
        provenanceVerified: false,
      };

  return {
    goal: input.goal,
    taskId: task.id,
    workspaceRoot: options.workspaceRoot,
    repositoryRoot: repositoryResolution.repositoryRoot,
    repositoryUrl: repositoryResolution.repositoryUrl,
    specifications,
    sourceCommitSha: repositoryResolution.provenanceVerified ? task.sourceCommitSha : null,
    ...(options.contractVersion !== undefined ? { contractVersion: options.contractVersion } : {}),
    ...(options.contractHistory?.length ? { contractHistory: options.contractHistory } : {}),
    ...(input.acceptanceCriteria ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
    ...(input.clarificationAnswer ? { clarificationAnswer: input.clarificationAnswer } : {}),
    ...(input.clarificationAnswers?.length ? { clarificationAnswers: input.clarificationAnswers } : {}),
    ...(input.proceedWithAssumption ? { proceedWithAssumption: input.proceedWithAssumption } : {}),
    ...(task.contract.clarification ? { existingClarification: task.contract.clarification } : {}),
  };
}
