import type { SpecificationRecord } from "./specification-record";
import { normalizeDocumentType } from "./specification-record";
import type {
  PlanningSpecificationEntry,
  ProjectSpecificationsCatalog,
  SpecificationSetWithFiles,
} from "./specification-set-record";

export function documentToPlanningEntry(
  document: SpecificationRecord,
): PlanningSpecificationEntry {
  return {
    id: document.id,
    projectId: document.projectId,
    filename: document.filename,
    path: document.originalPath ?? document.filename,
    documentType: normalizeDocumentType(document.documentType),
    content: document.content,
    parseStatus: document.parseStatus,
    summary: document.summary,
    setId: null,
    setName: null,
    fileRole: null,
    sortOrder: null,
  };
}

export function setFileToPlanningEntry(
  set: SpecificationSetWithFiles,
  file: SpecificationSetWithFiles["files"][number],
): PlanningSpecificationEntry {
  return {
    id: file.id,
    projectId: set.projectId,
    filename: file.filename,
    path: file.relativePath,
    documentType: normalizeDocumentType(set.documentType),
    content: file.content,
    parseStatus: file.parseStatus,
    summary: file.summary,
    setId: set.id,
    setName: set.name,
    fileRole: file.fileRole,
    sortOrder: file.sortOrder,
  };
}

export function flattenCatalogForPlanning(
  catalog: ProjectSpecificationsCatalog,
): PlanningSpecificationEntry[] {
  const fromDocuments = catalog.documents.map(documentToPlanningEntry);
  const fromSets = catalog.sets.flatMap((set) =>
    [...set.files]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((file) => setFileToPlanningEntry(set, file)),
  );
  return [...fromDocuments, ...fromSets];
}

export function buildSpecificationsCatalog(
  documents: SpecificationRecord[],
  sets: SpecificationSetWithFiles[],
): ProjectSpecificationsCatalog {
  return { documents, sets };
}
