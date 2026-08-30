/**
 * Contract deterministik untuk BuildLoop.
 * Tidak ada AI di sini: satu goal menghasilkan satu contract yang sama.
 */

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

export type TaskContract = {
  goal: string;
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  allowedActions: string[];
  protectedPaths: string[];
  requiredChecks: string[];
  maxAttempts: number;
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
  }>;
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
