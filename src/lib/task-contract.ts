/**
 * Contract deterministik untuk BuildLoop.
 * Planner mendekomposisi goal; buildContract tetap fallback deterministik.
 */

import type { PlanningSource, TaskClarification } from "@/lib/planning/planning-source";
import type { ContractInputsSnapshot, TaskRunSnapshot } from "@/lib/task-rerun";
import type { ChangeArtifact } from "@/lib/change-artifact";
import type { DeliveryHandoff } from "@/lib/delivery-artifact";

export const WORKSPACE_NAME = "buildloop-demo";
export const MAX_ATTEMPTS = 2;

/** Sumber tunggal protected paths untuk UI maupun detector server-side. */
export const PROTECTED_PATHS = [
  ".env*",
  ".github/workflows/**",
  "infrastructure/**",
  "supabase/migrations/**",
  "src/integrations/supabase/**",
  "src/orchestrator/**",
  "package.json",
  "bun.lock",
] as const;

export const ALLOWED_ACTIONS = [
  "Membaca file project",
  "Mengedit kode aplikasi di dalam approved scope",
  "Menambah atau memperbarui test yang relevan",
  "Menjalankan check dari allowlist",
] as const;

export const REQUIRED_CHECKS = ["typecheck", "test yang relevan", "protected-path check"] as const;

/**
 * Status task. Slice ini hanya pernah men-set DRAFT, CONTRACT_READY,
 * APPROVED_FOR_EXECUTION, dan BLOCKED. Sisanya disiapkan untuk slice runner.
 *
 * Catatan aturan: check yang tetap gagal setelah MAX_ATTEMPTS koreksi
 * menghasilkan FAILED, bukan BLOCKED. BLOCKED khusus untuk pelanggaran batas.
 */
export const TASK_STATUSES = [
  "DRAFT",
  "CONTRACT_READY",
  "APPROVED_FOR_EXECUTION",
  "BLOCKED",
  "RUNNING",
  "CHECKING",
  "NEEDS_CORRECTION",
  "PASS",
  "FAILED",
  "AWAITING_APPROVAL",
  "INSPECTING",
  "CLOSED",
  "STALE",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type ApprovalType = "AUTO_APPROVED_BY_POLICY" | "APPROVED_BY_HUMAN" | null;

export type OrchestrationEvidence = {
  phase: string;
  plannerOutput?: string;
  approvalType?: ApprovalType;
  policyDecision?: string;
  policyReason?: string;
  workerInvoked?: boolean;
  securityReviewInvoked?: boolean;
  securityFindings?: Array<{
    severity: string;
    finding: string;
    evidence: string;
  }>;
  correctionCount?: number;
  finalVerdict?: string | null;
  contracts?: Array<{
    id: string;
    goal: string;
    status: string;
    approvalState: string;
  }>;
};

export type TaskContract = {
  goal: string;
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  allowedActions: string[];
  protectedPaths: string[];
  requiredChecks: string[];
  maxAttempts: number;
  workPlan?: {
    userGoal: string;
    decomposed: boolean;
    plannerSummary: string;
    contracts: Array<{
      id: string;
      goal: string;
      acceptanceCriteria: string[];
      expectedScope: string[];
      dependencies: string[];
      riskClassification: string;
      approvalState: string;
      status: string;
    }>;
  };
  sourcesUsed?: PlanningSource[];
  clarification?: TaskClarification;
  planningSummary?: string;
};

export type HumanApprovalRecord = {
  decision: string;
  action: string;
  actorUserId: string;
  runId: string | null;
  note: string | null;
  createdAt: string;
};

export type RunnerState = {
  runnerInvoked: boolean;
  filesChanged: number;
  commandsExecuted: number;
  commit: boolean;
  push: boolean;
  note: string;
  runId?: string;
  workerId?: string;
  correctionCount?: number;
  humanRevisionCount?: number;
  lastAction?: "worker" | "correction" | "human_revision";
  commitApproved?: boolean;
  revisionRequested?: boolean;
  rejected?: boolean;
  escalated?: boolean;
  operationalError?: string;
  gitBaseline?: {
    repoPath: string;
    branch: string;
    headSha: string;
    dirty: boolean;
    worktreePath?: string;
  };
  humanApprovals?: HumanApprovalRecord[];
  evidence?: Array<{
    category: string;
    name: string;
    status: string;
    summary: string;
    attemptNumber?: number;
  }>;
  decisionLog?: Array<{
    rule: string;
    summary: string;
    nextStatus: string;
    verdict: string | null;
    outcome?: string;
  }>;
  orchestration?: OrchestrationEvidence;
  /** Snapshot of contract inputs at lock time — used to detect silent contract drift before re-run. */
  lockedContractInputs?: ContractInputsSnapshot;
  /** Archived completed runs for this task. */
  runHistory?: TaskRunSnapshot[];
  /** Set while preparing a failed-task re-run (similar to revisionRequested). */
  rerunRequested?: boolean;
  /** Sanitized unified diff captured before sandbox cleanup. */
  changeArtifact?: ChangeArtifact;
  /** Exact verified patch and commit suggestions for manual delivery after approval. */
  deliveryHandoff?: DeliveryHandoff;
};

/** Evidence nol-perubahan: dipakai untuk BLOCKED dan untuk status siap-runner. */
export function zeroChangeRunnerState(note: string): RunnerState {
  return {
    runnerInvoked: false,
    filesChanged: 0,
    commandsExecuted: 0,
    commit: false,
    push: false,
    note,
  };
}

export function buildContract(goal: string): TaskContract {
  return {
    goal: goal.trim(),
    inScope: ["File sumber aplikasi yang relevan", "Test yang relevan"],
    outOfScope: [
      "Deployment dan infrastruktur",
      "Credential dan secret",
      "Dependency dan lockfile",
      "Database dan migration",
      "Refactoring yang tidak terkait",
    ],
    acceptanceCriteria: [
      "Perilaku yang diminta diimplementasikan.",
      "Check yang relevan lolos.",
      "Tidak ada protected path yang berubah.",
    ],
    allowedActions: [...ALLOWED_ACTIONS],
    protectedPaths: [...PROTECTED_PATHS],
    requiredChecks: [...REQUIRED_CHECKS],
    maxAttempts: MAX_ATTEMPTS,
  };
}
