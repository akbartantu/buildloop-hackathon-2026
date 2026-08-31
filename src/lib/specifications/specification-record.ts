export const SPECIFICATION_DOCUMENT_TYPES = [
  "PRD",
  "FRD",
  "BRD",
  "Architecture",
  "API Spec",
  "ADR",
  "Spec Kit",
  "Other",
] as const;

export type SpecificationDocumentType = (typeof SPECIFICATION_DOCUMENT_TYPES)[number];

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
    documentType: row.document_type as SpecificationDocumentType,
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

export function specificationAuthorityLabel(documentType: SpecificationDocumentType): string {
  switch (documentType) {
    case "PRD":
      return "Product requirements";
    case "FRD":
      return "Functional requirements";
    case "BRD":
      return "Business requirements";
    case "Architecture":
      return "Technical constraints";
    case "API Spec":
      return "Interface constraints";
    case "ADR":
      return "Architecture decision";
    case "Spec Kit":
      return "Structured implementation specification";
    default:
      return "Supporting specification";
  }
}
