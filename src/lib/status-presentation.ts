import type { TaskStatus } from "@/lib/task-contract";
import { translate, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import type { ProgressVisualState } from "@/lib/lifecycle-progress";

export type SemanticTone = "success" | "attention" | "critical" | "active" | "neutral";

export type SemanticIconKind = "check" | "x" | "alert" | "dot" | "circle" | "minus";

export type SemanticStatusPresentation = {
  tone: SemanticTone;
  label: string;
  iconKind: SemanticIconKind;
  accessibleLabel: string;
  badgeClass: string;
  iconClass: string;
  borderClass: string;
  bannerClass: string;
};

const TONE_BADGE: Record<SemanticTone, string> = {
  success: "border-status-pass/40 bg-status-pass/10 text-status-pass",
  attention: "border-status-blocked/40 bg-status-blocked/10 text-status-blocked",
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  active: "border-status-review/40 bg-status-review/10 text-status-review",
  neutral: "border-border bg-muted/40 text-foreground",
};

const TONE_ICON: Record<SemanticTone, string> = {
  success: "text-status-pass",
  attention: "text-status-blocked",
  critical: "text-destructive",
  active: "text-status-review",
  neutral: "text-muted-foreground",
};

const TONE_BORDER: Record<SemanticTone, string> = {
  success: "border-status-pass/30",
  attention: "border-status-blocked/30",
  critical: "border-destructive/30",
  active: "border-status-review/30",
  neutral: "border-border",
};

const TONE_BANNER: Record<SemanticTone, string> = {
  success: "border-status-pass/30 bg-status-pass/5",
  attention: "border-status-blocked/30 bg-status-blocked/5",
  critical: "border-destructive/30 bg-destructive/5",
  active: "border-status-review/30 bg-status-review/5",
  neutral: "border-border bg-card",
};

function semanticLabel(key: TranslationKey, locale: Locale): string {
  const translated = translate(locale, key);
  return translated === key ? key : translated;
}

function buildPresentation(
  tone: SemanticTone,
  labelKey: TranslationKey,
  iconKind: SemanticIconKind,
  locale: Locale,
): SemanticStatusPresentation {
  const label = semanticLabel(labelKey, locale);
  return {
    tone,
    label,
    iconKind,
    accessibleLabel: label,
    badgeClass: TONE_BADGE[tone],
    iconClass: TONE_ICON[tone],
    borderClass: TONE_BORDER[tone],
    bannerClass: TONE_BANNER[tone],
  };
}

export function semanticToneBadgeClass(tone: SemanticTone): string {
  return TONE_BADGE[tone];
}

export function semanticToneIconClass(tone: SemanticTone): string {
  return TONE_ICON[tone];
}

export function taskStatusSemanticTone(status: TaskStatus): SemanticTone {
  if (status === "PASS" || status === "CLOSED") {
    return "success";
  }
  if (status === "AWAITING_APPROVAL" || status === "BLOCKED") {
    return "attention";
  }
  if (status === "FAILED") {
    return "critical";
  }
  if (
    ["INSPECTING", "RUNNING", "CHECKING", "NEEDS_CORRECTION", "APPROVED_FOR_EXECUTION"].includes(
      status,
    )
  ) {
    return "active";
  }
  return "neutral";
}

export function taskStatusPresentation(
  status: TaskStatus,
  locale: Locale = DEFAULT_LOCALE,
): SemanticStatusPresentation {
  const tone = taskStatusSemanticTone(status);
  const labelKey = `status.semantic.task.${status}` as TranslationKey;
  const fallbackKey = `tasks.list.status.${status}` as TranslationKey;
  const label = translate(locale, labelKey);
  const resolvedLabel = label === labelKey ? translate(locale, fallbackKey) : label;

  let iconKind: SemanticIconKind = "circle";
  if (tone === "success") iconKind = "check";
  else if (tone === "critical") iconKind = "x";
  else if (tone === "attention") iconKind = "alert";
  else if (tone === "active") iconKind = "dot";

  return {
    tone,
    label: resolvedLabel === fallbackKey ? status.replaceAll("_", " ") : resolvedLabel,
    iconKind,
    accessibleLabel: resolvedLabel === fallbackKey ? status.replaceAll("_", " ") : resolvedLabel,
    badgeClass: TONE_BADGE[tone],
    iconClass: TONE_ICON[tone],
    borderClass: TONE_BORDER[tone],
    bannerClass: TONE_BANNER[tone],
  };
}

export function verdictPresentation(
  verdict: "PASS" | "FAILED" | "BLOCKED" | null,
  locale: Locale = DEFAULT_LOCALE,
): SemanticStatusPresentation | null {
  if (!verdict) {
    return null;
  }
  if (verdict === "PASS") {
    return buildPresentation("success", "status.semantic.passed", "check", locale);
  }
  if (verdict === "BLOCKED") {
    return buildPresentation("attention", "status.semantic.blocked", "alert", locale);
  }
  return buildPresentation("critical", "status.semantic.failed", "x", locale);
}

export function progressVisualPresentation(
  visualState: ProgressVisualState,
  locale: Locale = DEFAULT_LOCALE,
): SemanticStatusPresentation {
  switch (visualState) {
    case "completed":
      return buildPresentation("success", "status.semantic.passed", "check", locale);
    case "active":
      return buildPresentation("active", "status.semantic.running", "dot", locale);
    case "blocked":
      return buildPresentation("attention", "status.semantic.blocked", "alert", locale);
    case "failed":
      return buildPresentation("critical", "status.semantic.failed", "x", locale);
    case "skipped":
      return buildPresentation("neutral", "status.semantic.skipped", "minus", locale);
    default:
      return buildPresentation("neutral", "status.semantic.waiting", "circle", locale);
  }
}

export function checkEvidencePresentation(
  status: "pass" | "fail" | "blocked" | "skipped" | string,
  locale: Locale = DEFAULT_LOCALE,
): SemanticStatusPresentation {
  switch (status) {
    case "pass":
      return buildPresentation("success", "status.semantic.passed", "check", locale);
    case "fail":
      return buildPresentation("critical", "status.semantic.failed", "x", locale);
    case "blocked":
      return buildPresentation("attention", "status.semantic.blocked", "alert", locale);
    case "skipped":
      return buildPresentation("neutral", "status.semantic.skipped", "minus", locale);
    default:
      return buildPresentation("neutral", "status.semantic.waiting", "circle", locale);
  }
}

export function presentationHasNonColorIndicator(presentation: SemanticStatusPresentation): boolean {
  return Boolean(presentation.label.trim() && presentation.iconKind);
}
