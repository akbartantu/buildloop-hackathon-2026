import type { RunnerState, TaskStatus } from "@/lib/task-contract";
import { zeroChangeRunnerState } from "@/lib/task-contract";
import { isOrchestrationInProgressStatus } from "@/lib/task-lifecycle-ops";
import type { TaskRecord } from "@/lib/tasks-schema";

export const PERSISTABLE_ACTIVE_RUN_STATUSES = [
  "INSPECTING",
  "RUNNING",
  "CHECKING",
  "NEEDS_CORRECTION",
] as const satisfies readonly TaskStatus[];

export type PersistableActiveRunStatus = (typeof PERSISTABLE_ACTIVE_RUN_STATUSES)[number];

export function isPersistableActiveRunStatus(status: string): status is PersistableActiveRunStatus {
  return (PERSISTABLE_ACTIVE_RUN_STATUSES as readonly string[]).includes(status);
}

/** True when persisted task status indicates an in-flight orchestration run. */
export function isTaskActivelyRunning(task: Pick<TaskRecord, "status">): boolean {
  return isOrchestrationInProgressStatus(task.status);
}

/** Derive UI "running" from persisted status, with optional mutation pending for instant feedback. */
export function resolveTaskRunningState(
  task: Pick<TaskRecord, "status">,
  mutationPending = false,
): boolean {
  return isTaskActivelyRunning(task) || mutationPending;
}

function mapActivePhase(status: TaskStatus): string {
  if (status === "INSPECTING") return "PLANNING";
  if (status === "CHECKING") return "CHECKING";
  if (status === "RUNNING" || status === "NEEDS_CORRECTION") return "RUNNING";
  return status;
}

export function buildActiveRunRunnerState(
  existing: RunnerState | null | undefined,
  input: { status: TaskStatus; runId?: string; phase?: string },
): RunnerState {
  const base = existing ?? zeroChangeRunnerState("Orchestration in progress.");
  return {
    ...base,
    runnerInvoked: false,
    note: "Orchestration in progress.",
    ...(input.runId ? { runId: input.runId } : {}),
    orchestration: {
      ...(base.orchestration ?? {}),
      phase: input.phase ?? mapActivePhase(input.status),
    },
  };
}

export function buildRunStartupFailureRunnerState(
  existing: RunnerState | null | undefined,
  message: string,
): RunnerState {
  const base = existing ?? zeroChangeRunnerState(message);
  return {
    ...base,
    note: message,
    operationalError: message,
  };
}

/** Statuses eligible to transition into an active run at startup. */
export const RUN_START_ELIGIBLE_STATUSES: TaskStatus[] = ["APPROVED_FOR_EXECUTION"];
