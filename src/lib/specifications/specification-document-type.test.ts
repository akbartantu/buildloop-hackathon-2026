import { describe, expect, test } from "bun:test";

import {
  LEGACY_SPECIFICATION_DOCUMENT_TYPE_ALIASES,
  SPECIFICATION_DOCUMENT_TYPE_IDS,
  SPECIFICATION_DOCUMENT_TYPE_OPTIONS,
  normalizeDocumentType,
  specificationDocumentTypeLabel,
  toPersistedDocumentType,
  toSpecificationRecord,
} from "@/lib/specifications/specification-record";
import { validateSpecificationUpload, inferDocumentType } from "@/lib/specifications/specification-upload";
import { documentToPlanningEntry } from "@/lib/specifications/specification-planning";

describe("specification document type taxonomy", () => {
  test("dropdown options use exact labels in canonical order", () => {
    expect(SPECIFICATION_DOCUMENT_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      "Product Requirements Document (PRD)",
      "Functional Requirements Document (FRD)",
      "Business Requirements Document (BRD)",
      "Business Rules",
      "User Flows",
      "System Architecture",
      "Database Schema",
      "API Specification",
      "UI/UX Design",
      "Security Specification",
      "Testing Strategy",
      "Product Roadmap",
      "Architecture Decision Record (ADR)",
      "Spec Kit",
      "Other",
    ]);
    expect(SPECIFICATION_DOCUMENT_TYPE_OPTIONS.map((option) => option.id)).toEqual([
      ...SPECIFICATION_DOCUMENT_TYPE_IDS,
    ]);
  });

  test("taxonomy has 15 unique options including Other", () => {
    const ids = SPECIFICATION_DOCUMENT_TYPE_OPTIONS.map((option) => option.id);
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
    expect(ids.at(-1)).toBe("other");
  });

  test("legacy persisted values normalize to stable ids", () => {
    for (const [legacy, canonical] of Object.entries(LEGACY_SPECIFICATION_DOCUMENT_TYPE_ALIASES)) {
      expect(normalizeDocumentType(legacy)).toBe(canonical);
      expect(specificationDocumentTypeLabel(legacy)).toBe(
        SPECIFICATION_DOCUMENT_TYPE_OPTIONS.find((option) => option.id === canonical)?.label,
      );
    }
  });

  test("new categories render with full labels", () => {
    expect(specificationDocumentTypeLabel("business_rules")).toBe("Business Rules");
    expect(specificationDocumentTypeLabel("system_architecture")).toBe("System Architecture");
    expect(specificationDocumentTypeLabel("api_specification")).toBe("API Specification");
  });

  test("legacy upload request types remain compatible", () => {
    const validated = validateSpecificationUpload({
      filename: "architecture.md",
      documentType: "Architecture",
      content: "# System overview",
    });
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.documentType).toBe("system_architecture");
    }
  });

  test("stored legacy rows load with updated labels through planning entry", () => {
    const record = toSpecificationRecord({
      id: "00000000-0000-4000-8000-000000000001",
      project_id: "00000000-0000-4000-8000-000000000010",
      filename: "API-Spec.md",
      original_path: null,
      document_type: "API Spec",
      content: "OpenAPI definitions",
      parse_status: "ready",
      summary: null,
      requirement_count: null,
      constraint_count: null,
      flow_count: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parsed_at: null,
    });

    expect(record.documentType).toBe("api_specification");
    expect(specificationDocumentTypeLabel(record.documentType)).toBe("API Specification");
    expect(documentToPlanningEntry(record).content).toContain("OpenAPI");
  });

  test("filename inference maps common names to canonical ids", () => {
    expect(inferDocumentType("PRD.md", "")).toBe("prd");
    expect(inferDocumentType("system-architecture.md", "")).toBe("system_architecture");
    expect(inferDocumentType("testing-strategy.md", "")).toBe("testing_strategy");
  });

  test("canonical document types map to production schema values on persist", () => {
    expect(toPersistedDocumentType("prd")).toBe("PRD");
    expect(toPersistedDocumentType("system_architecture")).toBe("Architecture");
    expect(toPersistedDocumentType("api_specification")).toBe("API Spec");
    expect(toPersistedDocumentType("spec_kit")).toBe("Spec Kit");
    expect(toPersistedDocumentType("business_rules")).toBe("Other");
  });
});
