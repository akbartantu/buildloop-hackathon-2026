export type SpecificationDownloadArtifact = {
  filename: string;
  content: string;
  mimeType: string;
};

const EXTENSION_MIME: Record<string, string> = {
  ".md": "text/markdown;charset=utf-8",
  ".txt": "text/plain;charset=utf-8",
  ".json": "application/json;charset=utf-8",
};

export function mimeTypeForSpecificationFilename(filename: string): string {
  const index = filename.lastIndexOf(".");
  const extension = index >= 0 ? filename.slice(index).toLowerCase() : "";
  return EXTENSION_MIME[extension] ?? "text/plain;charset=utf-8";
}

export function buildSpecificationDownloadArtifact(
  filename: string,
  content: string,
): SpecificationDownloadArtifact {
  return {
    filename,
    content,
    mimeType: mimeTypeForSpecificationFilename(filename),
  };
}

export function triggerSpecificationDownload(artifact: SpecificationDownloadArtifact): void {
  const blob = new Blob([artifact.content], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
