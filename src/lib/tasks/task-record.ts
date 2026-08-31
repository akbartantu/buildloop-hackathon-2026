import type { TaskContract, TaskStatus } from "@/lib/task-contract";
import type { BlockedReason } from "@/lib/sensitive-intent";
import type { TaskRecord } from "@/lib/tasks-schema";
import { sanitizeTaskRecordForClient } from "@/lib/delivery-artifact-gate";
import { hydrateTaskProtectedPathApproval } from "@/lib/protected-path-approval-flow";

export type TaskRowShape = {
  id: string;
  workspace: string;
  goal: string;
  status: string;
  contract: unknown;
  blocked_reasons: unknown;
  runner_state: unknown;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
  project_id?: string | null;
  source_commit_sha?: string | null;
};

export function fromTaskRow(row: TaskRowShape): TaskRecord {
  return {
    id: row.id,
    workspace: row.workspace,
    goal: row.goal,
    status: row.status as TaskStatus,
    contract: row.contract as TaskContract,
    blockedReasons: (row.blocked_reasons ?? []) as BlockedReason[],
    runnerState: (row.runner_state ?? null) as TaskRecord["runnerState"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockedAt: row.locked_at,
    projectId: row.project_id ?? null,
    sourceCommitSha: row.source_commit_sha ?? null,
  };
}

export function toTaskRecord(row: TaskRowShape): TaskRecord {
  return hydrateTaskProtectedPathApproval(sanitizeTaskRecordForClient(fromTaskRow(row)));
}
