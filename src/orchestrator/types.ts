/** Canonical run/task statuses for BuildLoop orchestration. */
export const RUN_STATUSES = [
  "DRAFT",
  "CONTRACT_READY",
  "APPROVED_FOR_EXECUTION",
  "INSPECTING",
  "RUNNING",
  "CHECKING",
  "NEEDS_CORRECTION",
  "PASS",
  "FAILED",
  "BLOCKED",
  "AWAITING_APPROVAL",
  "CLOSED",
  "STALE",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export type Verdict = "PASS" | "FAILED" | "BLOCKED" | null;

export const APPROVAL_ACTIONS = ["execute", "commit", "push", "merge", "deploy"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export type EvidenceCategory =
  | "preflight"
  | "scope"
  | "protected_path"
  | "credential"
  | "dependency"
  | "command"
  | "typecheck"
  | "build"
  | "test"
  | "acceptance"
  | "manifest"
  | "decision";

export type EvidenceSeverity = "info" | "warning" | "error" | "critical";

export type CheckerEvidence = {
  id: string;
  runId: string;
  attemptNumber: number;
  category: EvidenceCategory;
  name: string;
  status: "pass" | "fail" | "blocked" | "skipped";
  summary: string;
  details: string;
  command?: string;
  exitCode?: number;
  affectedFiles: string[];
  severity: EvidenceSeverity;
  createdAt: string;
};

export type DecisionLogEntry = {
  id: string;
  runId: string;
  attemptNumber: number;
  previousStatus: RunStatus;
  nextStatus: RunStatus;
  verdict: Verdict;
  rule: string;
  evidenceIds: string[];
  summary: string;
  createdAt: string;
};

export type WorkerReport = {
  workerId: string;
  attemptNumber: number;
  filesChanged: string[];
  commandsRequested: string[];
  commandsExecuted: string[];
  summary: string;
  patchSummary: string;
  error?: { code: string; message: string };
  usageMetadata?: Record<string, string | number>;
};

export type RunCounters = {
  workerCalls: number;
  checkerCalls: number;
  correctionCount: number;
  filesChanged: number;
  commandsExecuted: number;
};

export type RunSnapshot = {
  id: string;
  taskId: string;
  contractId: string;
  contractVersion: number;
  status: RunStatus;
  verdict: Verdict;
  verdictReason: string | null;
  sourceRevision: string;
  workerId: string;
  attemptNumber: number;
  counters: RunCounters;
  startedAt: string;
  completedAt: string | null;
};
