import {
  type RunnerState,
  type TaskContract,
  type TaskStatus,
  zeroChangeRunnerState,
} from "@/lib/task-contract";
import { isOrchestrationInProgress } from "@/lib/evidence-analysis";

export const HUMAN_GATE_DECISIONS = [
  "APPROVE_COMMIT",
  "REQUEST_REVISION",
  "REJECT_CHANGES",
  "ESCALATE_REVIEW",
] as const;

export const SENSITIVE_APPROVAL_ACTIONS = ["COMMIT", "PUSH", "MERGE", "DEPLOY"] as const;

export type HumanGateDecision = (typeof HUMAN_GATE_DECISIONS)[number];
export type SensitiveApprovalAction = (typeof SENSITIVE_APPROVAL_ACTIONS)[number];

export type HumanApprovalRecord = {
  decision: HumanGateDecision;
  action: SensitiveApprovalAction;
  actorUserId: string;
  runId: string | null;
  note: string | null;
  reviewType?: AdditionalReviewType | null;
  createdAt: string;
};

export const ADDITIONAL_REVIEW_TYPES = ["technical", "security", "product", "other"] as const;

export type AdditionalReviewType = (typeof ADDITIONAL_REVIEW_TYPES)[number];

export const HUMAN_GATE_UI_OPTIONS: Array<{
  decision: HumanGateDecision;
  label: string;
  submitLabel: string;
}> = [
  { decision: "APPROVE_COMMIT", label: "Approve commit", submitLabel: "Setujui commit" },
  { decision: "REQUEST_REVISION", label: "Request revision", submitLabel: "Minta revisi" },
  { decision: "REJECT_CHANGES", label: "Reject changes", submitLabel: "Tolak perubahan" },
  { decision: "ESCALATE_REVIEW", label: "Request additional review", submitLabel: "Request additional review" },
];

export function humanApprovalSummary(
  decision: HumanGateDecision,
  action: SensitiveApprovalAction,
): string {
  switch (decision) {
    case "APPROVE_COMMIT":
      return `Human approved ${action.toLowerCase()} permission (not push/merge/deploy).`;
    case "REQUEST_REVISION":
      return "Human requested revision before delivery actions.";
    case "REJECT_CHANGES":
      return "Human rejected proposed changes.";
    case "ESCALATE_REVIEW":
      return "Human escalated for further review.";
  }
}

export function canRecordHumanApproval(status: TaskStatus): boolean {
  return status === "AWAITING_APPROVAL" || status === "PASS";
}

export function findExistingHumanApproval(
  runnerState: RunnerState | null,
  decision: HumanGateDecision,
  action: SensitiveApprovalAction,
  runId: string | null,
): HumanApprovalRecord | undefined {
  const match = runnerState?.humanApprovals?.find(
    (entry) => entry.decision === decision && entry.action === action && entry.runId === runId,
  );
  if (!match) {
    return undefined;
  }
  return match as HumanApprovalRecord;
}

export function isPendingHumanApproval(task: {
  status: TaskStatus;
  runnerState: RunnerState | null;
}): boolean {
  if (isOrchestrationInProgress(task.status)) {
    return false;
  }
  if (!canRecordHumanApproval(task.status)) {
    return false;
  }
  if (task.runnerState?.revisionRequested) {
    return false;
  }
  return !findExistingHumanApproval(task.runnerState, "APPROVE_COMMIT", "COMMIT", task.runnerState?.runId ?? null);
}

export function getHumanApprovalOutcome(task: {
  status: TaskStatus;
  runnerState: RunnerState | null;
}): {
  kind: "pending" | "commit_approved" | "revision_requested" | "rejected" | "escalated";
  title: string;
  description: string;
} | null {
  const runner = task.runnerState;
  if (runner?.commitApproved) {
    return {
      kind: "commit_approved",
      title: "Commit telah disetujui",
      description:
        "Anda telah memberikan izin untuk melakukan commit. Push, merge, dan deploy tetap memerlukan approval terpisah. Commit Git belum dijalankan otomatis oleh BuildLoop.",
    };
  }
  if (runner?.rejected) {
    return {
      kind: "rejected",
      title: "Perubahan ditolak",
      description: "Perubahan tidak akan melanjutkan tindakan sensitif. Task ditutup.",
    };
  }
  if (runner?.revisionRequested || task.status === "NEEDS_CORRECTION") {
    return {
      kind: "revision_requested",
      title: "Revisi diminta",
      description:
        "Revisi tercatat. Jalankan orchestrator kembali setelah menyesuaikan scope jika masih dalam batas koreksi otomatis.",
    };
  }
  if (runner?.escalated) {
    return {
      kind: "escalated",
      title: "Eskalasi review",
      description: "Review teknis atau manusia lebih lanjut diperlukan sebelum tindakan sensitif.",
    };
  }
  if (isPendingHumanApproval(task)) {
    return {
      kind: "pending",
      title: "Menunggu approval manusia",
      description: "Commit, push, merge, dan deploy membutuhkan approval terpisah.",
    };
  }
  return null;
}

export function applyHumanApproval(input: {
  task: {
    status: TaskStatus;
    runnerState: RunnerState | null;
    contract: TaskContract;
  };
  decision: HumanGateDecision;
  action: SensitiveApprovalAction;
  actorUserId: string;
  note?: string;
  reviewType?: AdditionalReviewType;
}): { status: TaskStatus; runnerState: RunnerState; auditDecision: HumanGateDecision } {
  const { task, decision, action, actorUserId, note, reviewType } = input;
  const trimmedNote = note?.trim() ?? "";
  const runId = task.runnerState?.runId ?? null;

  if (decision === "REQUEST_REVISION" && !trimmedNote) {
    throw new Error("Revision note is required.");
  }
  if (decision === "ESCALATE_REVIEW") {
    if (!reviewType) {
      throw new Error("Review type is required.");
    }
    if (!trimmedNote) {
      throw new Error("Additional review note is required.");
    }
  }

  const existing = findExistingHumanApproval(task.runnerState, decision, action, runId);
  if (existing) {
    return {
      status: task.status,
      runnerState: task.runnerState ?? zeroChangeRunnerState(""),
      auditDecision: decision,
    };
  }

  if (!canRecordHumanApproval(task.status)) {
    throw new Error("Approval tidak tersedia pada status task saat ini.");
  }

  if (decision === "APPROVE_COMMIT" && action !== "COMMIT") {
    throw new Error("Approve commit hanya berlaku untuk action COMMIT.");
  }

  const now = new Date().toISOString();
  const approval: HumanApprovalRecord = {
    decision,
    action,
    actorUserId,
    runId,
    note: trimmedNote ? trimmedNote : null,
    ...(reviewType ? { reviewType } : {}),
    createdAt: now,
  };

  const baseRunner = task.runnerState ?? zeroChangeRunnerState("");
  const runnerState: RunnerState = {
    ...baseRunner,
    humanApprovals: [...(baseRunner.humanApprovals ?? []), approval],
  };

  let nextStatus: TaskStatus = task.status;

  switch (decision) {
    case "APPROVE_COMMIT":
      runnerState.commitApproved = true;
      nextStatus = "CLOSED";
      break;
    case "REQUEST_REVISION": {
      runnerState.revisionRequested = true;
      runnerState.humanRevisionCount = (runnerState.humanRevisionCount ?? 0) + 1;
      runnerState.humanRevisionInstruction = trimmedNote;
      runnerState.lastAction = "human_revision";
      delete runnerState.commitApproved;
      nextStatus = "APPROVED_FOR_EXECUTION";
      break;
    }
    case "REJECT_CHANGES":
      runnerState.rejected = true;
      delete runnerState.commitApproved;
      nextStatus = "CLOSED";
      break;
    case "ESCALATE_REVIEW": {
      const resolvedReviewType = reviewType as AdditionalReviewType;
      runnerState.escalated = true;
      runnerState.pendingAdditionalReview = {
        reviewType: resolvedReviewType,
        note: trimmedNote,
      };
      delete runnerState.commitApproved;
      nextStatus = "AWAITING_APPROVAL";
      break;
    }
  }

  runnerState.decisionLog = [
    ...(baseRunner.decisionLog ?? []),
    {
      rule: "human_gate",
      summary: humanApprovalSummary(decision, action),
      nextStatus,
      verdict: decision,
    },
  ];

  return { status: nextStatus, runnerState, auditDecision: decision };
}
