import type {
  SpecificationDocumentType,
  SpecificationParseStatus,
  SpecificationRecord,
} from "./specification-record";
import { normalizeDocumentType } from "./specification-record";

export const SPECIFICATION_SET_FILE_ROLES = [
  "constitution",
  "spec",
  "plan",
  "tasks",
  "other",
] as const;

export type SpecificationSetFileRole = (typeof SPECIFICATION_SET_FILE_ROLES)[number];

/** Canonical Spec Kit member ordering when roles are recognized. */
export const SPEC_KIT_ROLE_SORT_ORDER: Record<SpecificationSetFileRole, number> = {
  constitution: 0,
  spec: 1,
  plan: 2,
  tasks: 3,
  other: 99,
};

export type SpecificationSetFileRecord = {
  id: string;
  setId: string;
  filename: string;
  relativePath: string;
  fileRole: SpecificationSetFileRole;
  sortOrder: number;
  content: string;
  parseStatus: SpecificationParseStatus;
  summary: string | null;
  requirementCount: number | null;
  constraintCount: number | null;
  flowCount: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SpecificationSetRecord = {
  id: string;
  projectId: string;
  name: string;
  documentType: SpecificationDocumentType;
  parseStatus: SpecificationParseStatus;
  summary: string | null;
  requirementCount: number | null;
  constraintCount: number | null;
  flowCount: number | null;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SpecificationSetWithFiles = SpecificationSetRecord & {
  files: SpecificationSetFileRecord[];
};

export type SpecificationSetFileRowShape = {
  id: string;
  set_id: string;
  filename: string;
  relative_path: string;
  file_role: string;
  sort_order: number;
  content: string;
  parse_status: string;
  summary: string | null;
  requirement_count: number | null;
  constraint_count: number | null;
  flow_count: number | null;
  created_at: string;
  updated_at: string;
};

export type SpecificationSetRowShape = {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  document_type: string;
  parse_status: string;
  summary: string | null;
  requirement_count: number | null;
  constraint_count: number | null;
  flow_count: number | null;
  file_count: number;
  created_at: string;
  updated_at: string;
};

export function toSpecificationSetFileRecord(
  row: SpecificationSetFileRowShape,
): SpecificationSetFileRecord {
  return {
    id: row.id,
    setId: row.set_id,
    filename: row.filename,
    relativePath: row.relative_path,
    fileRole: row.file_role as SpecificationSetFileRole,
    sortOrder: row.sort_order,
    content: row.content,
    parseStatus: row.parse_status as SpecificationParseStatus,
    summary: row.summary,
    requirementCount: row.requirement_count,
    constraintCount: row.constraint_count,
    flowCount: row.flow_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSpecificationSetRecord(row: SpecificationSetRowShape): SpecificationSetRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    documentType: normalizeDocumentType(row.document_type),
    parseStatus: row.parse_status as SpecificationParseStatus,
    summary: row.summary,
    requirementCount: row.requirement_count,
    constraintCount: row.constraint_count,
    flowCount: row.flow_count,
    fileCount: row.file_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** One planning-selectable unit: standalone document or individual set member file. */
export type PlanningSpecificationEntry = {
  id: string;
  projectId: string;
  filename: string;
  path: string | null;
  documentType: SpecificationDocumentType;
  content: string;
  parseStatus: SpecificationParseStatus;
  summary: string | null;
  setId: string | null;
  setName: string | null;
  fileRole: SpecificationSetFileRole | null;
  sortOrder: number | null;
};

export type ProjectSpecificationsCatalog = {
  documents: SpecificationRecord[];
  sets: SpecificationSetWithFiles[];
};
