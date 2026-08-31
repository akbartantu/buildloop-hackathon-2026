import { translate, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
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
