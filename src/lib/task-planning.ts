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
import { buildPlanningContext, isPasswordResetGoal } from "@/lib/planning/planning-context";
import type { PlanningSource, TaskClarification } from "@/lib/planning/planning-source";
import {
  applyAdaptiveQuestionFilter,
  applyAssumptionAnswers,
  buildInterviewClarificationRecord,
  criteriaFromClarificationAnswers,
  generateClarificationInterview,
  interviewNeedsClarification,
  questionFromLegacyEvaluation,
  resolveInterviewAnswers,
  summarizeClarificationDecisions,
  validateClarificationContractConsistency,
  type ClarificationAnswerInput,
  type ClarificationInterviewEvaluation,
} from "@/lib/planning/clarification-interview";
import {
  isPlannerAmbiguitySupersededByClarification,
  reconcileInterviewEvaluation,
  validatePersistedClarificationState,
} from "@/lib/planning/clarification-state";
import {
  deriveContractGovernance,
  validateContractConsistency,
  type ContractGovernancePlan,
} from "@/lib/contract-governance";
import { computeManifestRevision } from "@/orchestrator/manifest/revision";
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
  clarificationMode?: ClarificationInterviewEvaluation["mode"];
  clarificationQuestions?: ClarificationInterviewEvaluation["questions"];
  clarificationAssumptionSummary?: string;
  clarificationDecisions?: Array<{ label: string; answer: string }>;
  clarificationPendingCount?: number;
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
  clarificationAnswers?: ClarificationAnswerInput[];
  proceedWithAssumption?: boolean;
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
    governance?: ContractGovernancePlan;
  },
): TaskContract {
  const fields = workPlanToContractFields(workPlan);
  const base = buildContract(goal);
  const governance = extras?.governance;
  return withContractVersion(
    {
      ...base,
      goal: fields.goal,
      inScope: governance?.inScope.length ? governance.inScope : fields.inScope,
      outOfScope: governance?.outOfScope ?? base.outOfScope,
      acceptanceCriteria: governance?.acceptanceCriteria ?? fields.acceptanceCriteria,
      requiredChecks: fields.requiredChecks,
      maxAttempts: fields.maxAttempts,
      ...(governance?.approvalRequiredPaths.length
        ? { approvalRequiredPaths: governance.approvalRequiredPaths }
        : {}),
      ...(governance?.executionAllowedPaths.length
        ? { executionAllowedPaths: governance.executionAllowedPaths }
        : {}),
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

function applyGovernanceScopeToBlockedContracts(
  workPlan: Awaited<ReturnType<typeof planWork>>,
  governance: ContractGovernancePlan,
  acceptanceCriteria: string[],
): void {
  if (!governance.inScope.length) {
    return;
  }

  for (const contract of workPlan.contracts) {
    if (contract.status !== "blocked") {
      continue;
    }
    contract.expectedScope = governance.inScope;
    contract.acceptanceCriteria = acceptanceCriteria;
    contract.status = "pending";
  }
}

function resolveTaskNeedsClarification(resolved: {
  needsPolicyClarification: boolean;
  governanceNeedsClarification: boolean;
  interviewEvaluation: ClarificationInterviewEvaluation;
  resolvedAnswers: ReturnType<typeof resolveInterviewAnswers>;
  effectiveCriteria: string[];
  workPlan: Awaited<ReturnType<typeof planWork>>;
  contractConsistencyOk: boolean;
  clarificationConsistencyOk: boolean;
  persistedClarificationConsistencyOk: boolean;
}): boolean {
  if (resolved.needsPolicyClarification || resolved.governanceNeedsClarification) {
    return true;
  }

  if (
    isPlannerAmbiguitySupersededByClarification({
      needsPolicyClarification: resolved.needsPolicyClarification,
      interviewMode: resolved.interviewEvaluation.mode,
      questions: resolved.interviewEvaluation.questions,
      resolvedAnswers: resolved.resolvedAnswers,
      effectiveCriteria: resolved.effectiveCriteria,
      contractConsistencyOk: resolved.contractConsistencyOk,
      clarificationConsistencyOk: resolved.clarificationConsistencyOk,
      persistedClarificationConsistencyOk: resolved.persistedClarificationConsistencyOk,
    })
  ) {
    return false;
  }

  return workPlanNeedsClarification(resolved.workPlan);
}

function policyNeedsClarification(
  evaluation: ClarificationEvaluation,
  interviewEvaluation: ClarificationInterviewEvaluation,
  resolvedAnswers: ReturnType<typeof resolveInterviewAnswers>,
  answerProvided: boolean,
  proceedWithAssumption?: boolean,
): boolean {
  if (interviewEvaluation.mode !== "none") {
    return interviewNeedsClarification({
      evaluation: interviewEvaluation,
      answers: resolvedAnswers,
      ...(proceedWithAssumption !== undefined ? { proceedWithAssumption } : {}),
    });
  }
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

async function listRepositoryManifestPaths(repositoryRoot: string | null | undefined): Promise<string[]> {
  if (!repositoryRoot) {
    return [];
  }
  try {
    const manifest = await computeManifestRevision(repositoryRoot);
    return manifest.entries.map((entry) => entry.path);
  } catch {
    return [];
  }
}

function clarificationAnswersForPlanning(input: TaskPlanningInput): ClarificationAnswerInput[] {
  if (input.clarificationAnswers?.length) {
    return input.clarificationAnswers;
  }

  const persisted = input.existingClarification?.interview?.answers;
  if (!persisted?.length) {
    return [];
  }

  return persisted.map((entry) => ({
    questionId: entry.questionId,
    selectedOptionId: entry.selectedOptionId,
    ...(entry.customAnswer ? { customAnswer: entry.customAnswer } : {}),
  }));
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

  const repositoryPaths = planningContext.sourcesUsed
    .filter((source) => source.sourceType === "repository_file" && source.path)
    .map((source) => source.path!);

  const legacyQuestion = questionFromLegacyEvaluation({
    ...(evaluation.question ? { question: evaluation.question } : {}),
    ...(evaluation.choiceSet ? { choiceSet: evaluation.choiceSet } : {}),
    ...(evaluation.reason ? { reason: evaluation.reason } : {}),
    ...(evaluation.conflictSources ? { conflictSources: evaluation.conflictSources } : {}),
    id:
      evaluation.decision === "SPEC_CONFLICT"
        ? "spec-conflict-authority"
        : evaluation.decision === "MATERIAL_AMBIGUITY" && isPasswordResetGoal(input.goal)
          ? "password-reset-method"
          : "scope-ambiguity",
    topic:
      evaluation.decision === "SPEC_CONFLICT"
        ? "ARCHITECTURE"
        : evaluation.decision === "MATERIAL_AMBIGUITY" && isPasswordResetGoal(input.goal)
          ? "SECURITY"
          : "SCOPE",
  });

  const skipDomainQuestions = false;

  const interviewEvaluationRaw = generateClarificationInterview({
    goal: input.goal,
    specifications,
    ...(input.acceptanceCriteria ? { userCriteria: input.acceptanceCriteria } : {}),
    repositoryPaths,
    legacyQuestion,
    skipDomainQuestions,
  });

  const interviewEvaluation: ClarificationInterviewEvaluation = reconcileInterviewEvaluation(
    interviewEvaluationRaw,
    input.existingClarification?.interview,
  ) as ClarificationInterviewEvaluation;

  let resolvedAnswers = resolveInterviewAnswers(
    interviewEvaluation.questions,
    clarificationAnswersForPlanning(input),
  );

  if (input.proceedWithAssumption && interviewEvaluation.mode === "recommended") {
    const assumptionAnswers = applyAssumptionAnswers(interviewEvaluation);
    resolvedAnswers = [...assumptionAnswers, ...resolvedAnswers].filter(
      (entry, index, array) => array.findIndex((item) => item.questionId === entry.questionId) === index,
    );
  }

  const interviewCriteria = criteriaFromClarificationAnswers(
    interviewEvaluation.questions,
    resolvedAnswers,
  );

  const answerProvided = Boolean(
    input.clarificationAnswer ||
      input.existingClarification?.answer ||
      resolvedAnswers.length > 0 ||
      input.proceedWithAssumption,
  );
  const needsPolicyClarification = policyNeedsClarification(
    evaluation,
    interviewEvaluation,
    resolvedAnswers,
    answerProvided,
    input.proceedWithAssumption,
  );

  const effectiveCriteria = mergeUserAndGeneratedCriteria(input.acceptanceCriteria, [
    ...(evaluation.inferredCriteria ?? []),
    ...interviewCriteria,
  ]);

  const workPlan = await planWork({
    goal: input.goal,
    taskId: input.taskId ?? "preview",
    ...(input.repositoryRoot ? { workspaceRoot: input.repositoryRoot } : {}),
    ...(effectiveCriteria.length ? { acceptanceCriteria: effectiveCriteria } : {}),
  });

  if (
    !needsPolicyClarification &&
    (evaluation.inferredCriteria?.length || interviewCriteria.length) &&
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
            [...(evaluation.inferredCriteria ?? []), ...interviewCriteria],
          );
        }
      }
    }
  }

  const interviewRecord =
    interviewEvaluation.mode !== "none"
      ? buildInterviewClarificationRecord({
          evaluation: interviewEvaluation,
          answers: resolvedAnswers,
          ...(input.proceedWithAssumption ? { proceedWithAssumption: true } : {}),
        })?.interview
      : undefined;

  const clarification = buildClarificationRecord({
    evaluation,
    ...(input.clarificationAnswer ? { answer: input.clarificationAnswer } : {}),
    ...(interviewRecord ? { interview: interviewRecord } : {}),
  });

  const derivedFields = workPlanToContractFields(workPlan);
  const repositoryManifestPaths = await listRepositoryManifestPaths(input.repositoryRoot);
  const governance = deriveContractGovernance({
    goal: input.goal,
    specifications: planningContext.relevantSpecifications,
    repositoryManifestPaths,
    derived: {
      expectedScope: derivedFields.inScope,
      acceptanceCriteria: derivedFields.acceptanceCriteria,
      requiredChecks: derivedFields.requiredChecks,
      needsClarification: workPlanNeedsClarification(workPlan),
    },
    ...(effectiveCriteria.length ? { userCriteria: effectiveCriteria } : {}),
  });
  const consistency = validateContractConsistency(governance);
  const clarificationConsistency =
    resolvedAnswers.length > 0
      ? validateClarificationContractConsistency({
          acceptanceCriteria: governance.acceptanceCriteria,
          questions: interviewEvaluation.questions,
          answers: resolvedAnswers,
        })
      : { ok: true as const };
  const persistedClarificationConsistency = validatePersistedClarificationState({
    clarification,
    acceptanceCriteria: governance.acceptanceCriteria,
  });
  const contractConsistencyOk = consistency.ok;
  const clarificationConsistencyOk = clarificationConsistency.ok;
  const persistedClarificationConsistencyOk = persistedClarificationConsistency.ok;
  const plannerSuperseded = isPlannerAmbiguitySupersededByClarification({
    needsPolicyClarification,
    interviewMode: interviewEvaluation.mode,
    questions: interviewEvaluation.questions,
    resolvedAnswers,
    effectiveCriteria,
    contractConsistencyOk,
    clarificationConsistencyOk,
    persistedClarificationConsistencyOk,
  });

  let finalGovernance = governance;
  if (plannerSuperseded) {
    applyGovernanceScopeToBlockedContracts(
      workPlan,
      governance,
      governance.acceptanceCriteria,
    );
    if (governance.needsClarification) {
      finalGovernance = deriveContractGovernance({
        goal: input.goal,
        specifications: planningContext.relevantSpecifications,
        repositoryManifestPaths,
        derived: {
          expectedScope: governance.inScope.length ? governance.inScope : derivedFields.inScope,
          acceptanceCriteria: derivedFields.acceptanceCriteria,
          requiredChecks: derivedFields.requiredChecks,
          needsClarification: false,
        },
        ...(effectiveCriteria.length ? { userCriteria: effectiveCriteria } : {}),
      });
    }
  }

  const governanceNeedsClarification =
    finalGovernance.needsClarification ||
    !contractConsistencyOk ||
    !clarificationConsistencyOk ||
    !persistedClarificationConsistencyOk;
  const governanceClarificationReason =
    finalGovernance.clarificationReason ??
    (!contractConsistencyOk
      ? consistency.reason
      : !clarificationConsistencyOk
        ? clarificationConsistency.reason
        : !persistedClarificationConsistencyOk
          ? persistedClarificationConsistency.reason
          : undefined);

  const pendingQuestions = applyAdaptiveQuestionFilter(
    interviewEvaluation.questions,
    resolvedAnswers.map((entry) => ({
      questionId: entry.questionId,
      selectedOptionId: entry.selectedOptionId,
      ...(entry.customAnswer ? { customAnswer: entry.customAnswer } : {}),
    })),
  );

  return {
    sensitiveBlocked,
    planningContext,
    evaluation,
    interviewEvaluation,
    resolvedAnswers,
    pendingQuestions,
    needsPolicyClarification,
    effectiveCriteria,
    workPlan,
    clarification,
    governance: finalGovernance,
    governanceNeedsClarification,
    governanceClarificationReason,
    contractConsistencyOk,
    clarificationConsistencyOk,
    persistedClarificationConsistencyOk,
  };
}

export async function analyzeTaskGoal(input: TaskPlanningInput): Promise<TaskGoalAnalysis> {
  const resolved = await resolvePlanning(input);
  const fields = workPlanToContractFields(resolved.workPlan);
  const contractFields = resolved.governance.inScope.length
    ? { ...fields, inScope: resolved.governance.inScope, acceptanceCriteria: resolved.governance.acceptanceCriteria }
    : fields;
  const needsClarification = resolveTaskNeedsClarification({
    needsPolicyClarification: resolved.needsPolicyClarification,
    governanceNeedsClarification: resolved.governanceNeedsClarification,
    interviewEvaluation: resolved.interviewEvaluation,
    resolvedAnswers: resolved.resolvedAnswers,
    effectiveCriteria: resolved.effectiveCriteria,
    workPlan: resolved.workPlan,
    contractConsistencyOk: resolved.contractConsistencyOk,
    clarificationConsistencyOk: resolved.clarificationConsistencyOk,
    persistedClarificationConsistencyOk: resolved.persistedClarificationConsistencyOk,
  });
  const userProvided = Boolean(input.acceptanceCriteria?.length);
  const firstPending = resolved.pendingQuestions[0];
  const choiceSet = resolved.evaluation.choiceSet;

  if (resolved.sensitiveBlocked.length > 0) {
    return {
      acceptanceCriteria: contractFields.acceptanceCriteria,
      expectedScope: contractFields.inScope,
      needsClarification: false,
      suggestedFromGoal: false,
      sourcesUsed: resolved.planningContext.sourcesUsed,
    };
  }

  if (
    resolved.pendingQuestions.length > 0 &&
    resolved.interviewEvaluation.mode !== "none" &&
    !input.proceedWithAssumption
  ) {
    const pendingCount = resolved.pendingQuestions.filter((question) => question.required).length ||
      resolved.pendingQuestions.length;
    return {
      acceptanceCriteria: resolved.effectiveCriteria.length
        ? resolved.effectiveCriteria
        : contractFields.acceptanceCriteria,
      expectedScope: contractFields.inScope,
      needsClarification: true,
      clarificationMode: resolved.interviewEvaluation.mode,
      clarificationQuestions: resolved.pendingQuestions,
      clarificationPendingCount: pendingCount,
      ...(resolved.interviewEvaluation.assumptionSummary
        ? { clarificationAssumptionSummary: resolved.interviewEvaluation.assumptionSummary }
        : {}),
      ...(resolved.governanceClarificationReason
        ? { clarificationMessage: resolved.governanceClarificationReason }
        : resolved.evaluation.reason
          ? { clarificationMessage: resolved.evaluation.reason }
          : {}),
      ...(firstPending?.question
        ? { clarificationQuestion: firstPending.question }
        : resolved.evaluation.question
          ? { clarificationQuestion: resolved.evaluation.question }
          : {}),
      ...(firstPending?.presentationMode === "choices"
        ? {
            clarificationChoiceOptions: firstPending.options,
            clarificationAllowOther: firstPending.allowOther,
            clarificationPresentationMode: firstPending.presentationMode,
          }
        : choiceSet?.presentationMode === "choices"
          ? {
              clarificationChoiceOptions: choiceSet.options,
              clarificationAllowOther: choiceSet.allowOther,
              clarificationPresentationMode: choiceSet.presentationMode,
            }
          : firstPending?.presentationMode
            ? { clarificationPresentationMode: firstPending.presentationMode }
            : choiceSet
              ? { clarificationPresentationMode: choiceSet.presentationMode }
              : {}),
      ...(resolved.evaluation.options ? { clarificationOptions: resolved.evaluation.options } : {}),
      suggestedFromGoal: !userProvided,
      sourcesUsed: resolved.planningContext.sourcesUsed,
    };
  }

  const decisions =
    resolved.resolvedAnswers.length > 0
      ? summarizeClarificationDecisions(resolved.interviewEvaluation.questions, resolved.resolvedAnswers)
      : undefined;

  return {
    acceptanceCriteria: resolved.effectiveCriteria.length
      ? mergeUserAndGeneratedCriteria(undefined, resolved.effectiveCriteria)
      : contractFields.acceptanceCriteria,
    expectedScope: contractFields.inScope,
    needsClarification,
    ...(decisions?.length ? { clarificationDecisions: decisions } : {}),
    suggestedFromGoal: !userProvided,
    sourcesUsed: resolved.planningContext.sourcesUsed,
  };
}

export async function planAndEvaluateTask(input: TaskPlanningInput): Promise<TaskPlanningResult> {
  const policy = await loadProjectGovernance(input.workspaceRoot);
  const resolved = await resolvePlanning(input);
  const needsClarification = resolveTaskNeedsClarification({
    needsPolicyClarification: resolved.needsPolicyClarification,
    governanceNeedsClarification: resolved.governanceNeedsClarification,
    interviewEvaluation: resolved.interviewEvaluation,
    resolvedAnswers: resolved.resolvedAnswers,
    effectiveCriteria: resolved.effectiveCriteria,
    workPlan: resolved.workPlan,
    contractConsistencyOk: resolved.contractConsistencyOk,
    clarificationConsistencyOk: resolved.clarificationConsistencyOk,
    persistedClarificationConsistencyOk: resolved.persistedClarificationConsistencyOk,
  });

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
      governance: resolved.governance,
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
  let approvalType = initial.approvalType;
  if (resolved.governance.useApprovalGovernance && status === "APPROVED_FOR_EXECUTION") {
    status = "CONTRACT_READY";
    approvalType = null;
  }
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
        policyDecision: approvalType ? "AUTO_APPROVED" : "HUMAN_APPROVAL_REQUIRED",
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
