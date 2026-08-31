import { describe, expect, test } from "bun:test";

import {
  buildPasswordResetChoiceSet,
  buildScopeAmbiguityFreeText,
  CLARIFICATION_OTHER_OPTION_ID,
  dedupeClarificationOptions,
  normalizeChoiceSet,
  resolveClarificationAnswer,
} from "@/lib/planning/clarification-options";
import {
  clarificationValidationMessageKey,
  resolveClarificationSubmission,
} from "@/components/site/clarification-gate";
import {
  buildClarificationRecord,
  evaluateClarificationPolicy,
} from "@/lib/planning/clarification-policy";
import { analyzeTaskGoal } from "@/lib/task-planning";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

describe("clarification options", () => {
  test("bounded password-reset clarification renders multiple-choice options", () => {
    const choiceSet = buildPasswordResetChoiceSet([]);
    expect(choiceSet.presentationMode).toBe("choices");
    expect(choiceSet.options.length).toBeGreaterThanOrEqual(2);
    expect(choiceSet.allowOther).toBe(true);
  });

  test("recommended badge metadata exists only when a reason is provided", () => {
    const choiceSet = buildPasswordResetChoiceSet([]);
    const recommended = choiceSet.options.filter((option) => option.recommended);
    expect(recommended.length).toBeLessThanOrEqual(1);
    for (const option of recommended) {
      expect(option.recommendationReason?.length).toBeGreaterThan(0);
    }
  });

  test("single generated option falls back to free text", () => {
    const normalized = normalizeChoiceSet({
      question: "Pick one?",
      allowOther: true,
      presentationMode: "choices",
      options: [{ id: "only", label: "Only option", description: "Not enough choices." }],
    });
    expect(normalized.presentationMode).toBe("free_text");
    expect(normalized.options).toHaveLength(0);
  });

  test("duplicate option labels are de-duplicated safely", () => {
    const deduped = dedupeClarificationOptions([
      { id: "a", label: "Email link", description: "One" },
      { id: "b", label: "email link", description: "Duplicate" },
      { id: "c", label: "OTP", description: "Two" },
    ]);
    expect(deduped).toHaveLength(2);
  });

  test("open-ended scope ambiguity falls back to free text", () => {
    const choiceSet = buildScopeAmbiguityFreeText("Which files may change?");
    expect(choiceSet.presentationMode).toBe("free_text");
    expect(choiceSet.options).toHaveLength(0);
  });
});

describe("clarification submission resolution", () => {
  const options = buildPasswordResetChoiceSet([]).options;

  test("predefined option resolves without textarea input", () => {
    const resolved = resolveClarificationSubmission({
      presentationMode: "choices",
      choiceOptions: options,
      selectedOptionId: options[0]!.id,
      customAnswer: "",
    });
    expect(resolved.answer).toBe(options[0]!.label);
    expect(resolved.customAnswer).toBeUndefined();
  });

  test("Other requires non-empty custom answer", () => {
    expect(
      clarificationValidationMessageKey({
        presentationMode: "choices",
        choiceOptions: options,
        selectedOptionId: CLARIFICATION_OTHER_OPTION_ID,
        customAnswer: "   ",
      }),
    ).toBe("tasks.clarificationOtherRequired");

    const resolved = resolveClarificationSubmission({
      presentationMode: "choices",
      choiceOptions: options,
      selectedOptionId: CLARIFICATION_OTHER_OPTION_ID,
      customAnswer: "Use admin-assisted reset",
    });
    expect(resolved.answer).toBe("Use admin-assisted reset");
  });

  test("switching from Other to predefined ignores custom text", () => {
    const resolved = resolveClarificationSubmission({
      presentationMode: "choices",
      choiceOptions: options,
      selectedOptionId: options[1]!.id,
      customAnswer: "stale custom text",
    });
    expect(resolved.answer).toBe(options[1]!.label);
    expect(resolved.answer).not.toContain("stale");
  });

  test("no option is silently auto-selected", () => {
    expect(
      resolveClarificationSubmission({
        presentationMode: "choices",
        choiceOptions: options,
        selectedOptionId: null,
        customAnswer: "",
      }).answer,
    ).toBe("");
  });

  test("free-text clarification accepts direct answer", () => {
    const resolved = resolveClarificationSubmission({
      presentationMode: "free_text",
      selectedOptionId: null,
      customAnswer: "Only modify src/routes/auth.tsx",
    });
    expect(resolved.answer).toBe("Only modify src/routes/auth.tsx");
  });
});

describe("clarification policy integration", () => {
  test("selected option becomes resolved clarification answer", () => {
    const answer = resolveClarificationAnswer({
      options: buildPasswordResetChoiceSet([]).options,
      selectedOptionId: "email-link",
      customAnswer: "",
    });
    const evaluation = evaluateClarificationPolicy({
      goal: "Add forgot password flow.",
      specifications: [],
      sensitiveBlocked: [],
      clarificationAnswer: answer,
    });
    expect(evaluation.decision).toBe("CLEAR");
    expect(evaluation.inferredCriteria?.some((item) => /email link/i.test(item))).toBe(true);
  });

  test("custom Other answer becomes resolved clarification answer", () => {
    const evaluation = evaluateClarificationPolicy({
      goal: "Add forgot password flow.",
      specifications: [],
      sensitiveBlocked: [],
      clarificationAnswer: "Use admin-assisted reset only",
    });
    expect(evaluation.decision).toBe("CLEAR");
  });

  test("ambiguous scope uses free-text presentation mode", () => {
    const evaluation = evaluateClarificationPolicy({
      goal: "Improve the product experience across the repository.",
      specifications: [],
      sensitiveBlocked: [],
    });
    expect(evaluation.decision).toBe("MATERIAL_AMBIGUITY");
    expect(evaluation.choiceSet?.presentationMode).toBe("free_text");
  });

  test("contract record stores resolved clarification answer", () => {
    const evaluation = evaluateClarificationPolicy({
      goal: "Add forgot password flow.",
      specifications: [],
      sensitiveBlocked: [],
    });
    const record = buildClarificationRecord({
      evaluation,
      answer: "Email link",
      selectedOptionId: "email-link",
    });
    expect(record?.answer).toBe("Email link");
    expect(record?.choiceOptions?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("analyzeTaskGoal clarification presentation", () => {
  test("existing task creation without clarification still works", async () => {
    const analysis = await analyzeTaskGoal({
      goal: "Update README subtitle to mention governed autonomous software delivery.",
      taskId: "preview-readme",
      workspaceRoot,
      acceptanceCriteria: ["Only README.md is modified."],
    });
    expect(analysis.needsClarification).toBe(false);
    expect(analysis.suggestedFromGoal).toBe(false);
  });

  test("open-ended analyzeTaskGoal exposes free-text clarification mode", async () => {
    const analysis = await analyzeTaskGoal({
      goal: "Improve the product experience across the repository.",
      taskId: "preview-ambiguous",
      workspaceRoot,
      specifications: [],
    });
    expect(analysis.needsClarification).toBe(true);
    expect(analysis.clarificationPresentationMode).toBe("free_text");
  });
});

describe("task form clarification wiring", () => {
  test("task form uses guided clarification gate component", async () => {
    const source = await Bun.file(
      new URL("../../components/site/pages/task-form-page.tsx", import.meta.url),
    ).text();
    expect(source).toContain("ClarificationInterview");
    expect(source).toContain("ClarificationGate");
    expect(source).toContain("resolveClarificationSubmission");
    expect(source).toContain("selectedClarificationOptionId");
    expect(source).toContain("clarificationCustomAnswer");
  });

  test("i18n clarification keys exist in EN and ID without mixed-language regression", () => {
    const { translate } = require("@/i18n") as typeof import("@/i18n");
    expect(translate("en", "tasks.clarificationIntro")).toContain("BuildLoop found decisions");
    expect(translate("id", "tasks.clarificationIntro")).toContain("BuildLoop menemukan keputusan");
    expect(translate("en", "tasks.clarificationOtherOption")).toBe("Other");
    expect(translate("id", "tasks.clarificationOtherOption")).toBe("Lainnya");
  });
});
