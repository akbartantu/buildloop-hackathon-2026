import type { RunnerState, TaskStatus } from "@/lib/task-contract";
import type { BlockedReason } from "@/lib/sensitive-intent";
import type { TaskRecord } from "@/lib/tasks-schema";
import {
  extractApprovedProtectedPaths,
  recordProtectedPathApproval,
  type ProtectedPathApprovalRecord,
} from "@/lib/protected-path-approval";

export type PendingProtectedPathApproval = NonNullable<RunnerState["pendingProtectedPathApproval"]>;

export type ProtectedPathApprovalEvidence = {
  path: string;
  reason: string;
  runId?: string | null;
};

const PATH_FROM_STOP_MESSAGE =
  /protected path approval required before writing:\s*(.+)$/i;

export function parseProtectedPathFromStopMessage(message: string): string | null {
  const match = message.trim().match(PATH_FROM_STOP_MESSAGE);
  if (!match?.[1]) {
    return null;
  }
  return match[1].replace(/\\/g, "/").trim();
}

export function findProtectedPathApprovalEvidence(
  evidence: Array<{ name?: string; summary?: string; details?: string; attemptNumber?: number }> | undefined,
  runId?: string | null,
): ProtectedPathApprovalEvidence | null {
  if (!evidence?.length) {
    return null;
  }
  const entry = [...evidence]
    .reverse()
    .find((item) => item.name === "protected_path_approval_required");
  if (!entry?.summary) {
    return null;
  }
  const path = parseProtectedPathFromStopMessage(entry.summary);
  if (!path) {
    return null;
  }
  return {
    path,
    reason: entry.summary,
    ...(runId ? { runId } : {}),
  };
}

export function buildPendingProtectedPathApprovalRequest(input: {
  path: string;
  reason: string;
  runId?: string | null;
  operation?: "create" | "modify";
}): PendingProtectedPathApproval {
  return {
    paths: [input.path],
    reason: input.reason,
    requestedAt: new Date().toISOString(),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.operation ? { operation: input.operation } : {}),
  };
}

export function inferProtectedPathOperation(
  path: string,
  contractGoal: string,
): "create" | "modify" {
  if (/\b(initializ|bootstrap|scaffold|foundation|baseline)\b/i.test(contractGoal)) {
    return "create";
  }
  return "modify";
}

export function describeProtectedPathApprovalReason(input: {
  path: string;
  operation?: "create" | "modify";
  contractGoal?: string;
}): string {
  const operation =
    input.operation ??
    (input.contractGoal ? inferProtectedPathOperation(input.path, input.contractGoal) : "modify");
  if (operation === "create") {
    return `BuildLoop needs to create this protected file (${input.path}) to establish the approved task baseline.`;
  }
  return `BuildLoop needs to modify this protected file (${input.path}) to complete the approved task scope.`;
}

export function isPendingProtectedPathApproval(task: {
  runnerState: RunnerState | null;
  status?: TaskStatus;
}): boolean {
  if (task.runnerState?.rejected) {
    return false;
  }
  const pending = task.runnerState?.pendingProtectedPathApproval;
  return Boolean(pending?.paths.length);
}

export function pendingProtectedPathApprovalPaths(task: {
  runnerState: RunnerState | null;
}): string[] {
  return task.runnerState?.pendingProtectedPathApproval?.paths ?? [];
}

export function isProtectedPathAlreadyApproved(
  path: string,
  approvals: ProtectedPathApprovalRecord[] | undefined,
): boolean {
  return extractApprovedProtectedPaths(approvals).some(
    (approved) => approved.replace(/\\/g, "/") === path.replace(/\\/g, "/"),
  );
}

export function canRespondToProtectedPathApproval(task: {
  runnerState: RunnerState | null;
}): boolean {
  if (task.runnerState?.rejected) {
    return false;
  }
  return isPendingProtectedPathApproval(task);
}

export type ProtectedPathApprovalActionResult = {
  task: Pick<TaskRecord, "status" | "runnerState" | "blockedReasons">;
  resumeOrchestration: boolean;
  idempotent: boolean;
};

export function applyProtectedPathApprovalAction(input: {
  task: TaskRecord;
  decision: "APPROVE" | "REJECT";
  actorUserId: string;
  note?: string;
}): ProtectedPathApprovalActionResult {
  const pending = input.task.runnerState?.pendingProtectedPathApproval;
  if (!pending?.paths.length) {
    throw new Error("No pending protected-path approval request for this task.");
  }

  if (input.decision === "REJECT") {
    const blockedReasons: BlockedReason[] = [
      {
        rule: "PROTECTED_PATH_APPROVAL_REJECTED",
        matchedText: pending.paths.join(", "),
        explanation:
          input.note?.trim() ||
          "Human rejected the protected-path change request. No protected files were modified.",
        protectedTarget: pending.paths[0] ?? "",
      },
    ];
    const baseRunner = input.task.runnerState ?? {
      runnerInvoked: false,
      filesChanged: 0,
      commandsExecuted: 0,
      commit: false,
      push: false,
      note: "Protected path approval rejected.",
    };
    const { pendingProtectedPathApproval: _pending, ...restRunner } = baseRunner;
    const runnerState: RunnerState = {
      ...restRunner,
      rejected: true,
      note: "Protected path approval rejected by human reviewer.",
    };

    return {
      task: {
        status: "BLOCKED",
        runnerState,
        blockedReasons,
      },
      resumeOrchestration: false,
      idempotent: false,
    };
  }

  const pathsToApprove = pending.paths.filter(
    (path) => !isProtectedPathAlreadyApproved(path, input.task.runnerState?.protectedPathApprovals),
  );
  let runnerState = input.task.runnerState ?? {
    runnerInvoked: false,
    filesChanged: 0,
    commandsExecuted: 0,
    commit: false,
    push: false,
    note: "Protected path approval granted.",
  };

  if (pathsToApprove.length) {
    runnerState = recordProtectedPathApproval({
      runnerState,
      paths: pathsToApprove,
      actorUserId: input.actorUserId,
      ...(input.note ? { note: input.note } : {}),
    });
  }

  const { pendingProtectedPathApproval: _pending, ...restRunner } = runnerState;
  return {
    task: {
      status: "APPROVED_FOR_EXECUTION",
      runnerState: {
        ...restRunner,
        protectedPathResumeRequested: true,
        note: "Protected path approval recorded. Resuming orchestration.",
      },
      blockedReasons: [],
    },
    resumeOrchestration: true,
    idempotent: pathsToApprove.length === 0,
  };
}

export function mergeProtectedPathApprovalRunState(input: {
  runnerState: RunnerState;
  evidence: Array<{ name?: string; summary?: string; details?: string }>;
  runId?: string | null;
  contractGoal: string;
  preserveExistingPending?: boolean;
}): RunnerState {
  const next: RunnerState = {
    ...input.runnerState,
    ...(input.runnerState.protectedPathApprovals
      ? { protectedPathApprovals: input.runnerState.protectedPathApprovals }
      : {}),
  };

  const stopEvidence = findProtectedPathApprovalEvidence(input.evidence, input.runId);
  if (!stopEvidence) {
    if (!input.preserveExistingPending && next.pendingProtectedPathApproval) {
      const { pendingProtectedPathApproval: _pending, ...rest } = next;
      return rest;
    }
    return next;
  }

  if (isProtectedPathAlreadyApproved(stopEvidence.path, next.protectedPathApprovals)) {
    if (next.pendingProtectedPathApproval) {
      const { pendingProtectedPathApproval: _pending, ...rest } = next;
      return rest;
    }
    return next;
  }

  next.pendingProtectedPathApproval = buildPendingProtectedPathApprovalRequest({
    path: stopEvidence.path,
    reason: describeProtectedPathApprovalReason({
      path: stopEvidence.path,
      contractGoal: input.contractGoal,
    }),
    ...(input.runId ? { runId: input.runId } : {}),
    operation: inferProtectedPathOperation(stopEvidence.path, input.contractGoal),
  });
  next.note = stopEvidence.reason;
  return next;
}
