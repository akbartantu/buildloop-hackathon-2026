import { describe, expect, test } from "bun:test";

import {
  evaluateClarificationPolicy,
  mergeUserAndGeneratedCriteria,
} from "@/lib/planning/clarification-policy";
import type { PlanningSpecificationEntry } from "@/lib/specifications/specification-set-record";

function spec(
  input: Partial<PlanningSpecificationEntry> &
    Pick<PlanningSpecificationEntry, "filename" | "documentType" | "content">,
): PlanningSpecificationEntry {
  return {
    id: input.id ?? "00000000-0000-4000-8000-000000000001",
    projectId: input.projectId ?? "00000000-0000-4000-8000-000000000010",
    filename: input.filename,
    path: input.path ?? input.filename,
    documentType: input.documentType,
    content: input.content,
    parseStatus: input.parseStatus ?? "ready",
    summary: input.summary ?? null,
    setId: input.setId ?? null,
    setName: input.setName ?? null,
    fileRole: input.fileRole ?? null,
    sortOrder: input.sortOrder ?? null,
  };
}

describe("clarification policy", () => {
  test("clear README task does not require clarification", () => {
    const evaluation = evaluateClarificationPolicy({
      goal: "Update README subtitle.",
      specifications: [],
      sensitiveBlocked: [],
    });
    expect(evaluation.decision).toBe("CLEAR");
  });

  test("forgot-password with clear PRD email link does not require clarification", () => {
    const evaluation = evaluateClarificationPolicy({
      goal: "Add forgot password flow.",
      specifications: [
        spec({
          filename: "PRD.md",
          documentType: "PRD",
          content:
            "# Authentication\nUse Supabase auth.\nPassword reset uses a secure email link sent to the user.",
        }),
      ],
      sensitiveBlocked: [],
    });
    expect(evaluation.decision).toBe("CLEAR");
    expect(evaluation.inferredCriteria?.some((item) => /email link/i.test(item))).toBe(true);
  });

  test("forgot-password without decision context asks one targeted question", () => {
    const evaluation = evaluateClarificationPolicy({
      goal: "Add forgot password flow.",
      specifications: [],
      sensitiveBlocked: [],
    });
    expect(evaluation.decision).toBe("MATERIAL_AMBIGUITY");
    expect(evaluation.question).toContain("reset their password");
    expect(evaluation.options).toEqual(["Email link", "OTP verification"]);
    expect(evaluation.choiceSet?.presentationMode).toBe("choices");
  });

  test("answer supplied clears material ambiguity", () => {
    const evaluation = evaluateClarificationPolicy({
      goal: "Add forgot password flow.",
      specifications: [],
      sensitiveBlocked: [],
      clarificationAnswer: "Email link",
    });
    expect(evaluation.decision).toBe("CLEAR");
    expect(evaluation.inferredCriteria?.some((item) => /email link/i.test(item))).toBe(true);
  });

  test("sensitive task stops at governance, not normal clarification", () => {
    const evaluation = evaluateClarificationPolicy({
      goal: "Update .env with new API keys.",
      specifications: [],
      sensitiveBlocked: [{ code: "ENV_FILE", message: "Protected env file" }],
    });
    expect(evaluation.decision).toBe("SENSITIVE_OR_PROTECTED");
    expect(evaluation.question).toBeUndefined();
  });

  test("conflicting PRD and FRD requires clarification", () => {
    const evaluation = evaluateClarificationPolicy({
      goal: "Add forgot password flow.",
      specifications: [
        spec({
          id: "00000000-0000-4000-8000-000000000002",
          filename: "PRD.md",
          documentType: "PRD",
          content: "Password reset uses email link.",
        }),
        spec({
          id: "00000000-0000-4000-8000-000000000003",
          filename: "FRD.md",
          documentType: "FRD",
          content: "Password recovery uses OTP verification code.",
        }),
      ],
      sensitiveBlocked: [],
    });
    expect(evaluation.decision).toBe("SPEC_CONFLICT");
    expect(evaluation.question).toContain("authoritative");
  });

  test("user criteria are preserved when supplementing generated criteria", () => {
    const merged = mergeUserAndGeneratedCriteria(
      ["Only README.md is modified."],
      ["Relevant checks pass.", "No protected paths are modified."],
    );
    expect(merged[0]).toBe("Only README.md is modified.");
    expect(merged).toContain("Relevant checks pass.");
  });
});
