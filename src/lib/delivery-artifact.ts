import { createHash } from "node:crypto";

import {
  isAllowedChangePath,
  isProtectedChangePath,
  resolveChangeType,
  type ChangeArtifactFileChangeType,
} from "@/lib/change-artifact";
import { buildSuggestedCommitMetadata } from "@/lib/commit-suggestion";
import { containsSecretMaterial } from "@/lib/redaction";
import { formatTaskRef } from "@/lib/task-display";
import {
  captureFileUnifiedDiff,
  type GitDiffSummary,
} from "@/orchestrator/workspace/git-workspace";

export const DELIVERY_PATCH_MAX_BYTES = 256 * 1024;

export type DeliveryHandoffMode = "MANUAL_HANDOFF";

export type DeliveryHandoffFile = {
  path: string;
  changeType: ChangeArtifactFileChangeType;
};

export type DeliveryHandoff = {
  mode: DeliveryHandoffMode;
  taskId: string;
  runId: string;
  baselineSha: string;
  attemptNumber: number;
  checkerVerdict: string;
  createdAt: string;
  changedFiles: string[];
  files: DeliveryHandoffFile[];
  patchFilename: string;
  patch: string | null;
  patchSha256: string | null;
  blocked: boolean;
  blockedReason?: string;
  suggestedCommitMessage: string;
  suggestedCommitDescription: string;
};

export type BuildDeliveryHandoffInput = {
  taskId: string;
  runId: string;
  contractGoal: string;
  worktreePath: string;
  baselineSha: string;
  attemptNumber: number;
  checkerVerdict: string;
  allowedPaths: string[];
  protectedPaths: string[];
  diffSummary: GitDiffSummary;
  captureDiff?: typeof captureFileUnifiedDiff;
  maxBytes?: number;
};

function deliveryPatchFilename(taskId: string): string {
  return `buildloop-${formatTaskRef(taskId)}.patch`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function buildBlockedDeliveryHandoff(input: {
  taskId: string;
  runId: string;
  baselineSha: string;
  attemptNumber: number;
  checkerVerdict: string;
  contractGoal: string;
  blockedReason: string;
  changedFiles?: string[];
}): DeliveryHandoff {
  const suggestions = buildSuggestedCommitMetadata({
    contractGoal: input.contractGoal,
    changedFiles: input.changedFiles ?? [],
    checkerVerdict: input.checkerVerdict,
    deliveryBlocked: true,
  });
  return {
    mode: "MANUAL_HANDOFF",
    taskId: input.taskId,
    runId: input.runId,
    baselineSha: input.baselineSha,
    attemptNumber: input.attemptNumber,
    checkerVerdict: input.checkerVerdict,
    createdAt: new Date().toISOString(),
    changedFiles: input.changedFiles ?? [],
    files: [],
    patchFilename: deliveryPatchFilename(input.taskId),
    patch: null,
    patchSha256: null,
    blocked: true,
    blockedReason: input.blockedReason,
    suggestedCommitMessage: suggestions.message,
    suggestedCommitDescription: suggestions.description,
  };
}

export async function buildDeliveryHandoff(
  input: BuildDeliveryHandoffInput,
): Promise<DeliveryHandoff | null> {
  const capture = input.captureDiff ?? captureFileUnifiedDiff;
  const maxBytes = input.maxBytes ?? DELIVERY_PATCH_MAX_BYTES;
  const normalizedChanged = input.diffSummary.changedFiles.map((file) => file.replace(/\\/g, "/"));

  if (normalizedChanged.length === 0) {
    return null;
  }

  const protectedHit = normalizedChanged.some((file) =>
    isProtectedChangePath(file, input.protectedPaths),
  );
  if (protectedHit) {
    return buildBlockedDeliveryHandoff({
      taskId: input.taskId,
      runId: input.runId,
      baselineSha: input.baselineSha,
      attemptNumber: input.attemptNumber,
      checkerVerdict: input.checkerVerdict,
      contractGoal: input.contractGoal,
      blockedReason: "Verified changes include protected paths. Downloadable patch is not available.",
      changedFiles: normalizedChanged,
    });
  }

  const scopedFiles = normalizedChanged.filter((file) =>
    isAllowedChangePath(file, input.allowedPaths),
  );

  if (scopedFiles.length === 0) {
    return buildBlockedDeliveryHandoff({
      taskId: input.taskId,
      runId: input.runId,
      baselineSha: input.baselineSha,
      attemptNumber: input.attemptNumber,
      checkerVerdict: input.checkerVerdict,
      contractGoal: input.contractGoal,
      blockedReason: "No in-scope verified files are available for manual delivery.",
      changedFiles: normalizedChanged,
    });
  }

  const files: DeliveryHandoffFile[] = [];
  const diffSections: string[] = [];

  for (const filePath of scopedFiles) {
    const changeType = resolveChangeType(filePath, input.diffSummary);
    if (changeType === "binary") {
      files.push({ path: filePath, changeType: "binary" });
      continue;
    }

    try {
      const captured = await capture(input.worktreePath, input.baselineSha, filePath);
      if (captured.isBinary) {
        files.push({ path: filePath, changeType: "binary" });
        continue;
      }
      if (containsSecretMaterial(captured.diff)) {
        return buildBlockedDeliveryHandoff({
          taskId: input.taskId,
          runId: input.runId,
          baselineSha: input.baselineSha,
          attemptNumber: input.attemptNumber,
          checkerVerdict: input.checkerVerdict,
          contractGoal: input.contractGoal,
          blockedReason:
            "Verified patch content appears to contain secret-like material. Downloadable patch is not available.",
          changedFiles: scopedFiles,
        });
      }
      diffSections.push(captured.diff);
      files.push({ path: filePath, changeType });
    } catch {
      files.push({ path: filePath, changeType });
    }
  }

  const textFiles = files.filter((file) => file.changeType !== "binary");
  if (textFiles.length === 0) {
    return buildBlockedDeliveryHandoff({
      taskId: input.taskId,
      runId: input.runId,
      baselineSha: input.baselineSha,
      attemptNumber: input.attemptNumber,
      checkerVerdict: input.checkerVerdict,
      contractGoal: input.contractGoal,
      blockedReason:
        "Verified changes include binary files only. Text patch download is not available for this run.",
      changedFiles: scopedFiles,
    });
  }

  const patch = diffSections.join("\n");
  if (patch.length === 0) {
    return buildBlockedDeliveryHandoff({
      taskId: input.taskId,
      runId: input.runId,
      baselineSha: input.baselineSha,
      attemptNumber: input.attemptNumber,
      checkerVerdict: input.checkerVerdict,
      contractGoal: input.contractGoal,
      blockedReason: "Verified patch could not be reconstructed from the final attempt.",
      changedFiles: scopedFiles,
    });
  }

  if (patch.length > maxBytes) {
    return buildBlockedDeliveryHandoff({
      taskId: input.taskId,
      runId: input.runId,
      baselineSha: input.baselineSha,
      attemptNumber: input.attemptNumber,
      checkerVerdict: input.checkerVerdict,
      contractGoal: input.contractGoal,
      blockedReason: `Verified patch exceeds the safe size limit (${maxBytes} bytes).`,
      changedFiles: scopedFiles,
    });
  }

  const suggestions = buildSuggestedCommitMetadata({
    contractGoal: input.contractGoal,
    changedFiles: scopedFiles,
    checkerVerdict: input.checkerVerdict,
    deliveryBlocked: false,
  });

  return {
    mode: "MANUAL_HANDOFF",
    taskId: input.taskId,
    runId: input.runId,
    baselineSha: input.baselineSha,
    attemptNumber: input.attemptNumber,
    checkerVerdict: input.checkerVerdict,
    createdAt: new Date().toISOString(),
    changedFiles: scopedFiles,
    files,
    patchFilename: deliveryPatchFilename(input.taskId),
    patch,
    patchSha256: sha256(patch),
    blocked: false,
    suggestedCommitMessage: suggestions.message,
    suggestedCommitDescription: suggestions.description,
  };
}
