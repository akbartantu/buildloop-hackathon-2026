import { redactSecrets } from "@/lib/redaction";
import {
  captureFileUnifiedDiff,
  type GitDiffSummary,
} from "@/orchestrator/workspace/git-workspace";

export const CHANGE_ARTIFACT_MAX_BYTES = 20 * 1024;

export type ChangeArtifactFileChangeType = "added" | "modified" | "deleted" | "binary";

export type ChangeArtifactFile = {
  path: string;
  changeType: ChangeArtifactFileChangeType;
  diff?: string;
  redacted: boolean;
  truncated: boolean;
};

export type ChangeArtifact = {
  baselineSha: string;
  attemptNumber: number;
  checkerVerified: boolean;
  files: ChangeArtifactFile[];
  totalBytes: number;
  truncated: boolean;
};

export function globMatchPath(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (pattern.includes("*") || pattern.includes("?")) {
    const regex = new RegExp(
      `^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
    );
    return regex.test(normalized);
  }
  return normalized === pattern;
}

export function isAllowedChangePath(filePath: string, allowedPaths: string[]): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return allowedPaths.some((pattern) => globMatchPath(normalized, pattern));
}

export function isProtectedChangePath(filePath: string, protectedPaths: string[]): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return protectedPaths.some((pattern) => globMatchPath(normalized, pattern));
}

export function resolveChangeType(
  filePath: string,
  summary: GitDiffSummary,
): ChangeArtifactFileChangeType {
  const normalized = filePath.replace(/\\/g, "/");
  if (summary.addedFiles.includes(normalized)) return "added";
  if (summary.deletedFiles.includes(normalized)) return "deleted";
  return "modified";
}

export function sanitizeDiffText(diff: string): { text: string; redacted: boolean } {
  const sanitized = redactSecrets(diff);
  return { text: sanitized, redacted: sanitized !== diff };
}

export function truncateDiffText(diff: string, remainingBytes: number): { text: string; truncated: boolean } {
  if (remainingBytes <= 0) {
    return { text: "", truncated: true };
  }
  if (diff.length <= remainingBytes) {
    return { text: diff, truncated: false };
  }
  const marker = "\n... [TRUNCATED]\n";
  const budget = Math.max(0, remainingBytes - marker.length);
  return { text: `${diff.slice(0, budget)}${marker}`, truncated: true };
}

export type BuildChangeArtifactInput = {
  worktreePath: string;
  baselineSha: string;
  attemptNumber: number;
  allowedPaths: string[];
  protectedPaths: string[];
  diffSummary: GitDiffSummary;
  checkerVerified: boolean;
  captureDiff?: typeof captureFileUnifiedDiff;
  maxBytes?: number;
};

export async function buildChangeArtifact(input: BuildChangeArtifactInput): Promise<ChangeArtifact | null> {
  const capture = input.captureDiff ?? captureFileUnifiedDiff;
  const maxBytes = input.maxBytes ?? CHANGE_ARTIFACT_MAX_BYTES;
  const scopedFiles = input.diffSummary.changedFiles
    .map((file) => file.replace(/\\/g, "/"))
    .filter(
      (file) =>
        isAllowedChangePath(file, input.allowedPaths) &&
        !isProtectedChangePath(file, input.protectedPaths),
    );

  if (scopedFiles.length === 0) {
    return null;
  }

  const files: ChangeArtifactFile[] = [];
  let totalBytes = 0;
  let artifactTruncated = false;

  for (const filePath of scopedFiles) {
    const changeType = resolveChangeType(filePath, input.diffSummary);
    let entry: ChangeArtifactFile = {
      path: filePath,
      changeType,
      redacted: false,
      truncated: false,
    };

    const remainingBytes = maxBytes - totalBytes;
    if (remainingBytes <= 0) {
      artifactTruncated = true;
      entry.truncated = true;
      files.push(entry);
      continue;
    }

    try {
      const captured = await capture(input.worktreePath, input.baselineSha, filePath);
      if (captured.isBinary) {
        entry.changeType = "binary";
        files.push(entry);
        continue;
      }

      const { text: sanitized, redacted } = sanitizeDiffText(captured.diff);
      const { text: bounded, truncated } = truncateDiffText(sanitized, remainingBytes);
      entry = {
        path: filePath,
        changeType,
        diff: bounded,
        redacted,
        truncated,
      };
      totalBytes += bounded.length;
      if (truncated) {
        artifactTruncated = true;
      }
    } catch {
      files.push(entry);
      continue;
    }

    files.push(entry);
  }

  return {
    baselineSha: input.baselineSha,
    attemptNumber: input.attemptNumber,
    checkerVerified: input.checkerVerified,
    files,
    totalBytes,
    truncated: artifactTruncated,
  };
}
