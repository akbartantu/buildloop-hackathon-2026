import { isAmbiguousGoal } from "@/orchestrator/contract/derive-task-contract";
import type { BlockedReason } from "@/lib/sensitive-intent";
import type { PlanningSpecificationEntry } from "@/lib/specifications/specification-set-record";
import {
  normalizeDocumentType,
  specificationDocumentTypeLabel,
} from "@/lib/specifications/specification-record";
import type { PlanningSource, TaskClarification } from "@/lib/planning/planning-source";
import { isPasswordResetGoal, isReadmeGoal } from "./planning-context";
import { isClarificationInterviewComplete } from "./clarification-state";
import {
  buildPasswordResetChoiceSet,
  buildScopeAmbiguityFreeText,
  buildSpecConflictChoiceSet,
  type ClarificationChoiceSet,
} from "./clarification-options";

export type ClarificationDecision = "CLEAR" | "MATERIAL_AMBIGUITY" | "SENSITIVE_OR_PROTECTED" | "SPEC_CONFLICT";

export type ResetMethodSignal = "email_link" | "otp" | "admin_reset";

export type ClarificationEvaluation = {
  decision: ClarificationDecision;
  question?: string;
  /** @deprecated Use choiceSet instead. */
  options?: string[];
  choiceSet?: ClarificationChoiceSet;
  reason?: string;
  conflictSources?: PlanningSource[];
  inferredCriteria?: string[];
  clarification?: TaskClarification;
};

function extractResetMethodSignals(text: string): Set<ResetMethodSignal> {
  const normalized = text.toLowerCase();
  const signals = new Set<ResetMethodSignal>();
  if (
    /email link|magic link|reset link|password reset email|send a reset email|link in email/.test(
      normalized,
    )
  ) {
    signals.add("email_link");
  }
  if (/\botp\b|one[- ]time password|verification code|sms code|6-digit code/.test(normalized)) {
    signals.add("otp");
  }
  if (/admin reset|support reset|manual reset by admin/.test(normalized)) {
    signals.add("admin_reset");
  }
  return signals;
}

function signalsBySpecification(
  specifications: PlanningSpecificationEntry[],
): Array<{ spec: PlanningSpecificationEntry; signals: Set<ResetMethodSignal> }> {
  return specifications.map((spec) => ({
    spec,
    signals: extractResetMethodSignals(spec.content),
  }));
}

function resetMethodLabel(signal: ResetMethodSignal): string {
  switch (signal) {
    case "email_link":
      return "email link";
    case "otp":
      return "OTP";
    case "admin_reset":
      return "admin reset";
  }
}

function criteriaFromResetMethod(method: ResetMethodSignal, goal: string): string[] {
  switch (method) {
    case "email_link":
      return [
        "Password reset uses a secure email link flow.",
        "Reset requests do not reveal whether an account exists.",
        "Reset flow integrates with existing auth routes.",
        "Relevant auth tests pass.",
        "No protected paths are modified.",
      ];
    case "otp":
      return [
        "Password reset uses a one-time password (OTP) verification flow.",
        "OTP delivery and expiry are handled securely.",
        "Reset flow integrates with existing auth routes.",
        "Relevant auth tests pass.",
        "No protected paths are modified.",
      ];
    case "admin_reset":
      return [
        "Password reset is initiated through an admin-approved process.",
        "Reset flow is auditable and does not expose credentials.",
        "Relevant auth tests pass.",
        "No protected paths are modified.",
      ];
    default:
      return [`Implement the requested change: ${goal.trim()}`, "No protected paths are modified."];
  }
}

function parseClarificationAnswer(answer: string): ResetMethodSignal | null {
  const normalized = answer.toLowerCase();
  if (/email|link|magic link/.test(normalized)) {
    return "email_link";
  }
  if (/otp|one[- ]time|verification code|code/.test(normalized)) {
    return "otp";
  }
  if (/admin|support/.test(normalized)) {
    return "admin_reset";
  }
  return null;
}

function detectSpecConflict(
  specifications: PlanningSpecificationEntry[],
): { conflict: true; question: string; options: string[]; sources: PlanningSource[] } | { conflict: false } {
  const entries = signalsBySpecification(specifications).filter((entry) => entry.signals.size > 0);
  const allSignals = new Set<ResetMethodSignal>();
  for (const entry of entries) {
    for (const signal of entry.signals) {
      allSignals.add(signal);
    }
  }

  if (allSignals.size <= 1 || entries.length < 2) {
    return { conflict: false };
  }

  const prd = entries.find((entry) => normalizeDocumentType(entry.spec.documentType) === "prd");
  const frd = entries.find((entry) => normalizeDocumentType(entry.spec.documentType) === "frd");
  const left = prd ?? entries[0]!;
  const right = frd ?? entries.find((entry) => entry.spec.id !== left.spec.id)!;

  const leftSignal = [...left.signals][0];
  const rightSignal = [...right.signals].find((signal) => signal !== leftSignal) ?? [...right.signals][0];
  if (!leftSignal || !rightSignal || leftSignal === rightSignal) {
    return { conflict: false };
  }

  const leftLabel = specificationDocumentTypeLabel(left.spec.documentType);
  const rightLabel = specificationDocumentTypeLabel(right.spec.documentType);

  return {
    conflict: true,
    question: `${leftLabel} specifies ${resetMethodLabel(leftSignal)} while ${rightLabel} specifies ${resetMethodLabel(rightSignal)}. Which source should be authoritative for this task?`,
    options: [leftLabel, rightLabel],
    sources: [
      {
        sourceType: "specification",
        displayName: left.spec.filename,
        documentId: left.spec.id,
        section: "Password recovery",
      },
      {
        sourceType: "specification",
        displayName: right.spec.filename,
        documentId: right.spec.id,
        section: "Password recovery",
      },
    ],
  };
}

function evaluationFromChoiceSet(
  decision: ClarificationDecision,
  choiceSet: ClarificationChoiceSet,
  extras?: {
    reason?: string;
    conflictSources?: PlanningSource[];
  },
): ClarificationEvaluation {
  return {
    decision,
    question: choiceSet.question,
    choiceSet,
    ...(choiceSet.presentationMode === "choices"
      ? { options: choiceSet.options.map((option) => option.label) }
      : {}),
    ...(extras?.reason ? { reason: extras.reason } : {}),
    ...(extras?.conflictSources ? { conflictSources: extras.conflictSources } : {}),
  };
}

function inferResetMethodFromSpecs(
  specifications: PlanningSpecificationEntry[],
): ResetMethodSignal | null {
  const combined = new Set<ResetMethodSignal>();
  for (const entry of signalsBySpecification(specifications)) {
    for (const signal of entry.signals) {
      combined.add(signal);
    }
  }
  if (combined.size === 1) {
    return [...combined][0] ?? null;
  }
  return null;
}

export function evaluateClarificationPolicy(input: {
  goal: string;
  specifications: PlanningSpecificationEntry[];
  sensitiveBlocked: BlockedReason[];
  userCriteria?: string[];
  clarificationAnswer?: string;
  existingClarification?: TaskClarification;
}): ClarificationEvaluation {
  if (input.sensitiveBlocked.length > 0) {
    return { decision: "SENSITIVE_OR_PROTECTED" };
  }

  const goal = input.goal.trim();
  const userCriteria = input.userCriteria ?? [];

  if (
    input.existingClarification &&
    isClarificationInterviewComplete(input.existingClarification)
  ) {
    return { decision: "CLEAR" };
  }

  const relevantSpecs = input.specifications;

  if (input.clarificationAnswer || input.existingClarification?.answer) {
    const answer = input.clarificationAnswer ?? input.existingClarification?.answer ?? "";
    if (isPasswordResetGoal(goal)) {
      const resolved =
        input.clarificationAnswer?.toLowerCase().includes("prd") ||
        input.clarificationAnswer?.toLowerCase().includes("frd")
          ? inferResetMethodFromSpecs(
              relevantSpecs.filter((spec) => {
                const normalized = normalizeDocumentType(spec.documentType);
                const label = specificationDocumentTypeLabel(spec.documentType).toLowerCase();
                const answerLower = answer.toLowerCase();
                return (
                  answerLower.includes(normalized) ||
                  answerLower.includes(label) ||
                  (normalized === "prd" && answerLower.includes("prd")) ||
                  (normalized === "frd" && answerLower.includes("frd"))
                );
              }),
            )
          : parseClarificationAnswer(answer);
      if (resolved) {
        return {
          decision: "CLEAR",
          inferredCriteria: criteriaFromResetMethod(resolved, goal),
        };
      }
    }
    return { decision: "CLEAR" };
  }

  if (isReadmeGoal(goal) && !isAmbiguousGoal(goal)) {
    return { decision: "CLEAR" };
  }

  if (userCriteria.length > 0 && !isPasswordResetGoal(goal)) {
    return { decision: "CLEAR" };
  }

  if (isPasswordResetGoal(goal)) {
    const conflict = detectSpecConflict(relevantSpecs);
    if (conflict.conflict) {
      const choiceSet = buildSpecConflictChoiceSet({
        question: conflict.question,
        leftLabel: conflict.options[0] ?? "First source",
        rightLabel: conflict.options[1] ?? "Second source",
        leftDescription: `Use ${conflict.options[0] ?? "the first source"} as the authoritative requirement for this task.`,
        rightDescription: `Use ${conflict.options[1] ?? "the second source"} as the authoritative requirement for this task.`,
      });
      return evaluationFromChoiceSet("SPEC_CONFLICT", choiceSet, {
        reason: "Conflicting specification sources for password reset method.",
        conflictSources: conflict.sources,
      });
    }

    const inferred = inferResetMethodFromSpecs(relevantSpecs);
    if (inferred) {
      return {
        decision: "CLEAR",
        inferredCriteria: criteriaFromResetMethod(inferred, goal),
      };
    }

    const resetChoices = buildPasswordResetChoiceSet(relevantSpecs);
    return evaluationFromChoiceSet("MATERIAL_AMBIGUITY", resetChoices, {
      reason: "Password reset method materially affects contract scope and acceptance criteria.",
    });
  }

  if (isAmbiguousGoal(goal) && userCriteria.length === 0) {
    const scopeChoice = buildScopeAmbiguityFreeText(
      "Which exact files or directories may BuildLoop modify to complete this task?",
    );
    return evaluationFromChoiceSet("MATERIAL_AMBIGUITY", scopeChoice, {
      reason: "Goal scope is too broad to derive a safe bounded contract.",
    });
  }

  return { decision: "CLEAR" };
}

export function buildClarificationRecord(input: {
  evaluation: ClarificationEvaluation;
  answer?: string;
  selectedOptionId?: string;
  customAnswer?: string;
  interview?: TaskClarification["interview"];
}): TaskClarification | undefined {
  if (input.interview) {
    const firstQuestion = input.interview.questions[0];
    const now = input.interview.askedAt;
    const completed = isClarificationInterviewComplete({
      reason: firstQuestion?.reason ?? "Material ambiguity detected.",
      askedAt: now,
      interview: input.interview,
    });
    const answeredQuestionIds = new Set(input.interview.answers.map((entry) => entry.questionId));
    const pendingQuestion =
      input.interview.questions.find(
        (question) => question.required && !answeredQuestionIds.has(question.id),
      ) ??
      input.interview.questions.find((question) => !answeredQuestionIds.has(question.id)) ??
      null;
    const displayQuestion = completed ? null : pendingQuestion;
    return {
      reason: (displayQuestion ?? firstQuestion)?.reason ?? "Material ambiguity detected.",
      askedAt: now,
      ...(displayQuestion?.question ? { question: displayQuestion.question } : {}),
      ...(displayQuestion?.presentationMode === "choices"
        ? {
            choiceOptions: displayQuestion.options,
            allowOther: displayQuestion.allowOther,
          }
        : {}),
      interview: input.interview,
      ...(input.interview.answers[0]
        ? {
            answer: input.interview.answers[0].answer,
            answeredAt: input.interview.answers[0].answeredAt,
            ...(input.interview.answers[0].selectedOptionId
              ? { selectedOptionId: input.interview.answers[0].selectedOptionId }
              : {}),
            ...(input.interview.answers[0].customAnswer
              ? { customAnswer: input.interview.answers[0].customAnswer }
              : {}),
          }
        : input.answer
          ? {
              answer: input.answer,
              answeredAt: now,
              ...(input.selectedOptionId ? { selectedOptionId: input.selectedOptionId } : {}),
              ...(input.customAnswer ? { customAnswer: input.customAnswer } : {}),
            }
          : {}),
    };
  }

  if (!input.evaluation.question) {
    return undefined;
  }

  const now = new Date().toISOString();
  const choiceSet = input.evaluation.choiceSet;
  return {
    question: input.evaluation.question,
    ...(input.evaluation.options ? { options: input.evaluation.options } : {}),
    ...(choiceSet?.presentationMode === "choices"
      ? {
          choiceOptions: choiceSet.options,
          allowOther: choiceSet.allowOther,
        }
      : {}),
    reason: input.evaluation.reason ?? "Material ambiguity detected.",
    askedAt: now,
    ...(input.answer
      ? {
          answer: input.answer,
          answeredAt: now,
          ...(input.selectedOptionId ? { selectedOptionId: input.selectedOptionId } : {}),
          ...(input.customAnswer ? { customAnswer: input.customAnswer } : {}),
        }
      : {}),
  };
}

export function mergeUserAndGeneratedCriteria(
  userCriteria: string[] | undefined,
  generatedCriteria: string[],
): string[] {
  if (!userCriteria?.length) {
    return generatedCriteria;
  }
  const merged = [...userCriteria];
  for (const criterion of generatedCriteria) {
    if (!merged.some((existing) => existing.toLowerCase() === criterion.toLowerCase())) {
      merged.push(criterion);
    }
  }
  return merged;
}
