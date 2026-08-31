import type {
  ClarificationAnswerRecord,
  ClarificationQuestion,
  TaskClarification,
} from "@/lib/planning/planning-source";

export function isInterviewQuestionAnswered(
  question: ClarificationQuestion,
  answers: ClarificationAnswerRecord[],
): boolean {
  return answers.some((entry) => entry.questionId === question.id);
}

export function isClarificationInterviewComplete(
  clarification: TaskClarification | undefined,
): boolean {
  const interview = clarification?.interview;
  if (!interview || interview.questions.length === 0) {
    return false;
  }

  if (interview.completedAt) {
    return true;
  }

  const requiredQuestions = interview.questions.filter((question) => question.required);
  if (requiredQuestions.length === 0) {
    return interview.answers.length > 0;
  }

  return requiredQuestions.every((question) => isInterviewQuestionAnswered(question, interview.answers));
}

export function hasUnresolvedClarification(
  clarification: TaskClarification | undefined,
): boolean {
  if (!clarification) {
    return false;
  }

  const interview = clarification.interview;
  if (interview && interview.questions.length > 0) {
    const pendingRequired = interview.questions
      .filter((question) => question.required)
      .filter((question) => !isInterviewQuestionAnswered(question, interview.answers));
    return pendingRequired.length > 0;
  }

  return Boolean(clarification.question && !clarification.answer);
}

export function getResolvedClarificationDecisions(
  clarification: TaskClarification | undefined,
): Array<{ label: string; answer: string }> {
  const interview = clarification?.interview;
  if (!interview?.answers.length) {
    if (clarification?.question && clarification.answer) {
      return [{ label: clarification.question, answer: clarification.answer }];
    }
    return [];
  }

  const byQuestion = new Map(interview.questions.map((question) => [question.id, question]));
  return interview.answers.map((entry) => {
    const question = byQuestion.get(entry.questionId);
    const label = question?.question ?? entry.questionId;
    return { label, answer: entry.answer };
  });
}

export function mergePersistedInterviewQuestions(
  generated: ClarificationQuestion[],
  persisted: ClarificationQuestion[] | undefined,
): ClarificationQuestion[] {
  if (!persisted?.length) {
    return generated;
  }

  const merged = new Map<string, ClarificationQuestion>();
  for (const question of generated) {
    merged.set(question.id, question);
  }
  for (const question of persisted) {
    if (!merged.has(question.id)) {
      merged.set(question.id, question);
    }
  }
  return [...merged.values()];
}

export function reconcileInterviewEvaluation(
  generated: {
    mode: "none" | "required" | "recommended";
    questions: ClarificationQuestion[];
    assumptionSummary?: string;
  },
  persistedInterview: TaskClarification["interview"] | undefined,
): {
  mode: "none" | "required" | "recommended";
  questions: ClarificationQuestion[];
  assumptionSummary?: string;
} {
  const questions = mergePersistedInterviewQuestions(generated.questions, persistedInterview?.questions);

  if (questions.length === 0) {
    return { mode: "none", questions: [] };
  }

  if (generated.mode === "none" && persistedInterview?.answers.length) {
    const hasRequired = questions.some((question) => question.required);
    return {
      mode: persistedInterview.mode ?? (hasRequired ? "required" : "recommended"),
      questions,
      ...(persistedInterview.assumptionSummary
        ? { assumptionSummary: persistedInterview.assumptionSummary }
        : generated.assumptionSummary
          ? { assumptionSummary: generated.assumptionSummary }
          : {}),
    };
  }

  return {
    ...generated,
    questions,
  };
}

export function isPlannerAmbiguitySupersededByClarification(input: {
  needsPolicyClarification: boolean;
  interviewMode: "none" | "required" | "recommended";
  questions: ClarificationQuestion[];
  resolvedAnswers: ClarificationAnswerRecord[];
  effectiveCriteria: string[];
  contractConsistencyOk: boolean;
  clarificationConsistencyOk: boolean;
  persistedClarificationConsistencyOk: boolean;
}): boolean {
  if (input.needsPolicyClarification) {
    return false;
  }

  if (
    !input.contractConsistencyOk ||
    !input.clarificationConsistencyOk ||
    !input.persistedClarificationConsistencyOk
  ) {
    return false;
  }

  if (input.interviewMode !== "none") {
    const requiredQuestions = input.questions.filter((question) => question.required);
    const requiredComplete =
      requiredQuestions.length === 0 ||
      requiredQuestions.every((question) =>
        input.resolvedAnswers.some((answer) => answer.questionId === question.id),
      );
    if (!requiredComplete) {
      return false;
    }
  }

  return input.effectiveCriteria.length > 0;
}

export function validatePersistedClarificationState(input: {
  clarification: TaskClarification | undefined;
  acceptanceCriteria: string[];
}): { ok: true } | { ok: false; reason: string } {
  if (!input.clarification?.interview?.answers.length) {
    return { ok: true };
  }

  if (!isClarificationInterviewComplete(input.clarification)) {
    return { ok: true };
  }

  if (hasUnresolvedClarification(input.clarification)) {
    return {
      ok: false,
      reason:
        "Clarification interview is complete but legacy clarification fields still mark the task as unresolved.",
    };
  }

  const navAnswer = input.clarification.interview.answers.find(
    (entry) => entry.questionId === "nav-placeholder-behavior",
  );
  if (
    navAnswer?.selectedOptionId === "visible-disabled" &&
    !/(visible but disabled|remain visible.*disabled|do not navigate)/i.test(
      input.acceptanceCriteria.join("\n"),
    )
  ) {
    return {
      ok: false,
      reason:
        "Persisted visible-disabled clarification is not reflected in contract acceptance criteria.",
    };
  }

  return { ok: true };
}
