import type { TaskStatus } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { translate, type Locale, DEFAULT_LOCALE } from "@/i18n";
import { formatChecksFriendlySummary } from "@/lib/lifecycle-presentations";

export type EvidenceRow = {
  category: string;
  name: string;
  status: string;
  summary: string;
  attemptNumber?: number;
};

export type CorrectionPhase =
  | "none"
  | "preparing"
  | "applying"
  | "verifying"
  | "verified"
  | "failed"
  | "exhausted";

export type CheckBreakdownCore = {
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  total: number;
  allRequiredSatisfied: boolean;
  friendlySummary: string;
  technicalSummary: string;
};

export type CorrectionPresentation = {
  phase: CorrectionPhase;
  kind: "none" | "automatic" | "human";
  userSummary: string;
  automaticUsed: number;
  automaticLimit: number;
  humanRevisionCount: number;
};

function evidenceRows(task: TaskRecord): EvidenceRow[] {
  return (task.runnerState?.evidence ?? []) as EvidenceRow[];
}

export function finalAttemptNumber(task: TaskRecord): number {
  const rows = evidenceRows(task);
  const fromEvidence = rows.reduce(
    (max, row) => Math.max(max, row.attemptNumber ?? 0),
    0,
  );
  const runner = task.runnerState;
  if (fromEvidence > 0) return fromEvidence;
  if (runner?.runnerInvoked) {
    return (runner.correctionCount ?? 0) + 1;
  }
  return 0;
}

/** Current-state checks use only the latest attempt — not accumulated history. */
export function analyzeFinalChecks(task: TaskRecord, locale: Locale = DEFAULT_LOCALE): CheckBreakdownCore {
  const attempt = finalAttemptNumber(task);
  const all = evidenceRows(task);
  const items =
    attempt > 0
      ? all.filter((row) => (row.attemptNumber ?? attempt) === attempt)
      : all;

  const passed = items.filter((item) => item.status === "pass").length;
  const failed = items.filter((item) => item.status === "fail").length;
  const skipped = items.filter((item) => item.status === "skipped").length;
  const blocked = items.filter((item) => item.status === "blocked").length;
  const total = items.length;
  const allRequiredSatisfied = failed === 0 && blocked === 0;

  const friendlySummary = formatChecksFriendlySummary(
    { passed, failed, skipped, blocked, total, allRequiredSatisfied },
    locale,
  );

  const technicalSummary =
    total > 0
      ? `${passed} passed · ${failed} failed · ${skipped} skipped · ${blocked} blocked (attempt ${attempt || "—"})`
      : "—";

  return {
    passed,
    failed,
    skipped,
    blocked,
    total,
    allRequiredSatisfied,
    friendlySummary,
    technicalSummary,
  };
}

export function buildEvidenceHistory(task: TaskRecord): Array<{
  attemptNumber: number;
  label: string;
  checks: string;
  outcome: string;
}> {
  const all = evidenceRows(task);
  const attempts = [...new Set(all.map((row) => row.attemptNumber ?? 0))].filter((n) => n > 0).sort();
  return attempts.map((attemptNumber) => {
    const items = all.filter((row) => (row.attemptNumber ?? attemptNumber) === attemptNumber);
    const passed = items.filter((i) => i.status === "pass").length;
    const failed = items.filter((i) => i.status === "fail").length;
    const blocked = items.filter((i) => i.status === "blocked").length;
    const outcome =
      blocked > 0 ? "BLOCKED" : failed > 0 ? "FAILED" : passed > 0 ? "PASS" : "UNKNOWN";
    return {
      attemptNumber,
      label: `Attempt ${attemptNumber}`,
      checks: `${passed} passed, ${failed} failed${blocked > 0 ? `, ${blocked} blocked` : ""}`,
      outcome,
    };
  });
}

export function deriveCorrectionPresentation(
  task: TaskRecord,
  checks: CheckBreakdownCore,
  implementationVerdict: "PASS" | "FAILED" | "BLOCKED" | null,
  locale: Locale = DEFAULT_LOCALE,
): CorrectionPresentation {
  const runner = task.runnerState;
  const automaticUsed = runner?.correctionCount ?? 0;
  const automaticLimit = task.contract.maxAttempts;
  const humanRevisionCount = runner?.humanRevisionCount ?? 0;
  const isHumanRevision = Boolean(runner?.revisionRequested);

  if (isHumanRevision && task.status === "APPROVED_FOR_EXECUTION") {
    return {
      phase: "preparing",
      kind: "human",
      userSummary: translate(locale, "lifecycle.correction.humanRevisionReady"),
      automaticUsed,
      automaticLimit,
      humanRevisionCount,
    };
  }

  if (humanRevisionCount > 0 && ["INSPECTING", "RUNNING", "CHECKING"].includes(task.status)) {
    return {
      phase: task.status === "CHECKING" ? "verifying" : "applying",
      kind: "human",
      userSummary: translate(locale, "lifecycle.correction.humanRevisionRunning"),
      automaticUsed,
      automaticLimit,
      humanRevisionCount,
    };
  }

  switch (task.status) {
    case "NEEDS_CORRECTION":
      return {
        phase: "preparing",
        kind: "automatic",
        userSummary: translate(locale, "lifecycle.correction.preparing", {
          next: automaticUsed + 1,
          limit: automaticLimit,
        }),
        automaticUsed,
        automaticLimit,
        humanRevisionCount,
      };
    case "RUNNING":
      if (automaticUsed > 0 || runner?.lastAction === "correction") {
        return {
          phase: "applying",
          kind: "automatic",
          userSummary: translate(locale, "lifecycle.correction.applying", {
            used: automaticUsed,
            limit: automaticLimit,
          }),
          automaticUsed,
          automaticLimit,
          humanRevisionCount,
        };
      }
      break;
    case "CHECKING":
      if (automaticUsed > 0) {
        return {
          phase: "verifying",
          kind: "automatic",
          userSummary: translate(locale, "lifecycle.correction.verifying", {
            used: automaticUsed,
            limit: automaticLimit,
          }),
          automaticUsed,
          automaticLimit,
          humanRevisionCount,
        };
      }
      break;
    case "FAILED":
      return {
        phase: "exhausted",
        kind: "automatic",
        userSummary: translate(locale, "lifecycle.summary.correctionExhausted"),
        automaticUsed,
        automaticLimit,
        humanRevisionCount,
      };
    default:
      break;
  }

  if (automaticUsed > 0 && implementationVerdict === "PASS" && checks.allRequiredSatisfied) {
    return {
      phase: "verified",
      kind: "automatic",
      userSummary: translate(locale, "lifecycle.correction.verified", { count: automaticUsed }),
      automaticUsed,
      automaticLimit,
      humanRevisionCount,
    };
  }

  if (automaticUsed > 0 && !checks.allRequiredSatisfied && implementationVerdict !== "FAILED") {
    return {
      phase: "failed",
      kind: "automatic",
      userSummary: "Perbaikan belum menyelesaikan masalah.",
      automaticUsed,
      automaticLimit,
      humanRevisionCount,
    };
  }

  return {
    phase: "none",
    kind: "none",
    userSummary: "",
    automaticUsed,
    automaticLimit,
    humanRevisionCount,
  };
}

/** Approval is actionable only after decision PASS on AWAITING_APPROVAL. */
export function isApprovalGateOpen(task: {
  status: TaskStatus;
  runnerState: TaskRecord["runnerState"];
}): boolean {
  if (task.status !== "AWAITING_APPROVAL" && task.status !== "PASS") {
    return false;
  }
  if (task.runnerState?.revisionRequested) {
    return false;
  }
  const checks = analyzeFinalChecks(task as TaskRecord);
  if (checks.total === 0 || !checks.allRequiredSatisfied) {
    return false;
  }
  return true;
}

export function isOrchestrationInProgress(status: TaskStatus): boolean {
  return ["INSPECTING", "RUNNING", "CHECKING", "NEEDS_CORRECTION"].includes(status);
}
