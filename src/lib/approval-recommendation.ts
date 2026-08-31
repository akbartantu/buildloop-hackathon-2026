import type { TaskRecord } from "@/lib/tasks-schema";
import type { TaskLifecycleViewModel } from "@/lib/task-lifecycle";
import { canRecordHumanApproval } from "@/lib/human-approval";
import { translate, type Locale, DEFAULT_LOCALE } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import {
  formatBlockedReasonExplanationList,
  formatPrimaryBlockedExplanation,
} from "@/lib/blocked-reason-presentation";
import { isPendingProtectedPathApproval, isProtectedPathApprovalStop } from "@/lib/protected-path-approval-flow";

export type TaskLifecycleCore = Omit<TaskLifecycleViewModel, "approval" | "progress" | "evidenceSummary">;

export type ApprovalRecommendationKind =
  | "RECOMMENDED_APPROVE"
  | "FIX_FIRST"
  | "HUMAN_REVIEW_REQUIRED";

export type CorrectionTimelineEntry = {
  phase: string;
  detail: string;
};

export type HistoricalCorrectionView = {
  issueCount: number;
  summary: string;
  timeline: CorrectionTimelineEntry[];
};

export type ApprovalRecommendationView = {
  kind: ApprovalRecommendationKind;
  label: string;
  description: string;
  reasonBullets: string[];
  unresolvedIssues: string[];
  historicalCorrection: HistoricalCorrectionView | null;
  finalChecksSummary: string;
  overviewSummary: string;
  canRecommendApprove: boolean;
  commitAutomationNote: string | null;
};

type EvidenceItem = NonNullable<TaskRecord["runnerState"]>["evidence"] extends infer E
  ? E extends Array<infer I>
    ? I
    : never
  : never;

const SENSITIVE_CATEGORIES = new Set(["protected_path", "credential", "dependency"]);

function evidenceItems(task: TaskRecord): EvidenceItem[] {
  return (task.runnerState?.evidence ?? []) as EvidenceItem[];
}

function finalFailedOrBlocked(items: EvidenceItem[]): EvidenceItem[] {
  return items.filter((item) => item.status === "fail" || item.status === "blocked");
}

function hasSensitiveUnresolved(items: EvidenceItem[]): boolean {
  return finalFailedOrBlocked(items).some((item) => SENSITIVE_CATEGORIES.has(item.category));
}

function plainLanguageIssue(item: EvidenceItem, locale: Locale): string {
  if (item.summary && !item.summary.match(/^[a-z_]+:/i)) {
    return item.summary.endsWith(".") ? item.summary : `${item.summary}.`;
  }
  const keyByCategory: Record<string, TranslationKey> = {
    acceptance: "lifecycle.approvalRecommendation.unresolvedAcceptance",
    protected_path: "lifecycle.approvalRecommendation.unresolvedProtected",
    credential: "lifecycle.approvalRecommendation.unresolvedCredential",
    dependency: "lifecycle.approvalRecommendation.unresolvedDependency",
    scope: "lifecycle.approvalRecommendation.unresolvedScope",
  };
  const key = keyByCategory[item.category] ?? "lifecycle.approvalRecommendation.unresolvedGeneric";
  return translate(locale, key);
}

function buildReasonBullets(
  task: TaskRecord,
  lifecycle: TaskLifecycleCore,
  locale: Locale,
): string[] {
  const bullets: string[] = [];
  const items = evidenceItems(task);

  if (lifecycle.checks.allRequiredSatisfied && lifecycle.checks.total > 0) {
    bullets.push(translate(locale, "lifecycle.approvalRecommendation.allFinalPassed"));
  }

  if (lifecycle.implementationVerdict === "PASS") {
    bullets.push(translate(locale, "lifecycle.approvalRecommendation.checkerVerified"));
  }

  if (items.some((item) => item.category === "scope" && item.status === "pass")) {
    bullets.push(translate(locale, "lifecycle.approvalRecommendation.scopeMatched"));
  } else if (lifecycle.hasRun && lifecycle.isPassLike && items.length === 0) {
    // No scope evidence row — omit rather than claim.
  } else if (lifecycle.isPassLike && task.runnerState?.filesChanged !== undefined) {
    bullets.push(translate(locale, "lifecycle.approvalRecommendation.scopeMatched"));
  }

  const protectedPass = items.find(
    (item) => item.category === "protected_path" && item.status === "pass",
  );
  if (protectedPass) {
    bullets.push(translate(locale, "lifecycle.approvalRecommendation.noProtectedChanged"));
  }

  const dependencyPass = items.find(
    (item) => item.category === "dependency" && item.status === "pass",
  );
  if (dependencyPass) {
    bullets.push(translate(locale, "lifecycle.approvalRecommendation.noNewDependencies"));
  }

  const credentialPass = items.every(
    (item) => item.category !== "credential" || item.status === "pass",
  );
  const hasCredentialCheck = items.some((item) => item.category === "credential");
  if (hasCredentialCheck && credentialPass) {
    bullets.push(translate(locale, "lifecycle.approvalRecommendation.noCredentialsTouched"));
  }

  return bullets;
}

function buildHistoricalCorrection(
  task: TaskRecord,
  lifecycle: TaskLifecycleCore,
  locale: Locale,
): HistoricalCorrectionView | null {
  const corrections = lifecycle.correctionsUsed;
  if (corrections <= 0) {
    return null;
  }

  const log = task.runnerState?.decisionLog ?? [];
  const correctionEntries = log.filter((entry) => entry.rule === "CORRECTION_ALLOWED");
  const timeline: CorrectionTimelineEntry[] = [];

  correctionEntries.forEach((entry, index) => {
    timeline.push({
      phase: translate(locale, "lifecycle.approvalRecommendation.timelineAttempt", {
        number: index + 1,
      }),
      detail: entry.summary || translate(locale, "lifecycle.approvalRecommendation.historicalCheckFailed"),
    });
    timeline.push({
      phase: translate(locale, "lifecycle.approvalRecommendation.timelineCorrection"),
      detail: translate(locale, "lifecycle.approvalRecommendation.historicalCorrectionApplied"),
    });
  });

  if (correctionEntries.length === 0 && corrections > 0) {
    timeline.push({
      phase: translate(locale, "lifecycle.approvalRecommendation.timelineCorrection"),
      detail: translate(locale, "lifecycle.approvalRecommendation.historicalCorrectionGeneric"),
    });
  }

  if (lifecycle.checks.allRequiredSatisfied && lifecycle.implementationVerdict === "PASS") {
    timeline.push({
      phase: translate(locale, "lifecycle.approvalRecommendation.timelineFinalCheck"),
      detail: translate(locale, "lifecycle.approvalRecommendation.historicalFinalPassed"),
    });
  }

  const verified =
    lifecycle.checks.allRequiredSatisfied && lifecycle.implementationVerdict === "PASS";
  return {
    issueCount: corrections,
    summary: verified
      ? translate(locale, "lifecycle.approvalRecommendation.historicalVerified", {
          count: corrections,
        })
      : translate(locale, "lifecycle.approvalRecommendation.historicalUnresolved", {
          count: corrections,
        }),
    timeline,
  };
}

function buildFinalChecksSummary(lifecycle: TaskLifecycleCore, locale: Locale): string {
  if (lifecycle.checks.total === 0) {
    return translate(locale, "lifecycle.approvalRecommendation.noFinalChecks");
  }
  if (lifecycle.checks.allRequiredSatisfied) {
    return translate(locale, "lifecycle.approvalRecommendation.allFinalPassed");
  }
  return lifecycle.checks.friendlySummary;
}

function buildOverviewSummary(
  kind: ApprovalRecommendationKind,
  lifecycle: TaskLifecycleCore,
  task: TaskRecord,
  locale: Locale,
): string {
  if (task.runnerState?.commitApproved) {
    if (lifecycle.delivery.commit === "EXECUTED") {
      return translate(locale, "lifecycle.approvalRecommendation.commitApprovedExecuted");
    }
    return translate(locale, "lifecycle.approvalRecommendation.commitApprovedPending");
  }

  switch (kind) {
    case "RECOMMENDED_APPROVE":
      return translate(locale, "lifecycle.approvalRecommendation.overviewRecommendApprove");
    case "FIX_FIRST":
      return translate(locale, "lifecycle.approvalRecommendation.overviewFixFirst");
    case "HUMAN_REVIEW_REQUIRED":
      return translate(locale, "lifecycle.approvalRecommendation.overviewHumanReview");
  }
}

/** Pure presentation layer — does not override checker or decision engine authority. */
export function deriveApprovalRecommendation(
  task: TaskRecord,
  lifecycle: TaskLifecycleCore,
  locale: Locale = DEFAULT_LOCALE,
): ApprovalRecommendationView {
  const runner = task.runnerState;
  const items = evidenceItems(task);
  const unresolvedFromEvidence = finalFailedOrBlocked(items).map((item) =>
    plainLanguageIssue(item, locale),
  );
  const historicalCorrection = buildHistoricalCorrection(task, lifecycle, locale);
  const finalChecksSummary = buildFinalChecksSummary(lifecycle, locale);

  const commitAutomationNote =
    lifecycle.delivery.commit === "APPROVED" && !runner?.commit
      ? translate(locale, "lifecycle.approvalRecommendation.commitAutomationNote")
      : null;

  if (isPendingProtectedPathApproval(task) || isProtectedPathApprovalStop(task)) {
    return {
      kind: "HUMAN_REVIEW_REQUIRED",
      label: translate(locale, "taskDetail.approval.protectedPath.title"),
      description: translate(locale, "lifecycle.approvalRecommendation.descProtectedPathPending"),
      reasonBullets: [],
      unresolvedIssues: [],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: translate(locale, "lifecycle.approvalRecommendation.overviewProtectedPathPending"),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (runner?.commitApproved) {
    return {
      kind: "RECOMMENDED_APPROVE",
      label: translate(locale, "lifecycle.approvalRecommendation.labelCommitApproved"),
      description: translate(locale, "lifecycle.approvalRecommendation.descCommitApproved"),
      reasonBullets: buildReasonBullets(task, lifecycle, locale),
      unresolvedIssues: [],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("RECOMMENDED_APPROVE", lifecycle, task, locale),
      canRecommendApprove: false,
      commitAutomationNote,
    };
  }

  if (task.status === "BLOCKED" || runner?.escalated) {
    return {
      kind: "HUMAN_REVIEW_REQUIRED",
      label: translate(locale, "lifecycle.approvalRecommendation.labelHumanReview"),
      description:
        task.status === "BLOCKED"
          ? formatPrimaryBlockedExplanation(
              task.blockedReasons,
              locale,
              "lifecycle.approvalRecommendation.descBlocked",
            )
          : translate(locale, "lifecycle.approvalRecommendation.descInsufficientEvidence"),
      reasonBullets: [],
      unresolvedIssues:
        task.blockedReasons.length > 0
          ? formatBlockedReasonExplanationList(task.blockedReasons, locale)
          : unresolvedFromEvidence,
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("HUMAN_REVIEW_REQUIRED", lifecycle, task, locale),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (task.status === "FAILED") {
    return {
      kind: "FIX_FIRST",
      label: translate(locale, "lifecycle.approvalRecommendation.labelFixFirst"),
      description: translate(locale, "lifecycle.approvalRecommendation.descFailedAfterLimit"),
      reasonBullets: [],
      unresolvedIssues:
        unresolvedFromEvidence.length > 0
          ? unresolvedFromEvidence.slice(0, 3)
          : [translate(locale, "lifecycle.approvalRecommendation.unresolvedCheckerFailed")],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("FIX_FIRST", lifecycle, task, locale),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (!runner?.runnerInvoked || lifecycle.checks.total === 0) {
    return {
      kind: "HUMAN_REVIEW_REQUIRED",
      label: translate(locale, "lifecycle.approvalRecommendation.labelHumanReview"),
      description: translate(locale, "lifecycle.approvalRecommendation.descInsufficientEvidence"),
      reasonBullets: [],
      unresolvedIssues: [translate(locale, "lifecycle.approvalRecommendation.unresolvedNoEvidence")],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("HUMAN_REVIEW_REQUIRED", lifecycle, task, locale),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (!lifecycle.checks.allRequiredSatisfied) {
    return {
      kind: "FIX_FIRST",
      label: translate(locale, "lifecycle.approvalRecommendation.labelFixFirst"),
      description: translate(locale, "lifecycle.approvalRecommendation.descChecksIncomplete"),
      reasonBullets: [],
      unresolvedIssues:
        unresolvedFromEvidence.length > 0
          ? unresolvedFromEvidence.slice(0, 3)
          : [lifecycle.checks.friendlySummary],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("FIX_FIRST", lifecycle, task, locale),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (lifecycle.implementationVerdict !== "PASS") {
    const kind: ApprovalRecommendationKind = hasSensitiveUnresolved(items)
      ? "HUMAN_REVIEW_REQUIRED"
      : "FIX_FIRST";
    return {
      kind,
      label:
        kind === "HUMAN_REVIEW_REQUIRED"
          ? translate(locale, "lifecycle.approvalRecommendation.labelHumanReview")
          : translate(locale, "lifecycle.approvalRecommendation.labelFixFirst"),
      description:
        kind === "HUMAN_REVIEW_REQUIRED"
          ? translate(locale, "lifecycle.approvalRecommendation.descInsufficientEvidence")
          : translate(locale, "lifecycle.approvalRecommendation.descNotPass"),
      reasonBullets: [],
      unresolvedIssues:
        unresolvedFromEvidence.length > 0
          ? unresolvedFromEvidence.slice(0, 3)
          : [translate(locale, "lifecycle.approvalRecommendation.unresolvedNotPass")],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary(kind, lifecycle, task, locale),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (hasSensitiveUnresolved(items)) {
    return {
      kind: "HUMAN_REVIEW_REQUIRED",
      label: translate(locale, "lifecycle.approvalRecommendation.labelHumanReview"),
      description: translate(locale, "lifecycle.approvalRecommendation.descSensitive"),
      reasonBullets: [],
      unresolvedIssues: unresolvedFromEvidence.slice(0, 3),
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("HUMAN_REVIEW_REQUIRED", lifecycle, task, locale),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (!canRecordHumanApproval(task.status)) {
    return {
      kind: "HUMAN_REVIEW_REQUIRED",
      label: translate(locale, "lifecycle.approvalRecommendation.labelHumanReview"),
      description: translate(locale, "lifecycle.approvalRecommendation.descLifecycleMismatch"),
      reasonBullets: buildReasonBullets(task, lifecycle, locale),
      unresolvedIssues: [],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("HUMAN_REVIEW_REQUIRED", lifecycle, task, locale),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  return {
    kind: "RECOMMENDED_APPROVE",
    label: translate(locale, "lifecycle.approvalRecommendation.labelRecommendApprove"),
    description: translate(locale, "lifecycle.approvalRecommendation.descRecommendApprove"),
    reasonBullets: buildReasonBullets(task, lifecycle, locale),
    unresolvedIssues: [],
    historicalCorrection,
    finalChecksSummary,
    overviewSummary: buildOverviewSummary("RECOMMENDED_APPROVE", lifecycle, task, locale),
    canRecommendApprove: true,
    commitAutomationNote: null,
  };
}

/** Tab navigation: hide step icon when completion check already shown. */
export function shouldRenderTabIcon(tabProgress: "complete" | "current" | "upcoming"): boolean {
  return tabProgress !== "complete";
}
