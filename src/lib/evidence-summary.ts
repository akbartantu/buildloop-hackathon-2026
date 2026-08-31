import type { TaskStatus } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import {
  isProtectedPathApprovalStop,
  shouldPreferProtectedPathApprovalSurface,
} from "@/lib/protected-path-approval-flow";
import { translate, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import {
  formatBlockedReasonExplanationList,
  formatPrimaryBlockedExplanation,
  formatPreflightBlockedUserLine,
} from "@/lib/blocked-reason-presentation";
import {
  analyzeFinalChecks,
  finalAttemptNumber,
  type EvidenceRow,
} from "@/lib/evidence-analysis";
import type { TaskLifecycleViewModel } from "@/lib/task-lifecycle";

export type FailureClassification =
  | "verification"
  | "implementation"
  | "protected"
  | "operational"
  | null;

export type CheckTechnicalDetail = {
  category: string;
  name: string;
  status: string;
  summary: string;
  command?: string | undefined;
  title: string;
  userLine: string;
};

export type EvidenceSummaryViewModel = {
  headline: string;
  intro: string;
  classificationLabel: string | null;
  whatPassed: string[];
  whatFailed: string[];
  whatThisMeans: string[];
  recommendedNextStep: string;
  automaticActions: string | null;
  remoteActions: string;
  correctionExplanation: string | null;
  technicalDetails: CheckTechnicalDetail[];
};

type CheckKey =
  | "typecheck"
  | "test"
  | "scope"
  | "acceptance"
  | "protected_path"
  | "operational"
  | "preflight"
  | "command"
  | "unexpected_destructive_change"
  | "generic";

function t(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const translated = translate(locale, key, params);
  return translated === key ? key : translated;
}

function evidenceRows(task: TaskRecord): EvidenceRow[] {
  return (task.runnerState?.evidence ?? []) as EvidenceRow[];
}

function finalEvidenceRows(task: TaskRecord): EvidenceRow[] {
  const attempt = finalAttemptNumber(task);
  const all = evidenceRows(task);
  if (attempt <= 0) {
    return all;
  }
  return all.filter((row) => (row.attemptNumber ?? attempt) === attempt);
}

export function resolveCheckKey(category: string, name: string): CheckKey {
  const haystack = `${category} ${name}`.toLowerCase();
  if (name.startsWith("unexpected_destructive_change")) {
    return "unexpected_destructive_change";
  }
  if (name === "worker_operational_error" || haystack.includes("operational")) {
    return "operational";
  }
  if (category === "typecheck" || haystack.includes("typecheck")) {
    return "typecheck";
  }
  if (category === "test" || /(?:^|_)test(?:_|$)/.test(haystack)) {
    return "test";
  }
  if (category === "protected_path" || name.startsWith("protected_")) {
    return "protected_path";
  }
  if (category === "acceptance") {
    return "acceptance";
  }
  if (category === "scope" || name.startsWith("scope_")) {
    return "scope";
  }
  if (category === "preflight") {
    return "preflight";
  }
  if (category === "command") {
    return "command";
  }
  return "generic";
}

export function formatCheckTitle(checkKey: CheckKey, locale: Locale): string {
  const key = `evidence.check.${checkKey}.title` as TranslationKey;
  return t(locale, key);
}

export function formatCheckUserLine(
  checkKey: CheckKey,
  status: string,
  locale: Locale,
): string {
  const suffix = status === "pass" ? "pass" : status === "skipped" ? "skipped" : "fail";
  const key = `evidence.check.${checkKey}.${suffix}` as TranslationKey;
  return t(locale, key);
}

export function isOperationalEvidence(rows: EvidenceRow[], task: TaskRecord): boolean {
  if (task.runnerState?.operationalError) {
    return true;
  }
  return rows.some(
    (row) =>
      row.name === "worker_operational_error" ||
      (row.category === "scope" && row.name === "worker_operational_error"),
  );
}

export function classifyFailure(
  task: TaskRecord,
  rows: EvidenceRow[],
): FailureClassification {
  if (isProtectedPathApprovalStop(task)) {
    return "protected";
  }
  if (task.status === "BLOCKED") {
    return "protected";
  }
  if (isOperationalEvidence(rows, task)) {
    return "operational";
  }

  const failed = rows.filter((row) => row.status === "fail" || row.status === "blocked");
  if (failed.length === 0) {
    return null;
  }

  const keys = failed.map((row) => resolveCheckKey(row.category, row.name));
  if (keys.some((key) => key === "protected_path" || key === "preflight")) {
    return "protected";
  }
  if (keys.some((key) => key === "acceptance" || key === "scope")) {
    return "implementation";
  }
  if (keys.some((key) => key === "typecheck" || key === "test" || key === "command")) {
    return "verification";
  }
  return "verification";
}

export function formatFailureClassificationLabel(
  classification: FailureClassification,
  taskStatus: TaskStatus,
  locale: Locale,
): string | null {
  if (classification === "operational") {
    return t(locale, "evidence.classification.operational");
  }
  if (taskStatus === "BLOCKED" || classification === "protected") {
    return t(locale, "evidence.classification.blocked");
  }
  if (classification === "implementation") {
    return t(locale, "evidence.classification.implementation");
  }
  if (classification === "verification" && taskStatus === "FAILED") {
    return t(locale, "evidence.classification.verification");
  }
  if (taskStatus === "FAILED") {
    return t(locale, "evidence.classification.worker");
  }
  return null;
}

function buildRemoteActions(task: TaskRecord, lifecycle: TaskLifecycleViewModel, locale: Locale): string {
  const runner = task.runnerState;
  const executed: string[] = [];
  if (runner?.commit) executed.push(t(locale, "evidence.remote.commit"));
  if (runner?.push) executed.push(t(locale, "evidence.remote.push"));
  if (lifecycle.delivery.merge === "EXECUTED") executed.push(t(locale, "evidence.remote.merge"));
  if (lifecycle.delivery.deploy === "EXECUTED") executed.push(t(locale, "evidence.remote.deploy"));

  if (executed.length > 0) {
    return t(locale, "evidence.remote.executed", { actions: executed.join(", ") });
  }
  if (runner?.commitApproved) {
    return t(locale, "evidence.remote.commitApprovedOnly");
  }
  return t(locale, "evidence.remote.none");
}

function buildCorrectionExplanation(
  task: TaskRecord,
  lifecycle: TaskLifecycleViewModel,
  locale: Locale,
): string | null {
  const used = lifecycle.correctionsUsed;
  const limit = lifecycle.correctionLimit;
  const classification = classifyFailure(task, finalEvidenceRows(task));

  if (classification === "operational") {
    return t(locale, "evidence.correction.notAttemptedOperational");
  }

  if (task.status === "BLOCKED" && used === 0) {
    return t(locale, "evidence.correction.notAttemptedBlocked");
  }

  if (used > 0 && task.status === "FAILED") {
    return t(locale, "evidence.correction.exhausted", { count: used });
  }

  if (used > 0 && lifecycle.implementationVerdict === "PASS") {
    return t(locale, "evidence.correction.resolved", { count: used });
  }

  if (used === 0 && task.status === "FAILED") {
    return t(locale, "evidence.correction.notAttempted");
  }

  return null;
}

function buildRecommendedNextStep(
  task: TaskRecord,
  classification: FailureClassification,
  locale: Locale,
): string {
  if (classification === "operational") {
    return t(locale, "evidence.nextStep.operational");
  }
  if (task.status === "BLOCKED") {
    return t(locale, "evidence.nextStep.blocked");
  }
  if (task.status === "AWAITING_APPROVAL") {
    return t(locale, "evidence.nextStep.approval");
  }
  if (task.status === "FAILED") {
    return t(locale, "evidence.nextStep.failed");
  }
  if (task.status === "PASS" || task.status === "CLOSED") {
    return t(locale, "evidence.nextStep.pass");
  }
  return t(locale, "evidence.nextStep.default");
}

function dedupeLines(lines: string[]): string[] {
  return [...new Set(lines.filter(Boolean))];
}

export function buildCheckTechnicalDetails(
  rows: EvidenceRow[],
  locale: Locale,
): CheckTechnicalDetail[] {
  return rows.map((row) => {
    const checkKey = resolveCheckKey(row.category, row.name);
    const command = extractCommand(row.summary);
    const preflightLine =
      row.category === "preflight" && row.status === "blocked"
        ? formatPreflightBlockedUserLine(row.name, locale)
        : null;
    return {
      category: row.category,
      name: row.name,
      status: row.status,
      summary: preflightLine ?? row.summary,
      ...(command ? { command } : {}),
      title: formatCheckTitle(checkKey, locale),
      userLine: preflightLine ?? formatCheckUserLine(checkKey, row.status, locale),
    };
  });
}

function extractCommand(summary: string): string | undefined {
  const match = summary.match(/Command failed:\s*(.+)/i) ?? summary.match(/^(bun run .+)$/i);
  return match?.[1]?.trim();
}

export function userFacingFailureExplanation(details: CheckTechnicalDetail[]): string {
  const failed = details.filter((item) => item.status === "fail" || item.status === "blocked");
  if (failed.length === 0) {
    return "";
  }
  return failed.map((item) => item.userLine).join(" ");
}

export function buildEvidenceSummaryViewModel(
  task: TaskRecord,
  lifecycle: TaskLifecycleViewModel,
  locale: Locale = DEFAULT_LOCALE,
): EvidenceSummaryViewModel | null {
  if (!lifecycle.hasRun && task.status !== "BLOCKED") {
    return null;
  }

  const rows = finalEvidenceRows(task);
  const checks = analyzeFinalChecks(task, locale);
  const classification = classifyFailure(task, rows);
  const classificationLabel = formatFailureClassificationLabel(classification, task.status, locale);
  const technicalDetails = buildCheckTechnicalDetails(rows, locale);

  const passedRows = rows.filter((row) => row.status === "pass");
  const failedRows = rows.filter((row) => row.status === "fail" || row.status === "blocked");
  const semanticFailedRows = isProtectedPathApprovalStop(task)
    ? failedRows.filter(
        (row) =>
          row.name !== "worker_error" &&
          !row.name.startsWith("scope_") &&
          row.name !== "zero_file_changes",
      )
    : failedRows;

  const whatPassed = dedupeLines(
    passedRows.map((row) => formatCheckUserLine(resolveCheckKey(row.category, row.name), "pass", locale)),
  );
  const whatFailed =
    task.status === "BLOCKED" && task.blockedReasons.length > 0
      ? formatBlockedReasonExplanationList(task.blockedReasons, locale)
      : isProtectedPathApprovalStop(task)
        ? [
            translate(locale, "lifecycle.approvalRecommendation.descProtectedPathPending"),
            ...(task.runnerState?.pendingProtectedPathApproval?.paths ?? []).map(
              (path) => translate(locale, "taskDetail.approval.protectedPath.scopedApproval", { path }),
            ),
          ]
        : dedupeLines(
            semanticFailedRows.map((row) => {
            const preflightLine =
              row.category === "preflight" && row.status === "blocked"
                ? formatPreflightBlockedUserLine(row.name, locale)
                : null;
            return (
              preflightLine ??
              formatCheckUserLine(resolveCheckKey(row.category, row.name), row.status, locale)
            );
          }),
        );

  let headline = t(locale, "evidence.summary.headline.default");
  let intro = t(locale, "evidence.summary.intro.default");

  if (task.status === "PASS" || lifecycle.implementationVerdict === "PASS") {
    headline = t(locale, "evidence.summary.headline.pass");
    intro = checks.friendlySummary;
  } else if (task.status === "BLOCKED") {
    headline = t(locale, "evidence.summary.headline.blocked");
    intro = formatPrimaryBlockedExplanation(
      task.blockedReasons,
      locale,
      "evidence.summary.intro.blocked",
    );
  } else if (classification === "operational") {
    headline = t(locale, "evidence.summary.headline.operational");
    intro = t(locale, "evidence.summary.intro.operational");
  } else if (task.status === "FAILED") {
    headline = t(locale, "evidence.summary.headline.failed");
    intro = t(locale, "evidence.summary.intro.failed");
  } else if (task.status === "AWAITING_APPROVAL") {
    headline = isProtectedPathApprovalStop(task)
      ? t(locale, "taskDetail.approval.protectedPath.title")
      : t(locale, "evidence.summary.headline.approval");
    intro = isProtectedPathApprovalStop(task)
      ? t(locale, "lifecycle.approvalRecommendation.descProtectedPathPending")
      : t(locale, "evidence.summary.intro.approval");
  }

  const whatThisMeans: string[] = [];
  if (isProtectedPathApprovalStop(task)) {
    whatThisMeans.push(t(locale, "lifecycle.approvalRecommendation.descProtectedPathPending"));
  } else if (task.status === "FAILED") {
    whatThisMeans.push(t(locale, "evidence.meaning.failedUnsafe"));
    whatThisMeans.push(t(locale, "evidence.meaning.failedStopped"));
  } else if (task.status === "BLOCKED") {
    whatThisMeans.push(t(locale, "evidence.meaning.blocked"));
  } else if (classification === "operational") {
    whatThisMeans.push(t(locale, "evidence.meaning.operational"));
  } else if (lifecycle.implementationVerdict === "PASS") {
    whatThisMeans.push(t(locale, "evidence.meaning.pass"));
  }

  const automaticActions =
    lifecycle.correction.userSummary ||
    buildCorrectionExplanation(task, lifecycle, locale);

  return {
    headline,
    intro,
    classificationLabel,
    whatPassed,
    whatFailed,
    whatThisMeans,
    recommendedNextStep: buildRecommendedNextStep(task, classification, locale),
    automaticActions,
    remoteActions: buildRemoteActions(task, lifecycle, locale),
    correctionExplanation: buildCorrectionExplanation(task, lifecycle, locale),
    technicalDetails,
  };
}
