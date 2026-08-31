import type { RunnerState, TaskStatus } from "@/lib/task-contract";
import { zeroChangeRunnerState } from "@/lib/task-contract";
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

export type PersistedEvidenceItem = NonNullable<RunnerState["evidence"]>[number];

const PATH_FROM_STOP_MESSAGE =
  /protected path approval required before writing:\s*(.+)$/i;
const PATH_FROM_QUOTED_POLICY =
  /protected path "([^"]+)" requires(?: explicit human approval)?/i;
const PATH_FROM_DETAILS_CODE =
  /PROTECTED_PATH_APPROVAL_REQUIRED(?::\s*)?(?:Protected path approval required before writing:\s*)?(.+?)$/i;
const PATH_FROM_FORBIDDEN_PATCH =
  /patch rejected for out-of-scope or protected path:\s*(.+)$/i;

export type WorkerReportStopInput = {
  error?: {
    code: string;
    message: string;
    path?: string;
    operation?: "create" | "modify";
  };
  filesChanged?: string[];
};

const PATH_FROM_STRUCTURED_EVIDENCE =
  /"path"\s*:\s*"([^"]+)"/i;

const PROTECTED_PATH_EVIDENCE_NAMES = new Set([
  "protected_path_approval_required",
  "worker_error",
  "runtime_escalation_approval",
]);

export function parseProtectedPathFromStopMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }

  const patterns = [
    PATH_FROM_STOP_MESSAGE,
    PATH_FROM_QUOTED_POLICY,
    PATH_FROM_DETAILS_CODE,
    PATH_FROM_FORBIDDEN_PATCH,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const candidate = match?.[1]?.replace(/\\/g, "/").trim();
    if (candidate) {
      return candidate.split(/\s+/)[0] ?? candidate;
    }
  }

  return null;
}

export function parseProtectedPathFromWorkerError(text: string): string | null {
  return parseProtectedPathFromStopMessage(text);
}

export function isProtectedPathWorkerErrorCode(code: string | undefined): boolean {
  return code === "PROTECTED_PATH_APPROVAL_REQUIRED";
}

export function extractProtectedPathStopFromWorkerReports(
  workerReports: WorkerReportStopInput[] | undefined,
  runId?: string | null,
): ProtectedPathApprovalEvidence | null {
  if (!workerReports?.length) {
    return null;
  }

  for (const report of [...workerReports].reverse()) {
    const error = report.error;
    if (!error) {
      continue;
    }

    if (isProtectedPathWorkerErrorCode(error.code)) {
      const path =
        error.path?.replace(/\\/g, "/") ?? parseProtectedPathFromStopMessage(error.message);
      if (path) {
        return {
          path,
          reason: error.message,
          ...(runId ? { runId } : {}),
        };
      }
    }

    const fallbackPath = parseProtectedPathFromWorkerError(error.message);
    if (fallbackPath) {
      return {
        path: fallbackPath,
        reason: error.message,
        ...(runId ? { runId } : {}),
      };
    }
  }

  return null;
}

export function isProtectedPathApprovalPause(task: {
  runnerState: RunnerState | null;
  status?: TaskStatus;
}): boolean {
  if (isPendingProtectedPathApproval(task)) {
    return true;
  }
  if (task.runnerState?.rejected) {
    return false;
  }
  if (task.status !== "AWAITING_APPROVAL") {
    return false;
  }
  if ((task.runnerState?.filesChanged ?? 0) > 0) {
    return false;
  }
  return Boolean(findProtectedPathApprovalEvidence(task.runnerState?.evidence, task.runnerState?.runId));
}

function evidenceItemIndicatesProtectedPathStop(item: PersistedEvidenceItem): boolean {
  if (PROTECTED_PATH_EVIDENCE_NAMES.has(item.name)) {
    return true;
  }
  const haystack = `${item.summary ?? ""}\n${"details" in item ? String(item.details ?? "") : ""}`;
  return /PROTECTED_PATH_APPROVAL_REQUIRED|protected path approval required before writing/i.test(haystack);
}

export function shouldPersistEvidenceDetails(item: {
  name?: string;
  details?: string;
}): boolean {
  if (!item.name) {
    return false;
  }
  if (PROTECTED_PATH_EVIDENCE_NAMES.has(item.name)) {
    return true;
  }
  return Boolean(item.details?.includes("PROTECTED_PATH_APPROVAL_REQUIRED"));
}

export function summarizeEvidenceForTaskPersistence(
  evidence: Array<{
    category: string;
    name: string;
    status: string;
    summary: string;
    attemptNumber?: number;
    details?: string;
  }>,
): PersistedEvidenceItem[] {
  return evidence.map((item) => ({
    category: item.category,
    name: item.name,
    status: item.status,
    summary: item.summary,
    ...(item.attemptNumber !== undefined ? { attemptNumber: item.attemptNumber } : {}),
    ...(shouldPersistEvidenceDetails(item) && item.details ? { details: item.details } : {}),
  }));
}

function extractPathFromEvidenceEntry(entry: PersistedEvidenceItem): string | null {
  const details = "details" in entry ? String(entry.details ?? "") : "";
  const structuredPath = parseProtectedPathFromStructuredEvidence(details);
  if (structuredPath) {
    return structuredPath;
  }

  const candidates = [entry.summary ?? "", details];
  for (const candidate of candidates) {
    const path = parseProtectedPathFromWorkerError(candidate);
    if (path) {
      return path;
    }
  }
  return null;
}

function parseProtectedPathFromStructuredEvidence(details: string): string | null {
  const trimmed = details.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as { code?: string; path?: string };
    if (parsed.code === "PROTECTED_PATH_APPROVAL_REQUIRED" && parsed.path?.trim()) {
      return parsed.path.replace(/\\/g, "/");
    }
  } catch {
    const match = trimmed.match(PATH_FROM_STRUCTURED_EVIDENCE);
    return match?.[1]?.replace(/\\/g, "/") ?? null;
  }
  return null;
}

export function findProtectedPathApprovalEvidence(
  evidence: Array<PersistedEvidenceItem & { details?: string }> | undefined,
  runId?: string | null,
): ProtectedPathApprovalEvidence | null {
  if (!evidence?.length) {
    return null;
  }

  for (const entry of [...evidence].reverse()) {
    if (!evidenceItemIndicatesProtectedPathStop(entry)) {
      continue;
    }
    const path = extractPathFromEvidenceEntry(entry);
    if (!path) {
      continue;
    }
    return {
      path,
      reason: entry.summary ?? ("details" in entry ? String(entry.details ?? "") : "") ?? path,
      ...(runId ? { runId } : {}),
    };
  }

  return null;
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
  const normalizedPath = input.path.replace(/\\/g, "/");
  const operation =
    input.operation ??
    (input.contractGoal ? inferProtectedPathOperation(input.path, input.contractGoal) : "modify");

  if (
    normalizedPath === "package.json" &&
    input.contractGoal &&
    /\b(initializ|bootstrap|scaffold|foundation|baseline|next\.?js|frontend)\b/i.test(input.contractGoal)
  ) {
    return "The approved Next.js frontend bootstrap requires creating or modifying this protected dependency manifest.";
  }

  if (normalizedPath === "bun.lock" && operation === "create") {
    return "The approved frontend bootstrap may require creating this protected lockfile after package manifest approval.";
  }

  if (operation === "create") {
    return `BuildLoop needs to create this protected file (${normalizedPath}) to establish the approved task baseline.`;
  }
  return `BuildLoop needs to modify this protected file (${normalizedPath}) to complete the approved task scope.`;
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

export function isProtectedPathApprovalStop(task: TaskRecord): boolean {
  if (task.runnerState?.rejected) {
    return false;
  }
  if (isPendingProtectedPathApproval(task)) {
    return true;
  }
  if (task.status !== "AWAITING_APPROVAL") {
    return false;
  }
  if ((task.runnerState?.filesChanged ?? 0) > 0) {
    return false;
  }
  return Boolean(findProtectedPathApprovalEvidence(task.runnerState?.evidence, task.runnerState?.runId));
}

export function shouldPreferProtectedPathApprovalSurface(task: TaskRecord): boolean {
  return isPendingProtectedPathApproval(task) || isProtectedPathApprovalStop(task);
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
  evidence: Array<PersistedEvidenceItem & { details?: string }>;
  runId?: string | null;
  contractGoal: string;
  preserveExistingPending?: boolean;
  explicitStop?: ProtectedPathApprovalEvidence | null;
}): RunnerState {
  const next: RunnerState = {
    ...input.runnerState,
    ...(input.runnerState.protectedPathApprovals
      ? { protectedPathApprovals: input.runnerState.protectedPathApprovals }
      : {}),
  };

  const stopEvidence =
    input.explicitStop ?? findProtectedPathApprovalEvidence(input.evidence, input.runId);
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
  next.note =
    "Worker paused before protected-path write pending human approval. No protected files were changed.";
  return next;
}

export function finalizeRunnerStateAfterOrchestration(input: {
  baseRunner: RunnerState;
  verdict: string | null;
  evidence: Array<{
    category: string;
    name: string;
    status: string;
    summary: string;
    attemptNumber?: number;
    details?: string;
  }>;
  contractGoal: string;
  blockedPreflightNote?: string;
  workerReports?: WorkerReportStopInput[];
}): RunnerState {
  const evidenceSummary = summarizeEvidenceForTaskPersistence(input.evidence);
  const workerReportStop = extractProtectedPathStopFromWorkerReports(
    input.workerReports,
    input.baseRunner.runId,
  );
  const evidenceStop = findProtectedPathApprovalEvidence(input.evidence, input.baseRunner.runId);
  const resolvedStop = workerReportStop ?? evidenceStop;
  const protectedPathStop = Boolean(resolvedStop);

  const seededRunner: RunnerState =
    input.verdict === "BLOCKED" && !protectedPathStop
      ? {
          ...zeroChangeRunnerState(
            input.blockedPreflightNote ??
              "Runner tidak dipanggil karena task dihentikan oleh pre-flight check.",
          ),
          ...(input.baseRunner.runId ? { runId: input.baseRunner.runId } : {}),
          evidence: evidenceSummary,
        }
      : {
          ...input.baseRunner,
          evidence: evidenceSummary,
        };

  return mergeProtectedPathApprovalRunState({
    runnerState: seededRunner,
    evidence: evidenceSummary,
    ...(input.baseRunner.runId ? { runId: input.baseRunner.runId } : {}),
    contractGoal: input.contractGoal,
    preserveExistingPending: false,
    explicitStop: resolvedStop,
  });
}

export function hydrateTaskProtectedPathApproval(task: TaskRecord): TaskRecord {
  if (!task.runnerState || task.runnerState.rejected) {
    return task;
  }
  if (isPendingProtectedPathApproval(task)) {
    return task;
  }
  if (!isProtectedPathApprovalStop(task)) {
    return task;
  }

  const merged = mergeProtectedPathApprovalRunState({
    runnerState: task.runnerState,
    evidence: task.runnerState.evidence ?? [],
    ...(task.runnerState.runId ? { runId: task.runnerState.runId } : {}),
    contractGoal: task.goal,
    preserveExistingPending: true,
  });

  if (!isPendingProtectedPathApproval({ runnerState: merged, status: task.status })) {
    return task;
  }

  return {
    ...task,
    runnerState: merged,
  };
}

export function resolveApprovalSurface(task: TaskRecord): "protected_path" | "commit" | "not_ready" {
  if (shouldPreferProtectedPathApprovalSurface(task)) {
    return "protected_path";
  }
  if (task.status === "AWAITING_APPROVAL" || task.status === "PASS") {
    return "commit";
  }
  return "not_ready";
}
