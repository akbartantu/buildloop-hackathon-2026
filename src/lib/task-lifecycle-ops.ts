import type { TaskContract, TaskStatus } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";

const ACTIVE_ORCHESTRATION_STATUSES: TaskStatus[] = [
  "INSPECTING",
  "RUNNING",
  "CHECKING",
  "NEEDS_CORRECTION",
];

export type ContractHistoryEntry = {
  version: number;
  sourceCommitSha: string | null;
  lockedAt: string | null;
  createdAt: string;
  goal: string;
  acceptanceCriteria: string[];
  inScope: string[];
};

export type TaskContractWithMeta = TaskContract & {
  contractVersion?: number;
  contractHistory?: ContractHistoryEntry[];
};

export const SOURCE_COMMIT_DRIFT_CODE = "SOURCE_COMMIT_DRIFT";

export function getContractVersion(contract: TaskContract): number {
  return (contract as TaskContractWithMeta).contractVersion ?? 1;
}

export function contractVersionLabel(task: TaskRecord): string {
  const version = getContractVersion(task.contract);
  return task.lockedAt ? `v${version} · Locked` : `v${version} · Draft`;
}

export function isDraftOrReviewable(task: TaskRecord): boolean {
  return (
    (task.status === "DRAFT" || task.status === "CONTRACT_READY") &&
    !task.lockedAt &&
    !task.runnerState?.runnerInvoked
  );
}

export function isTaskLocked(task: TaskRecord): boolean {
  return Boolean(task.lockedAt) || task.status === "APPROVED_FOR_EXECUTION";
}

export function taskHasExecuted(task: TaskRecord): boolean {
  return Boolean(task.runnerState?.runnerInvoked);
}

export function isOrchestrationInProgressStatus(status: TaskStatus): boolean {
  return ACTIVE_ORCHESTRATION_STATUSES.includes(status);
}

export function isOrchestrationEligible(task: TaskRecord): boolean {
  if (isOrchestrationInProgressStatus(task.status)) {
    return false;
  }
  if (task.status !== "APPROVED_FOR_EXECUTION") {
    return false;
  }
  if (task.runnerState?.revisionRequested) {
    return true;
  }
  return !task.runnerState?.runnerInvoked;
}

export function assertTaskOrchestrationEligible(task: TaskRecord): void {
  if (isOrchestrationInProgressStatus(task.status)) {
    throw new Error("Orchestrator sudah berjalan untuk task ini.");
  }
  if (task.status !== "APPROVED_FOR_EXECUTION") {
    throw new Error("Task harus berstatus APPROVED_FOR_EXECUTION sebelum diorkestrasi.");
  }
  if (task.runnerState?.runnerInvoked && !task.runnerState?.revisionRequested) {
    throw new Error("Task sudah selesai dieksekusi. Orchestrasi ulang tidak diizinkan.");
  }
}

export function canUpdateDraft(task: TaskRecord): boolean {
  return isDraftOrReviewable(task);
}

export function canReviseTask(task: TaskRecord): boolean {
  return isTaskLocked(task) && !taskHasExecuted(task);
}

export function detectSourceCommitDrift(
  task: TaskRecord,
  projectCommitSha: string | null | undefined,
): boolean {
  if (!task.projectId || !task.sourceCommitSha || !projectCommitSha) {
    return false;
  }
  return task.sourceCommitSha !== projectCommitSha;
}

export function appendContractHistory(
  contract: TaskContractWithMeta,
  task: Pick<TaskRecord, "goal" | "sourceCommitSha" | "lockedAt">,
): ContractHistoryEntry[] {
  const version = getContractVersion(contract);
  const entry: ContractHistoryEntry = {
    version,
    sourceCommitSha: task.sourceCommitSha,
    lockedAt: task.lockedAt,
    createdAt: new Date().toISOString(),
    goal: contract.goal,
    acceptanceCriteria: [...contract.acceptanceCriteria],
    inScope: [...contract.inScope],
  };
  return [...(contract.contractHistory ?? []), entry];
}

export function withContractVersion(
  contract: TaskContract,
  version: number,
  history?: ContractHistoryEntry[],
): TaskContractWithMeta {
  return {
    ...contract,
    contractVersion: version,
    ...(history?.length ? { contractHistory: history } : {}),
  };
}
