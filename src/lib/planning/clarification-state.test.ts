import { describe, expect, test } from "bun:test";

import {
  getResolvedClarificationDecisions,
  hasUnresolvedClarification,
  isClarificationInterviewComplete,
  mergePersistedInterviewQuestions,
  reconcileInterviewEvaluation,
  validatePersistedClarificationState,
} from "@/lib/planning/clarification-state";
import {
  buildInterviewClarificationRecord,
  generateClarificationInterview,
  resolveInterviewAnswers,
} from "@/lib/planning/clarification-interview";
import type { TaskClarification } from "@/lib/planning/planning-source";

const CLEVIA_GOAL =
  "CLEVIA-001 — Initialize the Clevia frontend foundation and responsive dashboard shell using mock data only.";

const CLEVIA_CLARIFICATION_ANSWERS = [
  {
    questionId: "nav-placeholder-behavior",
    selectedOptionId: "visible-disabled",
  },
  {
    questionId: "ui-visual-direction",
    selectedOptionId: "soft-neutral",
  },
] as const;

describe("clarification state reconciliation", () => {
  test("completed interview is not unresolved even when legacy question existed historically", () => {
    const interview = generateClarificationInterview({
      goal: CLEVIA_GOAL,
      specifications: [],
    });
    const answers = resolveInterviewAnswers(interview.questions, [...CLEVIA_CLARIFICATION_ANSWERS]);
    const clarification = buildInterviewClarificationRecord({
      evaluation: interview,
      answers,
    })!;

    expect(isClarificationInterviewComplete(clarification)).toBe(true);
    expect(hasUnresolvedClarification(clarification)).toBe(false);
    expect(clarification.question).toBeUndefined();
    expect(getResolvedClarificationDecisions(clarification).length).toBeGreaterThan(0);
  });

  test("legacy-only unresolved clarification remains unresolved", () => {
    const clarification: TaskClarification = {
      question: "Which exact files or directories may BuildLoop modify to complete this task?",
      askedAt: new Date().toISOString(),
      reason: "Goal scope is too broad to derive a safe bounded contract.",
    };
    expect(hasUnresolvedClarification(clarification)).toBe(true);
  });

  test("mergePersistedInterviewQuestions keeps answered question definitions for replan", () => {
    const generated = generateClarificationInterview({
      goal: CLEVIA_GOAL,
      specifications: [],
      skipDomainQuestions: true,
    });
    const persisted = generateClarificationInterview({
      goal: CLEVIA_GOAL,
      specifications: [],
    }).questions;

    const merged = mergePersistedInterviewQuestions(generated.questions, persisted);
    expect(merged.some((question) => question.id === "nav-placeholder-behavior")).toBe(true);
  });

  test("answered nav question is not shown as unresolved legacy prompt", () => {
    const interview = generateClarificationInterview({
      goal: CLEVIA_GOAL,
      specifications: [],
    });
    const navOnlyAnswers = resolveInterviewAnswers(interview.questions, [
      { questionId: "nav-placeholder-behavior", selectedOptionId: "visible-disabled" },
    ]);
    const clarification = buildInterviewClarificationRecord({
      evaluation: interview,
      answers: navOnlyAnswers,
    })!;

    expect(hasUnresolvedClarification(clarification)).toBe(true);
    expect(clarification.question).not.toContain("navigation items for modules not implemented");
    expect(clarification.question).toContain("visual direction");
  });

  test("reconcileInterviewEvaluation restores persisted interview when criteria suppress regeneration", () => {
    const generated = generateClarificationInterview({
      goal: CLEVIA_GOAL,
      specifications: [],
      userCriteria: [
        "Audits, Content Calendar, Business Profile, Settings, and other unimplemented navigation items remain visible but disabled and do not navigate to placeholder functionality.",
        "Initial UI uses soft neutral tones with subtle accents.",
      ],
    });
    expect(generated.mode).toBe("none");

    const persisted = generateClarificationInterview({
      goal: CLEVIA_GOAL,
      specifications: [],
    });
    const answers = resolveInterviewAnswers(persisted.questions, [...CLEVIA_CLARIFICATION_ANSWERS]);
    const clarification = buildInterviewClarificationRecord({
      evaluation: persisted,
      answers,
    })!;

    const reconciled = reconcileInterviewEvaluation(generated, clarification.interview);
    expect(reconciled.mode).toBe("required");
    expect(reconciled.questions.some((question) => question.id === "nav-placeholder-behavior")).toBe(true);
  });

  test("validatePersistedClarificationState rejects visible-disabled answer missing from criteria", () => {
    const interview = generateClarificationInterview({
      goal: CLEVIA_GOAL,
      specifications: [],
    });
    const answers = resolveInterviewAnswers(interview.questions, [...CLEVIA_CLARIFICATION_ANSWERS]);
    const clarification = buildInterviewClarificationRecord({
      evaluation: interview,
      answers,
    })!;

    const result = validatePersistedClarificationState({
      clarification,
      acceptanceCriteria: ["Responsive shell, navigation, and dashboard use mock data only."],
    });
    expect(result.ok).toBe(false);
  });
});
