import { detectSensitiveIntent, type BlockedReason } from "@/lib/sensitive-intent";
import {
  buildContract,
  zeroChangeRunnerState,
  type TaskContract,
  type RunnerState,
  type ApprovalType,
  type TaskStatus,
} from "@/lib/task-contract";
import {
  withContractVersion,
  type ContractHistoryEntry,
} from "@/lib/task-lifecycle-ops";
import {
  buildClarificationRecord,
  evaluateClarificationPolicy,
  mergeUserAndGeneratedCriteria,
  type ClarificationEvaluation,
} from "@/lib/planning/clarification-policy";
import { buildPlanningContext } from "@/lib/planning/planning-context";
import type { PlanningSource, TaskClarification } from "@/lib/planning/planning-source";
import type { ClarificationChoiceSet, ClarificationOption } from "@/lib/planning/clarification-options";
import type { PlanningSpecificationEntry } from "@/lib/specifications/specification-set-record";
import { planWork, workPlanToContractFields } from "@/orchestrator/agents/planner/planner";
import type { WorkContract } from "@/orchestrator/agents/planner/types";
import { loadProjectGovernance } from "@/orchestrator/policy/project-policy";
import { resolveInitialTaskStatus } from "@/orchestrator/policy/auto-approval";
import { isAmbiguousGoal } from "@/orchestrator/contract/derive-task-contract";

export type TaskPlanningResult = {
  contract: TaskContract;
  status: TaskStatus;
  blockedReasons: BlockedReason[];
  runnerState: RunnerState;
  approvalType: ApprovalType;
  lockedAt: string | null;
  needsClarification: boolean;
  clarification?: TaskClarification;
};

export type TaskGoalAnalysis = {
  acceptanceCriteria: string[];
  expectedScope: string[];
  needsClarification: boolean;
  clarificationMessage?: string;
  clarificationQuestion?: string;
  /** @deprecated Use clarificationChoiceOptions when present. */
  clarificationOptions?: string[];
  clarificationChoiceOptions?: ClarificationOption[];
  clarificationAllowOther?: boolean;
  clarificationPresentationMode?: ClarificationChoiceSet["presentationMode"];
  suggestedFromGoal: boolean;
  sourcesUsed?: PlanningSource[];
};

export type TaskPlanningInput = {
  goal: string;
  taskId: string;
  /** BuildLoop application root — used for governance policy loading. */
  workspaceRoot: string;
  /** Isolated connected repository checkout at source commit — used for repository evidence. */
  repositoryRoot?: string | null;
  repositoryUrl?: string | null;
  acceptanceCriteria?: string[];
  contractVersion?: number;
  contractHistory?: ContractHistoryEntry[];
  specifications?: PlanningSpecificationEntry[];
  sourceCommitSha?: string | null;
  clarificationAnswer?: string;
  existingClarification?: TaskClarification;
};

function buildContractFromWorkPlan(
  goal: string,
  workPlan: Awaited<ReturnType<typeof planWork>>,
  contractVersion = 1,
  history?: ContractHistoryEntry[],
  extras?: {
    sourcesUsed?: PlanningSource[];
    clarification?: TaskClarification;
    planningSummary?: string;
  },
): TaskContract {
  const fields = workPlanToContractFields(workPlan);
  const base = buildContract(goal);
  return withContractVersion(
    {
      ...base,
      goal: fields.goal,
      inScope: fields.inScope,
      acceptanceCriteria: fields.acceptanceCriteria,
      requiredChecks: fields.requiredChecks,
      maxAttempts: fields.maxAttempts,
      workPlan: {
        userGoal: workPlan.userGoal,
        decomposed: workPlan.decomposed,
        plannerSummary: workPlan.plannerSummary,
        contracts: workPlan.contracts.map((c: WorkContract) => ({
          id: c.id,
          goal: c.goal,
          acceptanceCriteria: c.acceptanceCriteria,
          expectedScope: c.expectedScope,
          dependencies: c.dependencies,
          riskClassification: c.riskClassification,
          approvalState: c.approvalState,
          status: c.status,
        })),
      },
      ...(extras?.sourcesUsed?.length ? { sourcesUsed: extras.sourcesUsed } : {}),
      ...(extras?.clarification ? { clarification: extras.clarification } : {}),
      ...(extras?.planningSummary ? { planningSummary: extras.planningSummary } : {}),
    },
    contractVersion,
    history,
  );
}

function workPlanNeedsClarification(workPlan: Awaited<ReturnType<typeof planWork>>): boolean {
  return workPlan.contracts.some((c) => c.status === "blocked");
}

function policyNeedsClarification(evaluation: ClarificationEvaluation, answerProvided: boolean): boolean {
  if (answerProvided) {
    return false;
  }
  return (
    evaluation.decision === "MATERIAL_AMBIGUITY" || evaluation.decision === "SPEC_CONFLICT"
  );
}

function buildPlanningSummary(input: {
  evaluation: ClarificationEvaluation;
  specCount: number;
  sourceCount: number;
}): string {
  if (input.evaluation.decision === "CLEAR") {
    return `Planning used ${input.specCount} specification(s) and ${input.sourceCount} repository reference(s).`;
  }
  return input.evaluation.reason ?? "Planning requires clarification before contract approval.";
}

async function resolvePlanning(input: TaskPlanningInput) {
  const sensitiveBlocked = detectSensitiveIntent(input.goal);
  const specifications = input.specifications ?? [];
  const planningContext = await buildPlanningContext({
    goal: input.goal,
    specifications,
    repositoryRoot: input.repositoryRoot ?? null,
    sourceCommitSha: input.sourceCommitSha ?? null,
    repositoryUrl: input.repositoryUrl ?? null,
  });

  const evaluation = evaluateClarificationPolicy({
    goal: input.goal,
    specifications: planningContext.relevantSpecifications,
    sensitiveBlocked,
    ...(input.acceptanceCriteria ? { userCriteria: input.acceptanceCriteria } : {}),
    ...(input.clarificationAnswer ? { clarificationAnswer: input.clarificationAnswer } : {}),
    ...(input.existingClarification ? { existingClarification: input.existingClarification } : {}),
  });

  const answerProvided = Boolean(input.clarificationAnswer || input.existingClarification?.answer);
  const needsPolicyClarification = policyNeedsClarification(evaluation, answerProvided);

  const effectiveCriteria = mergeUserAndGeneratedCriteria(
    input.acceptanceCriteria,
    evaluation.inferredCriteria ?? [],
  );

  const workPlan = await planWork({
    goal: input.goal,
    taskId: input.taskId ?? "preview",
    ...(input.repositoryRoot ? { workspaceRoot: input.repositoryRoot } : {}),
    ...(effectiveCriteria.length ? { acceptanceCriteria: effectiveCriteria } : {}),
  });

  if (
    !needsPolicyClarification &&
    evaluation.inferredCriteria?.length &&
    workPlanNeedsClarification(workPlan)
  ) {
    const repositoryScope = planningContext.sourcesUsed
      .filter((source) => source.sourceType === "repository_file" && source.path)
      .map((source) => source.path!)
      .slice(0, 4);
    if (repositoryScope.length > 0) {
      for (const contract of workPlan.contracts) {
        if (contract.status === "blocked" && contract.expectedScope.length === 0) {
          contract.expectedScope = repositoryScope;
          contract.status = "pending";
          contract.acceptanceCriteria = mergeUserAndGeneratedCriteria(
            contract.acceptanceCriteria,
            evaluation.inferredCriteria,
          );
        }
      }
    }
  }

  const clarification = buildClarificationRecord({
    evaluation,
    ...(input.clarificationAnswer ? { answer: input.clarificationAnswer } : {}),
  });

  return {
    sensitiveBlocked,
    planningContext,
    evaluation,
    needsPolicyClarification,
    effectiveCriteria,
    workPlan,
    clarification,
  };
}

export async function analyzeTaskGoal(input: TaskPlanningInput): Promise<TaskGoalAnalysis> {
  const resolved = await resolvePlanning(input);
  const fields = workPlanToContractFields(resolved.workPlan);
  const needsClarification =
    resolved.needsPolicyClarification || workPlanNeedsClarification(resolved.workPlan);
  const userProvided = Boolean(input.acceptanceCriteria?.length);

  if (resolved.sensitiveBlocked.length > 0) {
    return {
      acceptanceCriteria: fields.acceptanceCriteria,
      expectedScope: fields.inScope,
      needsClarification: false,
      suggestedFromGoal: false,
      sourcesUsed: resolved.planningContext.sourcesUsed,
    };
  }

  if (needsClarification && !userProvided && !input.clarificationAnswer) {
    const choiceSet = resolved.evaluation.choiceSet;
    return {
      acceptanceCriteria: resolved.effectiveCriteria.length
        ? resolved.effectiveCriteria
        : fields.acceptanceCriteria,
      expectedScope: fields.inScope,
      needsClarification: true,
      ...(resolved.evaluation.reason ? { clarificationMessage: resolved.evaluation.reason } : {}),
      ...(resolved.evaluation.question ? { clarificationQuestion: resolved.evaluation.question } : {}),
      ...(resolved.evaluation.options ? { clarificationOptions: resolved.evaluation.options } : {}),
      ...(choiceSet?.presentationMode === "choices"
        ? {
            clarificationChoiceOptions: choiceSet.options,
            clarificationAllowOther: choiceSet.allowOther,
            clarificationPresentationMode: choiceSet.presentationMode,
          }
        : choiceSet
          ? { clarificationPresentationMode: choiceSet.presentationMode }
          : {}),
      suggestedFromGoal: !userProvided,
      sourcesUsed: resolved.planningContext.sourcesUsed,
    };
  }

  return {
    acceptanceCriteria: fields.acceptanceCriteria,
    expectedScope: fields.inScope,
    needsClarification,
    suggestedFromGoal: !userProvided,
    sourcesUsed: resolved.planningContext.sourcesUsed,
  };
}

export async function planAndEvaluateTask(input: TaskPlanningInput): Promise<TaskPlanningResult> {
  const policy = await loadProjectGovernance(input.workspaceRoot);
  const resolved = await resolvePlanning(input);
  const needsClarification =
    resolved.needsPolicyClarification || workPlanNeedsClarification(resolved.workPlan);

  const contract = buildContractFromWorkPlan(
    input.goal,
    resolved.workPlan,
    input.contractVersion ?? 1,
    input.contractHistory,
    {
      sourcesUsed: resolved.planningContext.sourcesUsed,
      ...(resolved.clarification ? { clarification: resolved.clarification } : {}),
      planningSummary: buildPlanningSummary({
        evaluation: resolved.evaluation,
        specCount: resolved.planningContext.relevantSpecifications.length,
        sourceCount: resolved.planningContext.sourcesUsed.length,
      }),
    },
  );

  if (resolved.sensitiveBlocked.length > 0) {
    return {
      contract,
      status: "BLOCKED",
      blockedReasons: resolved.sensitiveBlocked,
      runnerState: {
        ...zeroChangeRunnerState("Runner tidak dipanggil karena task dihentikan oleh pre-flight check."),
        orchestration: {
          phase: "BLOCKED",
          plannerOutput: resolved.workPlan.plannerSummary,
          approvalType: null,
          policyDecision: "BLOCKED",
          contracts: resolved.workPlan.contracts.map((c: WorkContract) => ({
            id: c.id,
            goal: c.goal,
            status: "blocked",
            approvalState: "pending",
          })),
        },
      },
      approvalType: null,
      lockedAt: null,
      needsClarification: false,
    };
  }

  const initial = resolveInitialTaskStatus(resolved.workPlan.contracts, policy);
  let status: TaskStatus = initial.status;
  if (needsClarification && status !== "BLOCKED") {
    status = "DRAFT";
  }
  const approvalType = initial.approvalType;
  const now = status === "APPROVED_FOR_EXECUTION" ? new Date().toISOString() : null;

  const updatedContracts = resolved.workPlan.contracts.map((c: WorkContract) => ({
    ...c,
    approvalState:
      initial.status === "APPROVED_FOR_EXECUTION"
        ? ("auto_approved" as const)
        : c.approvalState,
  }));

  const clarificationRecord = resolved.clarification;

  return {
    contract,
    status,
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState(
        status === "APPROVED_FOR_EXECUTION"
          ? "Contract auto-approved by policy. Orchestrator ready to run."
          : needsClarification
            ? clarificationRecord?.question ??
              "Goal needs clarification before contract approval."
            : "Planner finished. Review contract before execution.",
      ),
      orchestration: {
        phase:
          status === "APPROVED_FOR_EXECUTION"
            ? "AUTO_APPROVED"
            : needsClarification
              ? "DRAFT"
              : "CONTRACT_READY",
        plannerOutput: resolved.workPlan.plannerSummary,
        approvalType,
        policyDecision: initial.approvalType ? "AUTO_APPROVED" : "HUMAN_APPROVAL_REQUIRED",
        policyReason: initial.policyReason,
        contracts: updatedContracts.map((c) => ({
          id: c.id,
          goal: c.goal,
          status: c.status,
          approvalState: c.approvalState,
        })),
      },
    },
    approvalType,
    lockedAt: now,
    needsClarification,
    ...(clarificationRecord ? { clarification: clarificationRecord } : {}),
  };
}

export { isAmbiguousGoal };
