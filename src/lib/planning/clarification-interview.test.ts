import { describe, expect, test } from "bun:test";

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyAdaptiveQuestionFilter,
  criteriaFromClarificationAnswers,
  generateClarificationInterview,
  interviewNeedsClarification,
  MAX_CLARIFICATION_QUESTIONS,
  resolveInterviewAnswers,
  validateClarificationContractConsistency,
} from "@/lib/planning/clarification-interview";
import { analyzeTaskGoal, planAndEvaluateTask } from "@/lib/task-planning";
import { evaluateProtectedPathPolicy } from "@/lib/contract-governance";
import { applyDraftUpdate } from "@/lib/tasks/task-mutations";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import { documentToPlanningEntry } from "@/lib/specifications/specification-planning";

const CLEVIA_GOAL =
  "CLEVIA-001 — Initialize the Clevia frontend foundation and responsive dashboard shell using mock data only.";

const CLEVIA_PRD = documentToPlanningEntry({
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000099",
  projectId: "00000000-0000-4000-8000-000000000010",
  filename: "PRD.md",
  originalPath: null,
  documentType: "prd",
  content: "Clevia uses Next.js and TypeScript for the frontend. Dashboard uses mock data only.",
  parseStatus: "ready",
  summary: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const workspaceRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

describe("adaptive clarification interview", () => {
  test("clear goal with evidence returns zero questions", async () => {
    const analysis = await analyzeTaskGoal({
      goal: "Update README subtitle to mention governed autonomous software delivery.",
      taskId: "preview-readme",
      workspaceRoot,
      acceptanceCriteria: ["Only README.md is modified."],
    });
    expect(analysis.needsClarification).toBe(false);
    expect(analysis.clarificationQuestions ?? []).toHaveLength(0);
  });

  test("FocusPad goal generates a required business-logic question", () => {
    const interview = generateClarificationInterview({
      goal: "FOCUS-001 — Add a 15-minute Long Break after every four completed Focus sessions.",
      specifications: [],
    });
    expect(interview.mode).toBe("required");
    expect(interview.questions.some((question) => question.id === "focus-session-cycle")).toBe(true);
  });

  test("Clevia dashboard goal generates navigation placeholder question", () => {
    const interview = generateClarificationInterview({
      goal: "CLEVIA-001 — Initialize the Clevia frontend foundation and responsive dashboard shell using mock data only.",
      specifications: [],
    });
    expect(interview.questions.some((question) => question.id === "nav-placeholder-behavior")).toBe(true);
  });

  test("PRD resolving nav behavior suppresses redundant navigation question", () => {
    const interview = generateClarificationInterview({
      goal: "CLEVIA-001 — Initialize the Clevia frontend foundation and responsive dashboard shell using mock data only.",
      specifications: [
        {
          id: "spec-1",
          filename: "PRD.md",
          path: null,
          documentType: "prd",
          content: "Unimplemented navigation items remain visible but disabled.",
          setName: null,
          fileRole: null,
        },
      ],
    });
    expect(interview.questions.some((question) => question.id === "nav-placeholder-behavior")).toBe(false);
  });

  test("question count is capped at five", () => {
    const interview = generateClarificationInterview({
      goal: "FOCUS-001 — Add a 15-minute Long Break after every four completed Focus sessions. Initialize the Clevia frontend foundation and responsive dashboard shell using mock data only.",
      specifications: [],
    });
    expect(interview.questions.length).toBeLessThanOrEqual(MAX_CLARIFICATION_QUESTIONS);
  });

  test("Clevia visible-disabled answer produces explicit nav behavior criterion", () => {
    const interview = generateClarificationInterview({
      goal: CLEVIA_GOAL,
      specifications: [],
    });
    const answers = resolveInterviewAnswers(interview.questions, [
      {
        questionId: "nav-placeholder-behavior",
        selectedOptionId: "visible-disabled",
      },
    ]);
    const criteria = criteriaFromClarificationAnswers(interview.questions, answers);
    expect(
      criteria.some((item) =>
        /Audits, Content Calendar, Business Profile, Settings.*visible but disabled/i.test(item),
      ),
    ).toBe(true);
  });

  test("contract consistency rejects generic-only criteria after visible-disabled decision", () => {
    const interview = generateClarificationInterview({
      goal: CLEVIA_GOAL,
      specifications: [],
    });
    const answers = resolveInterviewAnswers(interview.questions, [
      {
        questionId: "nav-placeholder-behavior",
        selectedOptionId: "visible-disabled",
      },
    ]);
    const result = validateClarificationContractConsistency({
      acceptanceCriteria: ["Responsive shell, navigation, and dashboard use mock data only."],
      questions: interview.questions,
      answers,
    });
    expect(result.ok).toBe(false);
  });

  test("FocusPad custom answer is persisted and converted into acceptance criteria", () => {
    const interview = generateClarificationInterview({
      goal: "FOCUS-001 — Add a 15-minute Long Break after every four completed Focus sessions.",
      specifications: [],
    });
    const answers = resolveInterviewAnswers(interview.questions, [
      {
        questionId: "focus-session-cycle",
        selectedOptionId: "other",
        customAnswer: "Pause the cycle until the user returns to Focus mode.",
      },
    ]);
    const criteria = criteriaFromClarificationAnswers(interview.questions, answers);
    expect(criteria.some((item) => /Pause the cycle/i.test(item))).toBe(true);
  });

  test("FocusPad ignore-manual decision maps to deterministic criterion", () => {
    const interview = generateClarificationInterview({
      goal: "FOCUS-001 — Add a 15-minute Long Break after every four completed Focus sessions.",
      specifications: [],
    });
    const answers = resolveInterviewAnswers(interview.questions, [
      {
        questionId: "focus-session-cycle",
        selectedOptionId: "ignore-manual",
      },
    ]);
    const criteria = criteriaFromClarificationAnswers(interview.questions, answers);
    expect(criteria.some((item) => /manual switching does not count/i.test(item))).toBe(true);
  });

  test("back navigation preserves earlier answers through adaptive filtering", () => {
    const interview = generateClarificationInterview({
      goal: "FOCUS-001 — Add a 15-minute Long Break after every four completed Focus sessions. CLEVIA-001 dashboard shell.",
      specifications: [],
    });
    const firstAnswer = {
      questionId: interview.questions[0]!.id,
      selectedOptionId: interview.questions[0]!.options[0]!.id,
    };
    const remaining = applyAdaptiveQuestionFilter(interview.questions, [firstAnswer]);
    expect(remaining.some((question) => question.id === firstAnswer.questionId)).toBe(false);
    expect(remaining.length).toBe(interview.questions.length - 1);
  });

  test("required clarification blocks completion until answered", () => {
    const interview = generateClarificationInterview({
      goal: "FOCUS-001 — Add a 15-minute Long Break after every four completed Focus sessions.",
      specifications: [],
    });
    expect(
      interviewNeedsClarification({
        evaluation: interview,
        answers: [],
      }),
    ).toBe(true);
  });

  test("contract consistency rejects contradictory navigation criteria", () => {
    const interview = generateClarificationInterview({
      goal: "CLEVIA-001 — Initialize the Clevia frontend foundation and responsive dashboard shell using mock data only.",
      specifications: [],
    });
    const answers = resolveInterviewAnswers(interview.questions, [
      {
        questionId: "nav-placeholder-behavior",
        selectedOptionId: "hidden",
      },
    ]);
    const result = validateClarificationContractConsistency({
      acceptanceCriteria: ["All navigation items remain visible in the sidebar."],
      questions: interview.questions,
      answers,
    });
    expect(result.ok).toBe(false);
  });

  test("planning clarification answer is not treated as protected-path approval", () => {
    const decision = evaluateProtectedPathPolicy({
      changedFiles: ["package.json"],
      protectedPaths: ["package.json"],
      approvalRequiredPaths: ["package.json"],
      approvedProtectedPaths: [],
    });
    expect(decision.decision).toBe("REQUIRES_PROTECTED_PATH_APPROVAL");
  });

  test("draft update preserves the same task id with clarification answers", async () => {
    const repo = createDevTaskRepository();
    const created = await repo.createTask({
      userId: "00000000-0000-4000-8000-000000000001",
      goal: "FOCUS-001 — Add a 15-minute Long Break after every four completed Focus sessions.",
      acceptanceCriteria: ["Long break appears after four completed focus sessions."],
    });
    const { task } = await applyDraftUpdate(
      created as never,
      {
        goal: created.goal,
        acceptanceCriteria: created.contract.acceptanceCriteria,
        clarificationAnswers: [
          {
            questionId: "focus-session-cycle",
            selectedOptionId: "ignore-manual",
          },
        ],
      },
      {},
      { incrementVersion: false },
    );
    expect(task.id).toBe(created.id);
    expect(task.contract.clarification?.interview?.answers.length).toBeGreaterThan(0);
  });
});

describe("analyzeTaskGoal interview integration", () => {
  test("completed interview regenerates suggested acceptance criteria", async () => {
    const analysis = await analyzeTaskGoal({
      goal: CLEVIA_GOAL,
      taskId: "preview-clevia",
      workspaceRoot,
      acceptanceCriteria: ["Dashboard shell renders with mock navigation data."],
      specifications: [
        {
          id: "spec-ui",
          filename: "PRD.md",
          path: null,
          documentType: "prd",
          content: "Use a light minimal interface with soft neutral accents.",
          setName: null,
          fileRole: null,
        },
      ],
      clarificationAnswers: [
        {
          questionId: "nav-placeholder-behavior",
          selectedOptionId: "visible-disabled",
        },
      ],
    });
    expect(analysis.clarificationQuestions ?? []).toHaveLength(0);
    expect(
      analysis.acceptanceCriteria.some((item) => /visible but disabled/i.test(item)),
    ).toBe(true);
    expect(analysis.clarificationDecisions?.length).toBeGreaterThan(0);
  });

  test("planAndEvaluateTask contract preserves Clevia clarification criterion", async () => {
    const planned = await planAndEvaluateTask({
      goal: CLEVIA_GOAL,
      taskId: "00000000-0000-4000-8000-000000000040",
      workspaceRoot,
      repositoryRoot: null,
      specifications: [CLEVIA_PRD],
      sourceCommitSha: "a10183eb66a20fa0df619233b3e85231d2c193d9",
      acceptanceCriteria: ["Dashboard shell renders with mock navigation data."],
      clarificationAnswers: [
        {
          questionId: "nav-placeholder-behavior",
          selectedOptionId: "visible-disabled",
        },
      ],
    });

    expect(
      planned.contract.acceptanceCriteria.some((item) => /visible but disabled/i.test(item)),
    ).toBe(true);
    expect(
      planned.contract.acceptanceCriteria.some((item) =>
        /Responsive shell, navigation, and dashboard/i.test(item),
      ),
    ).toBe(true);
    expect(planned.contract.acceptanceCriteria).toContain(
      "Dashboard shell renders with mock navigation data.",
    );
  });

  test("replanning preserves persisted clarification answers without resubmitting them", async () => {
    const first = await planAndEvaluateTask({
      goal: CLEVIA_GOAL,
      taskId: "00000000-0000-4000-8000-000000000041",
      workspaceRoot,
      repositoryRoot: null,
      specifications: [CLEVIA_PRD],
      sourceCommitSha: "a10183eb66a20fa0df619233b3e85231d2c193d9",
      clarificationAnswers: [
        {
          questionId: "nav-placeholder-behavior",
          selectedOptionId: "visible-disabled",
        },
      ],
    });

    const replanned = await planAndEvaluateTask({
      goal: CLEVIA_GOAL,
      taskId: "00000000-0000-4000-8000-000000000041",
      workspaceRoot,
      repositoryRoot: null,
      specifications: [CLEVIA_PRD],
      sourceCommitSha: "a10183eb66a20fa0df619233b3e85231d2c193d9",
      acceptanceCriteria: first.contract.acceptanceCriteria,
      existingClarification: first.contract.clarification,
      contractVersion: 2,
    });

    expect(
      replanned.contract.acceptanceCriteria.some((item) => /visible but disabled/i.test(item)),
    ).toBe(true);
  });

  test("EN and ID interview strings render", () => {
    const { translate } = require("@/i18n") as typeof import("@/i18n");
    expect(translate("en", "tasks.clarificationAnswerQuestions")).toBe("Answer questions");
    expect(translate("id", "tasks.clarificationAnswerQuestions")).toBe("Jawab pertanyaan");
    expect(translate("en", "tasks.clarificationQuestionProgress", { current: 2, total: 4 })).toContain("2");
  });
});
