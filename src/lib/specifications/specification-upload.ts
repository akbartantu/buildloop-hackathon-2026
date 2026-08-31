import path from "node:path";

import {
  SPECIFICATION_DOCUMENT_TYPES,
  type SpecificationDocumentType,
} from "./specification-record";

export const MAX_SPECIFICATION_BYTES = 512 * 1024;

const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".json"]);

export type SpecificationUploadValidation =
  | {
      ok: true;
      filename: string;
      originalPath: string | null;
      documentType: SpecificationDocumentType;
      content: string;
    }
  | { ok: false; message: string };

function sanitizeFilename(raw: string): string | null {
  const base = path.basename(raw.replace(/\\/g, "/"));
  if (!base || base === "." || base === "..") {
    return null;
  }
  if (/[\0<>:"|?*]/.test(base)) {
    return null;
  }
  if (base.includes("..")) {
    return null;
  }
  return base;
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

export function inferDocumentType(filename: string, content: string): SpecificationDocumentType {
  const upperName = filename.toUpperCase();
  if (upperName.includes("PRD")) return "PRD";
  if (upperName.includes("FRD")) return "FRD";
  if (upperName.includes("BRD")) return "BRD";
  if (/architecture/i.test(filename)) return "Architecture";
  if (/api[-_. ]?spec/i.test(filename)) return "API Spec";
  if (/adr/i.test(filename)) return "ADR";
  if (/spec[-_. ]?kit/i.test(filename) || /specification kit/i.test(content.slice(0, 500))) {
    return "Spec Kit";
  }
  return "Other";
}

export function validateSpecificationUpload(input: {
  filename: string;
  originalPath?: string | null;
  documentType?: string;
  content: string;
}): SpecificationUploadValidation {
  const filename = sanitizeFilename(input.filename);
  if (!filename) {
    return { ok: false, message: "Invalid filename." };
  }

  const extension = extensionOf(filename);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      message: "Unsupported format. Upload .md, .txt, or .json files only.",
    };
  }

  const byteLength = Buffer.byteLength(input.content, "utf8");
  if (byteLength <= 0) {
    return { ok: false, message: "File is empty." };
  }
  if (byteLength > MAX_SPECIFICATION_BYTES) {
    return { ok: false, message: "File exceeds the 512 KB upload limit." };
  }

  let originalPath: string | null = null;
  if (input.originalPath) {
    const normalized = input.originalPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.includes("..") || normalized.startsWith("/")) {
      return { ok: false, message: "Invalid original path." };
    }
    originalPath = normalized;
  }

  const requestedType = input.documentType?.trim();
  const documentType =
    requestedType && SPECIFICATION_DOCUMENT_TYPES.includes(requestedType as SpecificationDocumentType)
      ? (requestedType as SpecificationDocumentType)
      : inferDocumentType(filename, input.content);

  return {
    ok: true,
    filename,
    originalPath,
    documentType,
    content: input.content,
  };
}
