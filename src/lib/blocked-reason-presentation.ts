import { translate, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import type { BlockedReason } from "@/lib/sensitive-intent";

export const BLOCKED_REASON_RULE_CODES = [
  "PROTECTED_PATH_ENV",
  "PROTECTED_PATH_WORKFLOWS",
  "PROTECTED_PATH_INFRASTRUCTURE",
  "PROTECTED_PATH_MIGRATIONS",
  "PROTECTED_PATH_SUPABASE_INTEGRATION",
  "CREDENTIAL_HANDLING",
  "MAIN_BRANCH_WRITE",
  "GIT_WRITE_ACTION",
  "PRODUCTION_DEPLOYMENT",
  "IRREVERSIBLE_ACTION",
] as const;

export type BlockedReasonRuleCode = (typeof BLOCKED_REASON_RULE_CODES)[number];

function ruleTranslationKey(
  rule: BlockedReasonRuleCode,
  field: "title" | "explanation" | "target",
): TranslationKey {
  return `blockedReason.rule.${rule}.${field}` as TranslationKey;
}

export function isKnownBlockedReasonRule(rule: string): rule is BlockedReasonRuleCode {
  return (BLOCKED_REASON_RULE_CODES as readonly string[]).includes(rule);
}

export function formatBlockedReasonExplanation(
  reason: BlockedReason,
  locale: Locale,
): string {
  if (isKnownBlockedReasonRule(reason.rule)) {
    const translated = translate(locale, ruleTranslationKey(reason.rule, "explanation"));
    if (translated !== ruleTranslationKey(reason.rule, "explanation")) {
      return translated;
    }
  }
  if (locale === "id") {
    return reason.explanation;
  }
  return translate(locale, "blockedReason.fallback");
}

export function formatBlockedReasonTitle(reason: BlockedReason, locale: Locale): string {
  if (isKnownBlockedReasonRule(reason.rule)) {
    const key = ruleTranslationKey(reason.rule, "title");
    const translated = translate(locale, key);
    if (translated !== key) {
      return translated;
    }
  }
  return translate(locale, "blockedReason.unknownRuleTitle");
}

export function formatBlockedReasonTarget(reason: BlockedReason, locale: Locale): string {
  if (isKnownBlockedReasonRule(reason.rule)) {
    const key = ruleTranslationKey(reason.rule, "target");
    const translated = translate(locale, key);
    if (translated !== key) {
      return translated;
    }
  }
  return reason.protectedTarget;
}

export function formatBlockedReasonDetailLine(reason: BlockedReason, locale: Locale): string {
  return translate(locale, "blockedReason.detailLine", {
    target: formatBlockedReasonTarget(reason, locale),
    matched: reason.matchedText,
  });
}

export function formatPrimaryBlockedExplanation(
  reasons: BlockedReason[],
  locale: Locale,
  fallbackKey: TranslationKey = "blockedReason.fallback",
): string {
  if (reasons.length === 0) {
    return translate(locale, fallbackKey);
  }
  return formatBlockedReasonExplanation(reasons[0]!, locale);
}

export function formatBlockedReasonExplanationList(
  reasons: BlockedReason[],
  locale: Locale,
): string[] {
  return reasons.map((reason) => formatBlockedReasonExplanation(reason, locale));
}

export function formatPreflightBlockedUserLine(ruleName: string, locale: Locale): string | null {
  if (!isKnownBlockedReasonRule(ruleName)) {
    return null;
  }
  return formatBlockedReasonExplanation(
    {
      rule: ruleName,
      matchedText: "",
      explanation: "",
      protectedTarget: "",
    },
    locale,
  );
}

const INDONESIAN_BLOCKED_EXPLANATION_MARKERS = [
  "Task meminta",
  "Task menyasar",
  "Commit, push",
  "tindakan irreversible",
  "Ini di luar allowed actions",
  "Deployment tidak pernah",
  "memerlukan approval manusia",
] as const;

export function containsIndonesianBlockedExplanation(text: string): boolean {
  return INDONESIAN_BLOCKED_EXPLANATION_MARKERS.some((marker) => text.includes(marker));
}
