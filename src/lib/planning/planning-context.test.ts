import { describe, expect, test } from "bun:test";

import { selectRelevantSpecifications } from "@/lib/planning/planning-context";
import type { PlanningSpecificationEntry } from "@/lib/specifications/specification-set-record";
import { validateSpecificationUpload } from "@/lib/specifications/specification-upload";

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
    parseStatus: "ready",
    summary: null,
    setId: input.setId ?? null,
    setName: input.setName ?? null,
    fileRole: input.fileRole ?? null,
    sortOrder: input.sortOrder ?? null,
  };
}

describe("planning context selection", () => {
  test("selects auth-related specifications for forgot password goal", () => {
    const selected = selectRelevantSpecifications("Add forgot password flow.", [
      spec({
        filename: "PRD.md",
        documentType: "PRD",
        content: "Authentication uses Supabase. Password reset via email link.",
      }),
      spec({
        id: "00000000-0000-4000-8000-000000000099",
        filename: "Billing.md",
        documentType: "BRD",
        content: "Invoice export requirements only.",
      }),
    ]);
    expect(selected.some((item) => item.filename === "PRD.md")).toBe(true);
    expect(selected.some((item) => item.filename === "Billing.md")).toBe(false);
  });
});

describe("specification upload validation", () => {
  test("accepts markdown uploads", () => {
    const result = validateSpecificationUpload({
      filename: "PRD.md",
      content: "# Product requirements",
    });
    expect(result.ok).toBe(true);
  });

  test("rejects unsupported formats", () => {
    const result = validateSpecificationUpload({
      filename: "spec.pdf",
      content: "%PDF",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Unsupported format");
    }
  });

  test("rejects path traversal filenames", () => {
    const result = validateSpecificationUpload({
      filename: "../secrets.env",
      content: "noop",
    });
    expect(result.ok).toBe(false);
  });
});
