import type { SpecificationDocumentType } from "./specification-record";

export type PendingSpecificationFile = {
  filename: string;
  relativePath: string;
  content: string;
};

export type PendingUploadResolution =
  | { mode: "single" }
  | { mode: "set" }
  | { mode: "invalid"; reason: "multiple-single-document" | "empty" };

export async function pendingFilesFromSelection(files: File[]): Promise<PendingSpecificationFile[]> {
  return Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      relativePath: file.webkitRelativePath || file.name,
      content: await file.text(),
    })),
  );
}

export function replacePendingSelection(
  incoming: PendingSpecificationFile[],
  specKitMode: boolean,
): PendingSpecificationFile[] {
  if (incoming.length === 0) {
    return [];
  }
  return specKitMode ? incoming : [incoming[0]!];
}

export function resolvePendingUploadAction(
  pending: PendingSpecificationFile[],
  documentType: SpecificationDocumentType,
): PendingUploadResolution {
  if (pending.length === 0) {
    return { mode: "invalid", reason: "empty" };
  }

  if (documentType === "Spec Kit") {
    if (pending.length >= 2) {
      return { mode: "set" };
    }
    return { mode: "single" };
  }

  if (pending.length > 1) {
    return { mode: "invalid", reason: "multiple-single-document" };
  }

  return { mode: "single" };
}

export function canSubmitPendingUpload(input: {
  pending: PendingSpecificationFile[];
  documentType: SpecificationDocumentType;
  uploading: boolean;
  disabled: boolean;
}): boolean {
  if (input.uploading || input.disabled) {
    return false;
  }
  const resolution = resolvePendingUploadAction(input.pending, input.documentType);
  return resolution.mode === "single" || resolution.mode === "set";
}
