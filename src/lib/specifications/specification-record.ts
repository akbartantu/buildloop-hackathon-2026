export const SPECIFICATION_DOCUMENT_TYPE_IDS = [
  "prd",
  "frd",
  "brd",
  "business_rules",
  "user_flows",
  "system_architecture",
  "database_schema",
  "api_specification",
  "ui_ux_design",
  "security_specification",
  "testing_strategy",
  "product_roadmap",
  "adr",
  "spec_kit",
  "other",
] as const;

/** Stable persisted identifiers for specification document types. */
export type SpecificationDocumentType = (typeof SPECIFICATION_DOCUMENT_TYPE_IDS)[number];

/** @deprecated Alias for validators — values are stable ids, not display labels. */
export const SPECIFICATION_DOCUMENT_TYPES = SPECIFICATION_DOCUMENT_TYPE_IDS;

export type SpecificationDocumentTypeOption = {
  id: SpecificationDocumentType;
  label: string;
};

export const SPECIFICATION_DOCUMENT_TYPE_OPTIONS: readonly SpecificationDocumentTypeOption[] = [
  { id: "prd", label: "Product Requirements Document (PRD)" },
  { id: "frd", label: "Functional Requirements Document (FRD)" },
  { id: "brd", label: "Business Requirements Document (BRD)" },
  { id: "business_rules", label: "Business Rules" },
  { id: "user_flows", label: "User Flows" },
  { id: "system_architecture", label: "System Architecture" },
  { id: "database_schema", label: "Database Schema" },
  { id: "api_specification", label: "API Specification" },
  { id: "ui_ux_design", label: "UI/UX Design" },
  { id: "security_specification", label: "Security Specification" },
  { id: "testing_strategy", label: "Testing Strategy" },
  { id: "product_roadmap", label: "Product Roadmap" },
  { id: "adr", label: "Architecture Decision Record (ADR)" },
  { id: "spec_kit", label: "Spec Kit" },
  { id: "other", label: "Other" },
] as const;

/** Legacy display values persisted before the taxonomy expansion. */
export const LEGACY_SPECIFICATION_DOCUMENT_TYPE_ALIASES: Record<string, SpecificationDocumentType> = {
  PRD: "prd",
  FRD: "frd",
  BRD: "brd",
  Architecture: "system_architecture",
  "API Spec": "api_specification",
  ADR: "adr",
  "Spec Kit": "spec_kit",
  Other: "other",
};

export function normalizeDocumentType(value: string): SpecificationDocumentType {
  const trimmed = value.trim();
  if (SPECIFICATION_DOCUMENT_TYPE_IDS.includes(trimmed as SpecificationDocumentType)) {
    return trimmed as SpecificationDocumentType;
  }
  const legacy = LEGACY_SPECIFICATION_DOCUMENT_TYPE_ALIASES[trimmed];
  if (legacy) {
    return legacy;
  }
  return "other";
}

export function specificationDocumentTypeLabel(documentType: string): string {
  const normalized = normalizeDocumentType(documentType);
  const option = SPECIFICATION_DOCUMENT_TYPE_OPTIONS.find((entry) => entry.id === normalized);
  return option?.label ?? "Other";
}

export function isSpecKitDocumentType(documentType: string): boolean {
  return normalizeDocumentType(documentType) === "spec_kit";
}

export const SPECIFICATION_PARSE_STATUSES = ["pending", "ready", "failed", "unsupported"] as const;

export type SpecificationParseStatus = (typeof SPECIFICATION_PARSE_STATUSES)[number];

export type SpecificationRecord = {
  id: string;
  projectId: string;
  filename: string;
  originalPath: string | null;
  documentType: SpecificationDocumentType;
  content: string;
  parseStatus: SpecificationParseStatus;
  summary: string | null;
  requirementCount: number | null;
  constraintCount: number | null;
  flowCount: number | null;
  createdAt: string;
  updatedAt: string;
  parsedAt: string | null;
};

export type SpecificationRowShape = {
  id: string;
  project_id: string;
  filename: string;
  original_path: string | null;
  document_type: string;
  content: string;
  parse_status: string;
  summary: string | null;
  requirement_count: number | null;
  constraint_count: number | null;
  flow_count: number | null;
  created_at: string;
  updated_at: string;
  parsed_at: string | null;
};

export function toSpecificationRecord(row: SpecificationRowShape): SpecificationRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    filename: row.filename,
    originalPath: row.original_path,
    documentType: normalizeDocumentType(row.document_type),
    content: row.content,
    parseStatus: row.parse_status as SpecificationParseStatus,
    summary: row.summary,
    requirementCount: row.requirement_count,
    constraintCount: row.constraint_count,
    flowCount: row.flow_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    parsedAt: row.parsed_at,
  };
}

/** Planning metadata label — not the full document-type display name. */
export function specificationAuthorityLabel(documentType: string): string {
  switch (normalizeDocumentType(documentType)) {
    case "prd":
      return "Product requirements";
    case "frd":
      return "Functional requirements";
    case "brd":
      return "Business requirements";
    case "business_rules":
      return "Business rules";
    case "user_flows":
      return "User flows";
    case "system_architecture":
      return "Technical constraints";
    case "database_schema":
      return "Data model constraints";
    case "api_specification":
      return "Interface constraints";
    case "ui_ux_design":
      return "UX constraints";
    case "security_specification":
      return "Security constraints";
    case "testing_strategy":
      return "Testing constraints";
    case "product_roadmap":
      return "Roadmap context";
    case "adr":
      return "Architecture decision";
    case "spec_kit":
      return "Structured implementation specification";
    default:
      return "Supporting specification";
  }
}
