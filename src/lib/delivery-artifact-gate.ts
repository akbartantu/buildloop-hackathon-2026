import { buildSuggestedCommitMetadata } from "@/lib/commit-suggestion";
import type { DeliveryHandoff } from "@/lib/delivery-artifact";
import type { HumanApprovalRecord, RunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";

export class DeliveryArtifactAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryArtifactAccessError";
  }
}

export type AuthorizedDeliveryHandoff = {
  patchFilename: string;
  patch: string;
  patchSha256: string | null;
  changedFiles: string[];
  files: DeliveryHandoff["files"];
  suggestedCommitMessage: string;
  suggestedCommitDescription: string;
  baselineSha: string;
  runId: string;
  attemptNumber: number;
  checkerVerdict: string;
};

export function findCommitApprovalForRun(
  runnerState: RunnerState | null | undefined,
  runId: string | null | undefined,
): HumanApprovalRecord | undefined {
  if (!runnerState?.humanApprovals?.length || !runId) {
    return undefined;
  }
  return runnerState.humanApprovals.find(
    (entry) =>
      entry.decision === "APPROVE_COMMIT" &&
      entry.action === "COMMIT" &&
      entry.runId === runId,
  ) as HumanApprovalRecord | undefined;
}

export function isCommitApprovedForCurrentRun(runnerState: RunnerState | null | undefined): boolean {
  const runId = runnerState?.runId ?? null;
  if (!runId || !runnerState?.commitApproved) {
    return false;
  }
  return Boolean(findCommitApprovalForRun(runnerState, runId));
}

export function isDeliveryArtifactAuthorized(runnerState: RunnerState | null | undefined): boolean {
  const handoff = runnerState?.deliveryHandoff;
  const runId = runnerState?.runId ?? null;
  if (!handoff || !runId) {
    return false;
  }
  if (handoff.runId !== runId) {
    return false;
  }
  return isCommitApprovedForCurrentRun(runnerState);
}

export function redactDeliveryHandoffForClient(handoff: DeliveryHandoff): DeliveryHandoff {
  return {
    ...handoff,
    patch: null,
    patchSha256: null,
    suggestedCommitMessage: "",
    suggestedCommitDescription: "",
  };
}

export function sanitizeRunnerStateForClient(
  runnerState: RunnerState | null | undefined,
): RunnerState | null {
  if (!runnerState) {
    return null;
  }
  if (!runnerState.deliveryHandoff) {
    return runnerState;
  }
  return {
    ...runnerState,
    deliveryHandoff: redactDeliveryHandoffForClient(runnerState.deliveryHandoff),
  };
}

export function sanitizeTaskRecordForClient(task: TaskRecord): TaskRecord {
  if (!task.runnerState?.deliveryHandoff) {
    return task;
  }
  return {
    ...task,
    runnerState: sanitizeRunnerStateForClient(task.runnerState),
  };
}

function resolveCommitSuggestions(task: TaskRecord, handoff: DeliveryHandoff): {
  message: string;
  description: string;
} {
  const persistedMessage = handoff.suggestedCommitMessage.trim();
  const persistedDescription = handoff.suggestedCommitDescription.trim();
  if (persistedMessage && persistedDescription) {
    return {
      message: persistedMessage,
      description: persistedDescription,
    };
  }

  const fallback = buildSuggestedCommitMetadata({
    contractGoal: task.goal,
    changedFiles: handoff.changedFiles,
    checkerVerdict: handoff.checkerVerdict,
    deliveryBlocked: false,
  });

  return {
    message: persistedMessage || fallback.message,
    description: persistedDescription || fallback.description,
  };
}

export function resolveAuthorizedDeliveryHandoff(task: TaskRecord): AuthorizedDeliveryHandoff {
  if (!isDeliveryArtifactAuthorized(task.runnerState)) {
    throw new DeliveryArtifactAccessError(
      "Delivery handoff is not authorized for the current run.",
    );
  }

  const handoff = task.runnerState?.deliveryHandoff;
  if (!handoff) {
    throw new DeliveryArtifactAccessError("Delivery handoff is unavailable.");
  }
  if (handoff.blocked) {
    throw new DeliveryArtifactAccessError(
      handoff.blockedReason ?? "Downloadable patch is not available for this verified result.",
    );
  }
  if (!handoff.patch?.trim()) {
    throw new DeliveryArtifactAccessError("Delivery patch is unavailable.");
  }

  const suggestions = resolveCommitSuggestions(task, handoff);
  if (!suggestions.message.trim()) {
    throw new DeliveryArtifactAccessError("Suggested commit message is unavailable.");
  }

  return {
    patchFilename: handoff.patchFilename,
    patch: handoff.patch,
    patchSha256: handoff.patchSha256,
    changedFiles: handoff.changedFiles,
    files: handoff.files,
    suggestedCommitMessage: suggestions.message,
    suggestedCommitDescription: suggestions.description,
    baselineSha: handoff.baselineSha,
    runId: handoff.runId,
    attemptNumber: handoff.attemptNumber,
    checkerVerdict: handoff.checkerVerdict,
  };
}

export function readAuthorizedDeliveryPatch(runnerState: RunnerState | null | undefined): string {
  if (!isDeliveryArtifactAuthorized(runnerState)) {
    throw new DeliveryArtifactAccessError(
      "Delivery patch is not authorized for the current run.",
    );
  }
  const patch = runnerState?.deliveryHandoff?.patch;
  if (!patch) {
    throw new DeliveryArtifactAccessError("Delivery patch is unavailable.");
  }
  return patch;
}
