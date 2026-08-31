import type { TaskContract, TaskStatus } from "@/lib/task-contract";
import type { RunnerState } from "@/lib/task-contract";
import { zeroChangeRunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { getContractVersion } from "@/lib/task-lifecycle-ops";

export type ContractInputsSnapshot = {
  goal: string;
  inScope: string[];
  acceptanceCriteria: string[];
  protectedPaths: string[];
  requiredChecks: string[];
};

export type TaskRunSnapshot = {
  runNumber: number;
  runId: string;
  status: TaskStatus;
  verdict: string | null;
  contractVersion: number;
  startedAt: string;
  finishedAt: string;
  correctionCount: number;
  filesChanged: number;
  evidence?: NonNullable<RunnerState["evidence"]>;
  decisionLog?: NonNullable<RunnerState["decisionLog"]>;
  note?: string;
};

export function captureContractInputs(contract: TaskContract): ContractInputsSnapshot {
  return {
    goal: contract.goal.trim(),
    inScope: [...contract.inScope].sort(),
    acceptanceCriteria: [...contract.acceptanceCriteria].sort(),
    protectedPaths: [...contract.protectedPaths].sort(),
    requiredChecks: [...contract.requiredChecks].sort(),
  };
}

export function contractInputsEqual(
  left: ContractInputsSnapshot,
  right: ContractInputsSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function resolveLockedContractInputs(task: TaskRecord): ContractInputsSnapshot | null {
  return task.runnerState?.lockedContractInputs ?? null;
}

export function hasUnchangedContractInputs(task: TaskRecord): boolean {
  const locked = resolveLockedContractInputs(task);
  if (!locked) {
    return Boolean(task.lockedAt) && !["CONTRACT_READY", "STALE", "DRAFT"].includes(task.status);
  }
  return contractInputsEqual(locked, captureContractInputs(task.contract));
}

export function requiresContractRefreshBeforeRerun(task: TaskRecord): boolean {
  if (task.status !== "FAILED") {
    return false;
  }
  if (!task.lockedAt || !task.runnerState?.runnerInvoked) {
    return false;
  }
  return !hasUnchangedContractInputs(task);
}

export function canRerunFailedTask(task: TaskRecord): boolean {
  if (task.status !== "FAILED") {
    return false;
  }
  if (!task.lockedAt || !task.runnerState?.runnerInvoked || !task.runnerState.runId) {
    return false;
  }
  return hasUnchangedContractInputs(task);
}

export function canRerunBlockedTask(_task: TaskRecord): boolean {
  return false;
}

export function archiveCurrentRun(task: TaskRecord, finishedAt: string = new Date().toISOString()): RunnerState {
  const runner = task.runnerState;
  if (!runner?.runId) {
    throw new Error("Cannot archive run — no run ID on task.");
  }

  const history = runner.runHistory ?? [];
  const snapshot: TaskRunSnapshot = {
    runNumber: history.length + 1,
    runId: runner.runId,
    status: task.status,
    verdict: runner.orchestration?.finalVerdict ?? null,
    contractVersion: getContractVersion(task.contract),
    startedAt: task.lockedAt ?? task.updatedAt,
    finishedAt,
    correctionCount: runner.correctionCount ?? 0,
    filesChanged: runner.filesChanged,
    ...(runner.evidence?.length ? { evidence: [...runner.evidence] } : {}),
    ...(runner.decisionLog?.length ? { decisionLog: [...runner.decisionLog] } : {}),
    note: runner.note,
  };

  return {
    ...zeroChangeRunnerState("Prepared for re-run."),
    runHistory: [...history, snapshot],
    lockedContractInputs: runner.lockedContractInputs ?? captureContractInputs(task.contract),
    humanRevisionCount: runner.humanRevisionCount ?? 0,
    ...(runner.humanApprovals?.length ? { humanApprovals: [...runner.humanApprovals] } : {}),
    rerunRequested: true,
  };
}

export function formatRunHistoryLabel(
  entry: TaskRunSnapshot,
  locale: "en" | "id" = "en",
): string {
  const verdict =
    entry.verdict === "PASS"
      ? locale === "id"
        ? "Lolos"
        : "Passed"
      : entry.verdict === "BLOCKED"
        ? locale === "id"
          ? "Diblokir"
          : "Blocked"
        : entry.verdict === "FAILED" || entry.status === "FAILED"
          ? locale === "id"
            ? "Gagal"
            : "Failed"
          : entry.status.replaceAll("_", " ");
  return locale === "id"
    ? `Run #${entry.runNumber} · ${verdict}`
    : `Run #${entry.runNumber} · ${verdict}`;
}

export function listTaskRunHistory(task: TaskRecord): TaskRunSnapshot[] {
  return task.runnerState?.runHistory ?? [];
}

export function assertRerunAllowed(task: TaskRecord): void {
  if (task.status === "BLOCKED") {
    throw new Error("Blocked tasks cannot be re-run until the blocker is resolved.");
  }
  if (requiresContractRefreshBeforeRerun(task)) {
    throw new Error("Contract inputs changed. Refresh and approve the contract before re-running.");
  }
  if (!canRerunFailedTask(task)) {
    throw new Error("Task cannot be re-run in its current state.");
  }
}
