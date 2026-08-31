import { translate, type Locale, DEFAULT_LOCALE } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import type { LifecycleStepState } from "@/lib/task-lifecycle";
import type { CheckBreakdownCore } from "@/lib/evidence-analysis";

export function formatLifecycleStepLabel(
  state: LifecycleStepState,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const key = `lifecycle.stepState.${state}` as TranslationKey;
  const translated = translate(locale, key);
  return translated === key ? "" : translated;
}

export function formatLifecycleStepStatus(
  state: LifecycleStepState,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (state === "complete" || state === "not_needed") {
    return translate(locale, "lifecycle.stepStatus.completed");
  }
  if (state === "active") {
    return translate(locale, "lifecycle.stepStatus.running");
  }
  if (state === "failed") {
    return translate(locale, "lifecycle.stepStatus.failed");
  }
  if (state === "blocked") {
    return translate(locale, "lifecycle.stepStatus.blocked");
  }
  return formatLifecycleStepLabel(state, locale);
}

export function formatChecksFriendlySummary(
  checks: Pick<CheckBreakdownCore, "passed" | "failed" | "skipped" | "blocked" | "total" | "allRequiredSatisfied">,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { passed, failed, skipped, total, allRequiredSatisfied } = checks;
  if (total === 0) {
    return translate(locale, "lifecycle.checks.none");
  }
  if (allRequiredSatisfied && skipped > 0) {
    return translate(locale, "lifecycle.checks.passedWithSkipped", { passed, skipped });
  }
  if (allRequiredSatisfied) {
    return translate(locale, "lifecycle.checks.allPassed");
  }
  const skippedPart =
    skipped > 0 ? translate(locale, "lifecycle.checks.skippedSuffix", { skipped }) : "";
  return translate(locale, "lifecycle.checks.mixed", { passed, failed, skippedPart });
}

export function formatApprovalTypeLabel(
  approvalType: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!approvalType) return "—";
  const key = `lifecycle.approvalType.${approvalType}` as TranslationKey;
  const translated = translate(locale, key);
  return translated === key ? approvalType : translated;
}

export function formatWorkContractStatusLabel(status: string, locale: Locale = DEFAULT_LOCALE): string {
  const key = `lifecycle.workContract.status.${status}` as TranslationKey;
  const translated = translate(locale, key);
  return translated === key ? status : translated;
}

export function formatWorkContractApprovalLabel(
  approvalState: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const key = `lifecycle.workContract.approval.${approvalState}` as TranslationKey;
  const translated = translate(locale, key);
  return translated === key ? approvalState : translated;
}

export function formatOrchestrationPhaseLabel(phase: string, locale: Locale = DEFAULT_LOCALE): string {
  const key = `lifecycle.orchestrationPhase.${phase}` as TranslationKey;
  const translated = translate(locale, key);
  return translated === key ? phase : translated;
}
