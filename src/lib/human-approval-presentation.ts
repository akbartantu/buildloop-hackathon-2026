import { translate, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import type { HumanApprovalFormError } from "@/lib/human-approval-input";
import {
  formatApprovalDecisionTimestamp,
  formatApprovalDecisionTimeOnly,
} from "@/lib/run-timing-presentation";
import {
  getHumanApprovalOutcome,
  HUMAN_GATE_DECISIONS,
  type HumanGateDecision,
} from "@/lib/human-approval";
import type { RunnerState, TaskStatus } from "@/lib/task-contract";

export type HumanApprovalOutcomeKind =
  | "pending"
  | "commit_approved"
  | "revision_requested"
  | "rejected"
  | "escalated";

export type HumanApprovalOutcomePresentation = {
  kind: HumanApprovalOutcomeKind;
  title: string;
  description: string;
};

function gateOptionKey(
  decision: HumanGateDecision,
  field: "label" | "submitLabel",
): TranslationKey {
  return `taskDetail.approval.gateOptions.${decision}.${field}` as TranslationKey;
}

function outcomeKey(
  kind: Exclude<HumanApprovalOutcomeKind, "commit_approved">,
  field: "title" | "description",
): TranslationKey {
  return `taskDetail.approval.outcome.${kind}.${field}` as TranslationKey;
}

export function formatHumanGateOptionLabel(decision: HumanGateDecision, locale: Locale): string {
  return translate(locale, gateOptionKey(decision, "label"));
}

export function formatHumanGateSubmitLabel(decision: HumanGateDecision, locale: Locale): string {
  return translate(locale, gateOptionKey(decision, "submitLabel"));
}

export function listHumanGateDecisions(): HumanGateDecision[] {
  return [...HUMAN_GATE_DECISIONS];
}

export function presentHumanApprovalOutcome(
  task: {
    status: TaskStatus;
    runnerState: RunnerState | null;
  },
  locale: Locale,
): HumanApprovalOutcomePresentation | null {
  const outcome = getHumanApprovalOutcome(task);
  if (!outcome) {
    return null;
  }

  if (outcome.kind === "commit_approved") {
    return {
      kind: outcome.kind,
      title: translate(locale, "taskDetail.approval.commitApprovedTitle"),
      description: translate(locale, "taskDetail.approval.commitApprovedBody"),
    };
  }

  if (outcome.kind === "revision_requested") {
    return {
      kind: outcome.kind,
      title: translate(locale, outcomeKey("revision_requested", "title")),
      description: formatRevisionOutcomeDescription(task, locale),
    };
  }

  if (outcome.kind === "escalated") {
    return {
      kind: outcome.kind,
      title: translate(locale, outcomeKey("escalated", "title")),
      description: `${translate(locale, outcomeKey("escalated", "description"))} ${translate(locale, "taskDetail.approval.additionalReviewNotRouted")}`,
    };
  }

  if (outcome.kind === "rejected") {
    const rejectionNote = task.runnerState?.humanApprovals
      ?.filter((entry) => entry.decision === "REJECT_CHANGES")
      .at(-1)?.note;
    const base = translate(locale, outcomeKey("rejected", "description"));
    return {
      kind: outcome.kind,
      title: translate(locale, outcomeKey("rejected", "title")),
      description: rejectionNote
        ? `${base} ${translate(locale, "taskDetail.approval.rejectionReasonRecorded", { note: rejectionNote })}`
        : base,
    };
  }

  return {
    kind: outcome.kind,
    title: translate(locale, outcomeKey(outcome.kind, "title")),
    description: translate(locale, outcomeKey(outcome.kind, "description")),
  };
}

const INDONESIAN_APPROVAL_UI_MARKERS = [
  "Setujui commit",
  "Kenapa BuildLoop merekomendasikannya",
  "Masalah yang masih perlu ditangani",
  "Menunggu approval manusia",
  "Commit telah disetujui",
  "Minta revisi",
  "Tolak perubahan",
  "Eskalasi review",
  "Permintaan review tambahan",
  "Perubahan ditolak",
  "Revisi diminta",
  "Anda telah memberikan izin",
  "Push, merge, dan deploy tetap",
] as const;

export function containsIndonesianApprovalUiCopy(text: string): boolean {
  return INDONESIAN_APPROVAL_UI_MARKERS.some((marker) => text.includes(marker));
}

export function collectApprovalUiCopy(input: {
  task: { status: TaskStatus; runnerState: RunnerState | null };
  locale: Locale;
  recommendation?: {
    label: string;
    description: string;
    reasonBullets: string[];
    unresolvedIssues: string[];
  };
}): string[] {
  const lines: string[] = [
    translate(input.locale, "taskDetail.approval.whyRecommended"),
    translate(input.locale, "taskDetail.approval.unresolvedIssues"),
  ];

  for (const decision of listHumanGateDecisions()) {
    lines.push(formatHumanGateOptionLabel(decision, input.locale));
    lines.push(formatHumanGateSubmitLabel(decision, input.locale));
  }

  const outcome = presentHumanApprovalOutcome(input.task, input.locale);
  if (outcome) {
    lines.push(outcome.title, outcome.description);
  }

  if (input.recommendation) {
    lines.push(
      input.recommendation.label,
      input.recommendation.description,
      ...input.recommendation.reasonBullets,
      ...input.recommendation.unresolvedIssues,
    );
  }

  return lines.filter(Boolean);
}

function decisionLabelKey(decision: HumanGateDecision): TranslationKey {
  return `taskDetail.approval.gateOptions.${decision}.label` as TranslationKey;
}

function reviewTypeLabelKey(reviewType: string): TranslationKey {
  return `taskDetail.approval.reviewTypes.${reviewType}` as TranslationKey;
}

export function formatHumanApprovalAuditEntry(
  entry: {
    decision: HumanGateDecision | string;
    createdAt: string;
    note: string | null;
    reviewType?: string | null;
    runId: string | null;
  },
  locale: Locale,
): {
  decisionLabel: string;
  timestamp: string;
  timestampTime: string;
  note: string | null;
  reviewTypeLabel: string | null;
  runId: string | null;
} {
  return {
    decisionLabel: translate(locale, decisionLabelKey(entry.decision as HumanGateDecision)),
    timestamp: formatApprovalDecisionTimestamp(entry.createdAt, locale),
    timestampTime: formatApprovalDecisionTimeOnly(entry.createdAt, locale),
    note: entry.note,
    reviewTypeLabel: entry.reviewType
      ? translate(locale, reviewTypeLabelKey(entry.reviewType))
      : null,
    runId: entry.runId,
  };
}

export function formatRevisionOutcomeDescription(
  task: { runnerState: RunnerState | null },
  locale: Locale,
): string {
  const base = translate(locale, "taskDetail.approval.outcome.revision_requested.description");
  const latest = task.runnerState?.humanApprovals
    ?.filter((entry) => entry.decision === "REQUEST_REVISION")
    .at(-1);
  const instruction =
    latest?.note ?? task.runnerState?.humanRevisionInstruction ?? null;
  if (!instruction) {
    return base;
  }
  return `${base} ${translate(locale, "taskDetail.approval.revisionNoteRecorded", { note: instruction })}`;
}

export function formatHumanApprovalValidationError(
  error: HumanApprovalFormError,
  locale: Locale,
): string {
  return translate(locale, `taskDetail.approval.validation.${error}` as TranslationKey);
}
