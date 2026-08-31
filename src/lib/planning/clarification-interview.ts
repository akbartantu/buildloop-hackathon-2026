import { CLARIFICATION_OTHER_OPTION_ID } from "@/lib/planning/clarification-options";
import {
  buildPasswordResetChoiceSet,
  buildScopeAmbiguityFreeText,
  buildSpecConflictChoiceSet,
  type ClarificationChoiceSet,
} from "@/lib/planning/clarification-options";
import { isPasswordResetGoal, isReadmeGoal } from "@/lib/planning/planning-context";
import type {
  ClarificationAnswerRecord,
  ClarificationInterviewMode,
  ClarificationInterviewRecord,
  ClarificationQuestion,
  ClarificationQuestionOption,
  ClarificationTopic,
  PlanningSource,
  TaskClarification,
} from "@/lib/planning/planning-source";
import type { PlanningSpecificationEntry } from "@/lib/specifications/specification-set-record";
import { isAmbiguousGoal } from "@/orchestrator/contract/derive-task-contract";

export const MAX_CLARIFICATION_QUESTIONS = 5;

export type ClarificationAnswerInput = {
  questionId: string;
  selectedOptionId: string;
  customAnswer?: string | undefined;
};

export type ClarificationInterviewEvaluation = {
  mode: ClarificationInterviewMode;
  questions: ClarificationQuestion[];
  assumptionSummary?: string;
  inferredCriteria?: string[];
};

export type ClarificationConsistencyResult =
  | { ok: true }
  | { ok: false; reason: string };

function choiceSetToQuestion(input: {
  id: string;
  topic: ClarificationTopic;
  choiceSet: ClarificationChoiceSet;
  reason: string;
  required: boolean;
  sourceReferences?: PlanningSource[];
  recommendedOptionId?: string;
  assumptionOptionId?: string;
  assumptionLabel?: string;
}): ClarificationQuestion {
  const presentationMode = input.choiceSet.presentationMode;
  const options: ClarificationQuestionOption[] = input.choiceSet.options.map((option) => ({
    ...option,
    value: option.id,
  }));

  return {
    id: input.id,
    topic: input.topic,
    question: input.choiceSet.question,
    reason: input.reason,
    required: input.required,
    options,
    allowOther: input.choiceSet.allowOther,
    presentationMode,
    ...(input.recommendedOptionId ? { recommendedOptionId: input.recommendedOptionId } : {}),
    ...(input.assumptionOptionId ? { assumptionOptionId: input.assumptionOptionId } : {}),
    ...(input.assumptionLabel ? { assumptionLabel: input.assumptionLabel } : {}),
    ...(input.sourceReferences?.length ? { sourceReferences: input.sourceReferences } : {}),
  };
}

function combinedEvidenceText(input: {
  goal: string;
  specifications: PlanningSpecificationEntry[];
  userCriteria?: string[];
  repositoryPaths?: string[];
}): string {
  const parts = [
    input.goal,
    ...(input.userCriteria ?? []),
    ...input.specifications.map((spec) => [spec.filename, spec.content].join("\n")),
    ...(input.repositoryPaths ?? []),
  ];
  return parts.join("\n").toLowerCase();
}

function isBackendOnlyGoal(goal: string): boolean {
  const normalized = goal.toLowerCase();
  return (
    /\b(api|backend|database schema|migration|server-side|endpoint)\b/.test(normalized) &&
    !/\b(ui|ux|dashboard|interface|frontend|shell|navigation|visual|design)\b/.test(normalized)
  );
}

function isFocusSessionGoal(goal: string): boolean {
  return /\b(focus sessions?|long break|pomodoro|focus timer|completed focus)\b/i.test(goal);
}

function isDashboardShellGoal(goal: string): boolean {
  return /\b(dashboard shell|responsive dashboard|clevia|navigation shell|mock data foundation|frontend foundation)\b/i.test(
    goal,
  );
}

function isUiCreationGoal(goal: string): boolean {
  const normalized = goal.toLowerCase();
  return /\b(ui|ux|dashboard|interface|frontend|shell|navigation|visual|design)\b/.test(normalized);
}

function evidenceDefinesFocusCycleBehavior(text: string): boolean {
  return /manual(ly)?\s+(switch|mode)|reset.*cycle|session counter.*manual|manual.*session counter|preserve.*count|manual switching should not/i.test(
    text,
  );
}

function evidenceDefinesNavPlaceholderBehavior(text: string): boolean {
  return /(visible but disabled|hidden until|coming soon|disabled nav|placeholder nav|do not navigate)/i.test(
    text,
  );
}

function evidenceDefinesVisualDirection(text: string): boolean {
  return /(light minimal|light and airy|dark mode|dark theme|light theme|soft neutral|visual direction|design system|white or very light surfaces)/i.test(
    text,
  );
}

function detectFocusSessionCycleQuestion(
  goal: string,
  evidence: string,
): ClarificationQuestion | null {
  if (!isFocusSessionGoal(goal) || evidenceDefinesFocusCycleBehavior(evidence)) {
    return null;
  }

  return {
    id: "focus-session-cycle",
    topic: "BUSINESS_LOGIC",
    question: "What should happen to the completed focus-session cycle when the user manually switches modes?",
    reason:
      "The task adds cycle-based break behavior but no specification defines how manual mode switching affects the session counter.",
    required: true,
    allowOther: true,
    presentationMode: "choices",
    options: [
      {
        id: "preserve-count",
        value: "preserve_count",
        label: "Preserve the completed-session count",
        description: "Manual switching does not reset the four-session cycle or completed focus count.",
      },
      {
        id: "reset-cycle",
        value: "reset_cycle",
        label: "Reset the current four-session cycle",
        description: "Manual mode switching clears the current cycle progress toward the long break.",
      },
      {
        id: "ignore-manual",
        value: "ignore_manual",
        label: "Manual switching should not affect the automatic cycle",
        description: "Only naturally completed focus timers advance the long-break cycle.",
        recommended: true,
        recommendationReason: "Safer default when specifications do not define manual-switch semantics.",
      },
    ],
    recommendedOptionId: "ignore-manual",
  };
}

function detectNavPlaceholderQuestion(goal: string, evidence: string): ClarificationQuestion | null {
  if (!isDashboardShellGoal(goal) || evidenceDefinesNavPlaceholderBehavior(evidence)) {
    return null;
  }

  return {
    id: "nav-placeholder-behavior",
    topic: "UX_BEHAVIOR",
    question: "How should navigation items for modules not implemented in this task behave?",
    reason:
      "The dashboard shell includes navigation placeholders but specifications do not define unavailable module behavior.",
    required: true,
    allowOther: true,
    presentationMode: "choices",
    options: [
      {
        id: "visible-disabled",
        value: "visible_disabled",
        label: "Visible but disabled",
        description: "Unimplemented navigation items stay visible, appear disabled, and do not navigate.",
        recommended: true,
        recommendationReason: "Common dashboard-shell pattern that preserves layout without fake routes.",
      },
      {
        id: "hidden",
        value: "hidden",
        label: "Hidden until implemented",
        description: "Only implemented modules appear in navigation.",
      },
      {
        id: "coming-soon",
        value: "coming_soon",
        label: 'Navigate to explicit "Coming soon" pages',
        description: "Each placeholder route opens a non-functional coming-soon view.",
      },
    ],
    recommendedOptionId: "visible-disabled",
  };
}

function detectVisualDirectionQuestion(goal: string, evidence: string): ClarificationQuestion | null {
  if (isBackendOnlyGoal(goal) || !isUiCreationGoal(goal) || evidenceDefinesVisualDirection(evidence)) {
    return null;
  }

  const hasHint = /minimal|light|neutral|clean/i.test(evidence);

  return {
    id: "ui-visual-direction",
    topic: "UX_DESIGN",
    question: "Which visual direction should the initial interface use?",
    reason: hasHint
      ? "Specifications mention a general UI direction but not a concrete visual treatment for this task."
      : "No usable UI direction was found in specifications or repository evidence for this UI task.",
    required: !hasHint,
    allowOther: true,
    presentationMode: "choices",
    ...(hasHint
      ? {
          assumptionOptionId: "soft-neutral",
          assumptionLabel: "Soft neutral",
          recommendedOptionId: "soft-neutral",
        }
      : {}),
    options: [
      {
        id: "light-airy",
        value: "light_airy",
        label: "Light and airy",
        description: "White or very light surfaces, subtle shadows, restrained accents.",
      },
      {
        id: "dark-focused",
        value: "dark_focused",
        label: "Dark and focused",
        description: "Dark surfaces with high-contrast typography.",
      },
      {
        id: "soft-neutral",
        value: "soft_neutral",
        label: "Soft neutral",
        description: "Warm neutral tones with subtle accents.",
        ...(hasHint
          ? {
              recommended: true,
              recommendationReason: "Closest match to the partial UI direction already present in evidence.",
            }
          : {}),
      },
    ],
    ...(hasHint ? { recommendedOptionId: "soft-neutral" } : {}),
  };
}

function detectPasswordResetQuestion(
  specifications: PlanningSpecificationEntry[],
): ClarificationQuestion | null {
  const choiceSet = buildPasswordResetChoiceSet(specifications);
  const recommended = choiceSet.options.find((option) => option.recommended);
  return choiceSetToQuestion({
    id: "password-reset-method",
    topic: "SECURITY",
    choiceSet,
    reason: "Password reset method materially affects contract scope and acceptance criteria.",
    required: true,
    ...(recommended ? { recommendedOptionId: recommended.id } : {}),
  });
}

function detectSpecConflictQuestion(input: {
  question: string;
  leftLabel: string;
  rightLabel: string;
  leftDescription: string;
  rightDescription: string;
  sourceReferences: PlanningSource[];
}): ClarificationQuestion {
  const choiceSet = buildSpecConflictChoiceSet({
    question: input.question,
    leftLabel: input.leftLabel,
    rightLabel: input.rightLabel,
    leftDescription: input.leftDescription,
    rightDescription: input.rightDescription,
  });
  return choiceSetToQuestion({
    id: "spec-conflict-authority",
    topic: "ARCHITECTURE",
    choiceSet,
    reason: "Conflicting specification sources require an authoritative decision.",
    required: true,
    sourceReferences: input.sourceReferences,
  });
}

function detectScopeAmbiguityQuestion(): ClarificationQuestion {
  const choiceSet = buildScopeAmbiguityFreeText(
    "Which exact files or directories may BuildLoop modify to complete this task?",
  );
  return choiceSetToQuestion({
    id: "scope-ambiguity",
    topic: "SCOPE",
    choiceSet,
    reason: "Goal scope is too broad to derive a safe bounded contract.",
    required: true,
  });
}

function questionFromLegacyEvaluation(input: {
  question?: string;
  choiceSet?: ClarificationChoiceSet;
  reason?: string;
  conflictSources?: PlanningSource[];
  topic?: ClarificationTopic;
  id?: string;
}): ClarificationQuestion | null {
  if (!input.question || !input.choiceSet) {
    return null;
  }
  return choiceSetToQuestion({
    id: input.id ?? "legacy-clarification",
    topic: input.topic ?? "SCOPE",
    choiceSet: input.choiceSet,
    reason: input.reason ?? "Material ambiguity detected.",
    required: true,
    ...(input.conflictSources?.length ? { sourceReferences: input.conflictSources } : {}),
  });
}

export function applyAdaptiveQuestionFilter(
  questions: ClarificationQuestion[],
  answers: ClarificationAnswerInput[],
): ClarificationQuestion[] {
  const answered = new Map(answers.map((entry) => [entry.questionId, entry]));

  return questions.filter((question) => {
    if (answered.has(question.id)) {
      return false;
    }

    if (question.id === "ui-visual-direction") {
      const navAnswer = answered.get("nav-placeholder-behavior");
      if (navAnswer?.selectedOptionId === "hidden") {
        return false;
      }
    }

    return true;
  });
}

export function resolveClarificationAnswerRecord(
  question: ClarificationQuestion,
  input: ClarificationAnswerInput,
  options?: { usedAssumption?: boolean },
): ClarificationAnswerRecord | null {
  const now = new Date().toISOString();

  if (question.presentationMode === "free_text") {
    const answer = input.customAnswer?.trim() ?? "";
    if (!answer) {
      return null;
    }
    return {
      questionId: question.id,
      selectedOptionId: CLARIFICATION_OTHER_OPTION_ID,
      customAnswer: answer,
      answer,
      answeredAt: now,
      ...(options?.usedAssumption ? { usedAssumption: true } : {}),
    };
  }

  if (!input.selectedOptionId) {
    return null;
  }

  if (input.selectedOptionId === CLARIFICATION_OTHER_OPTION_ID) {
    const answer = input.customAnswer?.trim() ?? "";
    if (!answer) {
      return null;
    }
    return {
      questionId: question.id,
      selectedOptionId: CLARIFICATION_OTHER_OPTION_ID,
      customAnswer: answer,
      answer,
      answeredAt: now,
      ...(options?.usedAssumption ? { usedAssumption: true } : {}),
    };
  }

  const match = question.options.find((option) => option.id === input.selectedOptionId);
  const answer = match?.label.trim() ?? "";
  if (!answer) {
    return null;
  }

  return {
    questionId: question.id,
    selectedOptionId: input.selectedOptionId,
    answer,
    answeredAt: now,
    ...(options?.usedAssumption ? { usedAssumption: true } : {}),
  };
}

export function resolveInterviewAnswers(
  questions: ClarificationQuestion[],
  answers: ClarificationAnswerInput[],
): ClarificationAnswerRecord[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const resolved: ClarificationAnswerRecord[] = [];
  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    if (!question) {
      continue;
    }
    const record = resolveClarificationAnswerRecord(question, answer);
    if (record) {
      resolved.push(record);
    }
  }
  return resolved;
}

export function criteriaFromClarificationAnswers(
  questions: ClarificationQuestion[],
  answers: ClarificationAnswerRecord[],
): string[] {
  const byQuestion = new Map(questions.map((question) => [question.id, question]));
  const criteria: string[] = [];

  for (const answer of answers) {
    const question = byQuestion.get(answer.questionId);
    if (!question) {
      continue;
    }

    if (question.presentationMode === "free_text") {
      criteria.push(`Modify only the following scope: ${answer.answer}`);
      continue;
    }

    const selected =
      answer.selectedOptionId === CLARIFICATION_OTHER_OPTION_ID
        ? null
        : question.options.find((option) => option.id === answer.selectedOptionId);

    switch (question.id) {
      case "focus-session-cycle":
        if (selected?.value === "preserve_count") {
          criteria.push(
            "Manual mode switching preserves the completed focus-session count toward the long-break cycle.",
          );
        } else if (selected?.value === "reset_cycle") {
          criteria.push("Manual mode switching resets the current four-session cycle progress.");
        } else if (selected?.value === "ignore_manual") {
          criteria.push(
            "Only naturally completed focus timers advance the long-break cycle; manual switching does not count.",
          );
        } else {
          criteria.push(`Focus-session cycle behavior: ${answer.answer}`);
        }
        break;
      case "nav-placeholder-behavior":
        if (selected?.value === "visible_disabled") {
          criteria.push(
            "Audits, Content Calendar, Business Profile, Settings, and other unimplemented navigation items remain visible but disabled and do not navigate to placeholder functionality.",
          );
        } else if (selected?.value === "hidden") {
          criteria.push("Navigation shows only modules implemented in this task.");
        } else if (selected?.value === "coming_soon") {
          criteria.push('Unimplemented navigation items route to explicit "Coming soon" placeholder pages.');
        } else {
          criteria.push(`Navigation placeholder behavior: ${answer.answer}`);
        }
        break;
      case "ui-visual-direction":
        if (selected?.value === "light_airy") {
          criteria.push("Initial UI uses a light and airy visual direction with restrained accents.");
        } else if (selected?.value === "dark_focused") {
          criteria.push("Initial UI uses a dark and focused visual direction with high-contrast typography.");
        } else if (selected?.value === "soft_neutral") {
          criteria.push("Initial UI uses soft neutral tones with subtle accents.");
        } else {
          criteria.push(`Visual direction: ${answer.answer}`);
        }
        break;
      case "password-reset-method":
        if (selected?.value === "email-link" || /email link/i.test(answer.answer)) {
          criteria.push("Password reset uses a secure email link flow.");
        } else if (selected?.value === "otp" || /\botp\b/i.test(answer.answer)) {
          criteria.push("Password reset uses a one-time password (OTP) verification flow.");
        } else {
          criteria.push(`Password reset behavior: ${answer.answer}`);
        }
        break;
      default:
        criteria.push(`${question.question} → ${answer.answer}`);
        break;
    }
  }

  return criteria;
}

export function validateClarificationContractConsistency(input: {
  acceptanceCriteria: string[];
  questions: ClarificationQuestion[];
  answers: ClarificationAnswerRecord[];
}): ClarificationConsistencyResult {
  const criteriaText = input.acceptanceCriteria.join("\n").toLowerCase();
  const answerByQuestion = new Map(input.answers.map((entry) => [entry.questionId, entry]));

  const navAnswer = answerByQuestion.get("nav-placeholder-behavior");
  if (navAnswer) {
    const question = input.questions.find((entry) => entry.id === "nav-placeholder-behavior");
    const selected = question?.options.find((option) => option.id === navAnswer.selectedOptionId);
    if (selected?.value === "hidden" && /remain visible|visible but disabled|stay visible/.test(criteriaText)) {
      return {
        ok: false,
        reason: "Contract acceptance criteria contradict the clarification decision to hide unimplemented navigation items.",
      };
    }
    if (selected?.value === "visible_disabled" && /hidden until|hide unimplemented|only implemented modules/.test(criteriaText)) {
      return {
        ok: false,
        reason: "Contract acceptance criteria contradict the clarification decision to keep navigation placeholders visible but disabled.",
      };
    }
    if (
      selected?.value === "visible_disabled" &&
      !/(visible but disabled|remain visible.*disabled|disabled.*nav|do not navigate)/i.test(criteriaText)
    ) {
      return {
        ok: false,
        reason:
          "Contract acceptance criteria omit the clarification decision to keep unimplemented navigation items visible but disabled.",
      };
    }
  }

  const focusAnswer = answerByQuestion.get("focus-session-cycle");
  if (focusAnswer) {
    const question = input.questions.find((entry) => entry.id === "focus-session-cycle");
    const selected = question?.options.find((option) => option.id === focusAnswer.selectedOptionId);
    if (selected?.value === "reset_cycle" && /preserve.*count|manual switching does not reset/.test(criteriaText)) {
      return {
        ok: false,
        reason: "Contract acceptance criteria contradict the clarification decision to reset the focus-session cycle on manual switch.",
      };
    }
  }

  return { ok: true };
}

export function buildInterviewClarificationRecord(input: {
  evaluation: ClarificationInterviewEvaluation;
  answers?: ClarificationAnswerRecord[];
  proceedWithAssumption?: boolean;
}): TaskClarification | undefined {
  if (input.evaluation.mode === "none" || input.evaluation.questions.length === 0) {
    return undefined;
  }

  const now = new Date().toISOString();
  const firstQuestion = input.evaluation.questions[0]!;
  const requiredQuestions = input.evaluation.questions.filter((question) => question.required);
  const completed =
    requiredQuestions.length > 0 &&
    requiredQuestions.every((question) =>
      input.answers?.some((answer) => answer.questionId === question.id),
    );
  const pendingQuestions = applyAdaptiveQuestionFilter(
    input.evaluation.questions,
    (input.answers ?? []).map((entry) => ({
      questionId: entry.questionId,
      selectedOptionId: entry.selectedOptionId,
      ...(entry.customAnswer ? { customAnswer: entry.customAnswer } : {}),
    })),
  );
  const displayQuestion = pendingQuestions[0] ?? null;

  const clarification: TaskClarification = {
    reason: (displayQuestion ?? firstQuestion).reason,
    askedAt: now,
    interview: {
      mode: input.evaluation.mode,
      questions: input.evaluation.questions,
      answers: input.answers ?? [],
      ...(input.evaluation.assumptionSummary ? { assumptionSummary: input.evaluation.assumptionSummary } : {}),
      askedAt: now,
      ...(completed ? { completedAt: now } : {}),
      ...(input.proceedWithAssumption ? { assumptionSummary: input.evaluation.assumptionSummary } : {}),
    },
  };

  if (!completed && displayQuestion) {
    clarification.question = displayQuestion.question;
    if (displayQuestion.presentationMode === "choices") {
      clarification.choiceOptions = displayQuestion.options;
      clarification.allowOther = displayQuestion.allowOther;
    }
  }

  if (input.answers?.[0]) {
    clarification.answer = input.answers[0].answer;
    clarification.answeredAt = input.answers[0].answeredAt;
    clarification.selectedOptionId = input.answers[0].selectedOptionId;
    if (input.answers[0].customAnswer) {
      clarification.customAnswer = input.answers[0].customAnswer;
    }
  }

  return clarification;
}

export function summarizeClarificationDecisions(
  questions: ClarificationQuestion[],
  answers: ClarificationAnswerRecord[],
): Array<{ label: string; answer: string }> {
  const byQuestion = new Map(questions.map((question) => [question.id, question]));
  return answers.map((entry) => {
    const question = byQuestion.get(entry.questionId);
    const label =
      question?.topic === "BUSINESS_LOGIC"
        ? question.question.split("?")[0] ?? question.question
        : question?.topic.replace(/_/g, " ") ?? entry.questionId;
    return { label, answer: entry.answer };
  });
}

export function generateClarificationInterview(input: {
  goal: string;
  specifications: PlanningSpecificationEntry[];
  userCriteria?: string[];
  repositoryPaths?: string[];
  legacyQuestion?: ClarificationQuestion | null;
  skipDomainQuestions?: boolean;
}): ClarificationInterviewEvaluation {
  const goal = input.goal.trim();
  const evidence = combinedEvidenceText(input);

  if (isReadmeGoal(goal) && !isAmbiguousGoal(goal)) {
    return { mode: "none", questions: [] };
  }

  const candidates: ClarificationQuestion[] = [];

  if (input.legacyQuestion) {
    candidates.push(input.legacyQuestion);
  }

  if (!input.skipDomainQuestions) {
    const focusQuestion = detectFocusSessionCycleQuestion(goal, evidence);
    if (focusQuestion) {
      candidates.push(focusQuestion);
    }

    const navQuestion = detectNavPlaceholderQuestion(goal, evidence);
    if (navQuestion) {
      candidates.push(navQuestion);
    }

    const visualQuestion = detectVisualDirectionQuestion(goal, evidence);
    if (visualQuestion) {
      candidates.push(visualQuestion);
    }

    if (isPasswordResetGoal(goal) && !candidates.some((question) => question.id === "password-reset-method")) {
      const resetQuestion = detectPasswordResetQuestion(input.specifications);
      if (resetQuestion) {
        candidates.push(resetQuestion);
      }
    }

    if (
      isAmbiguousGoal(goal) &&
      (input.userCriteria?.length ?? 0) === 0 &&
      !candidates.some((question) => question.id === "scope-ambiguity")
    ) {
      candidates.push(detectScopeAmbiguityQuestion());
    }
  }

  const deduped = candidates.filter(
    (question, index, array) => array.findIndex((entry) => entry.id === question.id) === index,
  );
  const questions = deduped.slice(0, MAX_CLARIFICATION_QUESTIONS);

  if (questions.length === 0) {
    return { mode: "none", questions: [] };
  }

  const hasRequired = questions.some((question) => question.required);
  const hasRecommendedOnly = !hasRequired && questions.some((question) => question.assumptionOptionId);
  const assumptionQuestion = questions.find((question) => question.assumptionOptionId);
  const assumptionOption = assumptionQuestion?.options.find(
    (option) => option.id === assumptionQuestion.assumptionOptionId,
  );

  return {
    mode: hasRequired ? "required" : hasRecommendedOnly ? "recommended" : "required",
    questions,
    ...(assumptionOption
      ? {
          assumptionSummary: `${assumptionOption.label}: ${assumptionOption.description}`,
        }
      : {}),
  };
}

export function interviewNeedsClarification(input: {
  evaluation: ClarificationInterviewEvaluation;
  answers: ClarificationAnswerRecord[];
  proceedWithAssumption?: boolean;
}): boolean {
  if (input.evaluation.mode === "none" || input.evaluation.questions.length === 0) {
    return false;
  }

  const remaining = applyAdaptiveQuestionFilter(
    input.evaluation.questions,
    input.answers.map((entry) => ({
      questionId: entry.questionId,
      selectedOptionId: entry.selectedOptionId,
      ...(entry.customAnswer ? { customAnswer: entry.customAnswer } : {}),
    })),
  );

  if (remaining.length === 0) {
    return false;
  }

  if (input.evaluation.mode === "recommended" && input.proceedWithAssumption) {
    const unansweredRecommended = remaining.filter((question) => !question.required);
    return unansweredRecommended.some((question) => !question.assumptionOptionId);
  }

  const unansweredRequired = remaining.filter((question) => question.required);
  return unansweredRequired.length > 0;
}

export function applyAssumptionAnswers(
  evaluation: ClarificationInterviewEvaluation,
): ClarificationAnswerRecord[] {
  if (evaluation.mode !== "recommended") {
    return [];
  }

  const now = new Date().toISOString();
  const records: ClarificationAnswerRecord[] = [];

  for (const question of evaluation.questions) {
    if (!question.assumptionOptionId) {
      continue;
    }
    const option = question.options.find((entry) => entry.id === question.assumptionOptionId);
    if (!option) {
      continue;
    }
    records.push({
      questionId: question.id,
      selectedOptionId: option.id,
      answer: option.label,
      answeredAt: now,
      usedAssumption: true,
    });
  }

  return records;
}

export {
  detectSpecConflictQuestion,
  detectPasswordResetQuestion,
  detectScopeAmbiguityQuestion,
  questionFromLegacyEvaluation,
};
