import path from "node:path";

import { parseSpecificationContent } from "./specification-parser";
import {
  SPEC_KIT_ROLE_SORT_ORDER,
  type SpecificationSetFileRole,
} from "./specification-set-record";
import {
  validateSpecificationUpload,
} from "./specification-upload";

export const MAX_SPECIFICATION_BUNDLE_BYTES = 2 * 1024 * 1024;
export const MIN_SPECIFICATION_BUNDLE_FILES = 2;

export type SpecificationBundleFileInput = {
  filename: string;
  relativePath?: string;
  content: string;
};

export type ValidatedSpecificationBundleFile = {
  filename: string;
  relativePath: string;
  fileRole: SpecificationSetFileRole;
  sortOrder: number;
  content: string;
  requirementCount: number;
  constraintCount: number;
  flowCount: number;
  summary: string;
};

export type SpecificationBundleUploadValidation =
  | {
      ok: true;
      name: string;
      documentType: "Spec Kit";
      files: ValidatedSpecificationBundleFile[];
      requirementCount: number;
      constraintCount: number;
      flowCount: number;
      summary: string;
    }
  | { ok: false; message: string };

const SPEC_KIT_FILENAME_ROLES: Record<string, SpecificationSetFileRole> = {
  "constitution.md": "constitution",
  "spec.md": "spec",
  "plan.md": "plan",
  "tasks.md": "tasks",
};

function normalizeRelativePath(raw: string, filename: string): string | null {
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    return null;
  }
  const base = path.basename(normalized);
  if (base !== filename) {
    return normalized.endsWith(`/${filename}`)
      ? normalized
      : `${normalized}/${filename}`.replace(/\/+/g, "/");
  }
  return normalized;
}

function inferFileRole(filename: string): SpecificationSetFileRole {
  const lower = filename.toLowerCase();
  return SPEC_KIT_FILENAME_ROLES[lower] ?? "other";
}

function inferBundleName(paths: string[]): string {
  if (paths.length === 0) {
    return "spec-kit";
  }

  const segmentsList = paths.map((entry) => entry.split("/").filter(Boolean));
  const minLength = Math.min(...segmentsList.map((segments) => segments.length));
  const shared: string[] = [];

  for (let index = 0; index < minLength - 1; index += 1) {
    const segment = segmentsList[0]![index]!;
    if (segmentsList.every((segments) => segments[index] === segment)) {
      shared.push(segment);
    } else {
      break;
    }
  }

  if (shared.length > 0) {
    return shared.join("/");
  }

  const firstPath = paths[0]!;
  const parts = firstPath.split("/").filter(Boolean);
  if (parts.length > 1) {
    return parts.slice(0, -1).join("/");
  }

  return "spec-kit";
}

function sortBundleFiles(
  files: ValidatedSpecificationBundleFile[],
): ValidatedSpecificationBundleFile[] {
  return [...files].sort((a, b) => {
    const roleDelta = SPEC_KIT_ROLE_SORT_ORDER[a.fileRole] - SPEC_KIT_ROLE_SORT_ORDER[b.fileRole];
    if (roleDelta !== 0) {
      return roleDelta;
    }
    return a.relativePath.localeCompare(b.relativePath);
  });
}

export function validateSpecificationBundleUpload(input: {
  files: SpecificationBundleFileInput[];
  bundleName?: string;
}): SpecificationBundleUploadValidation {
  if (input.files.length < MIN_SPECIFICATION_BUNDLE_FILES) {
    return {
      ok: false,
      message: "A specification set requires at least two related files.",
    };
  }

  const validatedFiles: ValidatedSpecificationBundleFile[] = [];
  let totalBytes = 0;
  let totalRequirements = 0;
  let totalConstraints = 0;
  let totalFlows = 0;

  for (const file of input.files) {
    const relativePathInput = file.relativePath?.trim() || file.filename;
    const single = validateSpecificationUpload({
      filename: file.filename,
      originalPath: relativePathInput,
      documentType: "Spec Kit",
      content: file.content,
    });

    if (!single.ok) {
      return single;
    }

    const relativePath = normalizeRelativePath(relativePathInput, single.filename);
    if (!relativePath) {
      return { ok: false, message: `Invalid relative path for ${single.filename}.` };
    }

    totalBytes += Buffer.byteLength(single.content, "utf8");
    if (totalBytes > MAX_SPECIFICATION_BUNDLE_BYTES) {
      return {
        ok: false,
        message: "Specification set exceeds the 2 MB combined upload limit.",
      };
    }

    const parsed = parseSpecificationContent(single.content, single.filename);
    totalRequirements += parsed.requirementCount;
    totalConstraints += parsed.constraintCount;
    totalFlows += parsed.flowCount;

    const fileRole = inferFileRole(single.filename);
    validatedFiles.push({
      filename: single.filename,
      relativePath,
      fileRole,
      sortOrder: SPEC_KIT_ROLE_SORT_ORDER[fileRole],
      content: single.content,
      requirementCount: parsed.requirementCount,
      constraintCount: parsed.constraintCount,
      flowCount: parsed.flowCount,
      summary: parsed.summary,
    });
  }

  const relativePaths = validatedFiles.map((file) => file.relativePath);
  const duplicatePaths = relativePaths.filter(
    (entry, index) => relativePaths.indexOf(entry) !== index,
  );
  if (duplicatePaths.length > 0) {
    return {
      ok: false,
      message: `Duplicate relative paths in set: ${duplicatePaths[0]}.`,
    };
  }

  const sorted = sortBundleFiles(validatedFiles);
  const name = input.bundleName?.trim() || inferBundleName(relativePaths);
  const summary = `Spec Kit set "${name}" with ${sorted.length} files (${sorted.map((file) => file.filename).join(", ")}).`;

  return {
    ok: true,
    name,
    documentType: "Spec Kit",
    files: sorted.map((file, index) => ({ ...file, sortOrder: index })),
    requirementCount: totalRequirements,
    constraintCount: totalConstraints,
    flowCount: totalFlows,
    summary,
  };
}
