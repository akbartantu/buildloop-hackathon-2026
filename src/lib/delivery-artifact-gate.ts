import type { DeliveryHandoff } from "@/lib/delivery-artifact";
import type { HumanApprovalRecord, RunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";

export class DeliveryArtifactAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryArtifactAccessError";
  }
}

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
  if (isDeliveryArtifactAuthorized(runnerState) || !runnerState.deliveryHandoff) {
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
