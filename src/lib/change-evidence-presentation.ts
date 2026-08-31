import type { ChangeArtifact, ChangeArtifactFile } from "@/lib/change-artifact";
import { DEFAULT_LOCALE, translate, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";

export type ChangeEvidenceFileView = {
  path: string;
  changeType: ChangeArtifactFile["changeType"];
  changeTypeLabel: string;
  diff: string | null;
  redacted: boolean;
  truncated: boolean;
  binary: boolean;
};

export type ChangeEvidenceViewModel = {
  title: string;
  summary: string;
  baselineSha: string;
  attemptNumber: number;
  checkerVerified: boolean;
  checkerVerifiedLabel: string;
  truncated: boolean;
  truncatedNotice: string | null;
  files: ChangeEvidenceFileView[];
  combinedDiff: string | null;
};

function t(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const translated = translate(locale, key, params);
  return translated === key ? key : translated;
}

function formatChangeType(changeType: ChangeArtifactFile["changeType"], locale: Locale): string {
  const key = `evidence.change.type.${changeType}` as TranslationKey;
  return t(locale, key);
}

export function buildChangeEvidenceViewModel(
  artifact: ChangeArtifact | undefined | null,
  locale: Locale = DEFAULT_LOCALE,
): ChangeEvidenceViewModel | null {
  if (!artifact || artifact.files.length === 0) {
    return null;
  }

  const files: ChangeEvidenceFileView[] = artifact.files.map((file) => ({
    path: file.path,
    changeType: file.changeType,
    changeTypeLabel: formatChangeType(file.changeType, locale),
    diff: file.diff ?? null,
    redacted: file.redacted,
    truncated: file.truncated,
    binary: file.changeType === "binary",
  }));

  const diffSections = files
    .filter((file) => file.diff)
    .map((file) => `--- ${file.path}\n${file.diff}`)
    .join("\n\n");

  return {
    title: t(locale, "evidence.change.title"),
    summary: t(locale, "evidence.change.summary", { count: files.length }),
    baselineSha: artifact.baselineSha.slice(0, 8),
    attemptNumber: artifact.attemptNumber,
    checkerVerified: artifact.checkerVerified,
    checkerVerifiedLabel: artifact.checkerVerified
      ? t(locale, "evidence.change.checkerVerified")
      : t(locale, "evidence.change.checkerNotVerified"),
    truncated: artifact.truncated,
    truncatedNotice: artifact.truncated ? t(locale, "evidence.change.truncatedNotice") : null,
    files,
    combinedDiff: diffSections.length > 0 ? diffSections : null,
  };
}
