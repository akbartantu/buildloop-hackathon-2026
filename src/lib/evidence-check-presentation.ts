import type { EvidenceRow } from "@/lib/evidence-analysis";
import { translate, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import {
  formatCheckTitle,
  formatCheckUserLine,
  resolveCheckKey,
  type CheckKey,
} from "@/lib/evidence-summary";

function t(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const translated = translate(locale, key, params);
  return translated === key ? key : translated;
}

/** Presentation-only check key resolution for technical check history. */
export function resolvePresentationCheckKey(category: string, name: string): CheckKey | "git_diff" {
  if (name === "protected_path_unchanged") {
    return "protected_path";
  }
  if (name === "git_diff_summary") {
    return "git_diff";
  }
  if (name.endsWith("_not_applicable")) {
    if (name.startsWith("typecheck_")) {
      return "typecheck";
    }
    if (name.startsWith("test_")) {
      return "test";
    }
    return "command";
  }
  return resolveCheckKey(category, name);
}

export function formatEvidenceCheckTitle(row: EvidenceRow, locale: Locale = DEFAULT_LOCALE): string {
  const checkKey = resolvePresentationCheckKey(row.category, row.name);
  if (checkKey === "git_diff") {
    return t(locale, "evidence.checkSummary.gitDiffTitle");
  }
  return formatCheckTitle(checkKey, locale);
}

export function formatEvidenceCheckUserLine(row: EvidenceRow, locale: Locale = DEFAULT_LOCALE): string {
  if (row.name === "worker_invocation") {
    if (row.status === "pass") {
      return t(locale, "evidence.checkSummary.workerReportReceived");
    }
    if (row.status === "skipped") {
      return t(locale, "evidence.checkSummary.workerReportMissing");
    }
  }

  if (row.name === "protected_path_unchanged") {
    if (row.status === "pass") {
      return t(locale, "evidence.check.protected_path.pass");
    }
    if (row.status === "fail") {
      return t(locale, "evidence.checkSummary.protectedPathChanged");
    }
  }

  const checkKey = resolvePresentationCheckKey(row.category, row.name);
  if (checkKey === "git_diff") {
    return formatEvidenceCheckSummary(row, locale);
  }

  return formatCheckUserLine(checkKey, row.status, locale);
}

type SummaryPattern = {
  test: (summary: string) => boolean;
  format: (summary: string, locale: Locale) => string;
};

const SUMMARY_PATTERNS: SummaryPattern[] = [
  {
    test: (summary) => summary === "Worker report received.",
    format: (_summary, locale) => t(locale, "evidence.checkSummary.workerReportReceived"),
  },
  {
    test: (summary) => summary === "No worker report (preflight-only run).",
    format: (_summary, locale) => t(locale, "evidence.checkSummary.workerReportMissing"),
  },
  {
    test: (summary) => summary === "No protected path changes detected.",
    format: (_summary, locale) => t(locale, "evidence.checkSummary.noProtectedPathChanges"),
  },
  {
    test: (summary) => summary === "Protected path changed.",
    format: (_summary, locale) => t(locale, "evidence.checkSummary.protectedPathChanged"),
  },
  {
    test: (summary) => summary === "Protected path modified.",
    format: (_summary, locale) => t(locale, "evidence.checkSummary.protectedPathModified"),
  },
  {
    test: (summary) => summary === "Change within allowed paths.",
    format: (_summary, locale) => t(locale, "evidence.checkSummary.changeWithinAllowedPaths"),
  },
  {
    test: (summary) => summary === "Change outside allowed paths.",
    format: (_summary, locale) => t(locale, "evidence.checkSummary.changeOutsideAllowedPaths"),
  },
  {
    test: (summary) => summary === "Command execution skipped for demo/fixture run.",
    format: (_summary, locale) => t(locale, "evidence.checkSummary.commandExecutionSkipped"),
  },
  {
    test: (summary) => summary === "No required commands configured for this contract.",
    format: (_summary, locale) => t(locale, "evidence.checkSummary.noRequiredCommands"),
  },
  {
    test: (summary) => /^Command not applicable for this workspace: .+$/.test(summary),
    format: (summary, locale) => {
      const command = summary.replace(/^Command not applicable for this workspace: /, "");
      return t(locale, "evidence.checkSummary.commandNotApplicable", { command });
    },
  },
  {
    test: (summary) => /^Command failed: .+$/.test(summary),
    format: (summary, locale) => {
      const command = summary.replace(/^Command failed: /, "");
      return t(locale, "evidence.checkSummary.commandFailed", { command });
    },
  },
  {
    test: (summary) => /^Command succeeded: .+$/.test(summary),
    format: (summary, locale) => {
      const command = summary.replace(/^Command succeeded: /, "");
      return t(locale, "evidence.checkSummary.commandSucceeded", { command });
    },
  },
  {
    test: (summary) => /^Command timed out: .+$/.test(summary),
    format: (summary, locale) => {
      const command = summary.replace(/^Command timed out: /, "");
      return t(locale, "evidence.checkSummary.commandTimedOut", { command });
    },
  },
  {
    test: (summary) => /^(\d+) file berubah dari baseline ([a-f0-9]+)\.$/.test(summary),
    format: (summary, locale) => {
      const match = summary.match(/^(\d+) file berubah dari baseline ([a-f0-9]+)\.$/);
      if (!match) {
        return summary;
      }
      return t(locale, "evidence.checkSummary.gitDiffChanged", {
        count: match[1]!,
        sha: match[2]!,
      });
    },
  },
  {
    test: (summary) => /^(\d+) files? changed from baseline ([a-f0-9]+)\.$/.test(summary),
    format: (summary, locale) => {
      const match = summary.match(/^(\d+) files? changed from baseline ([a-f0-9]+)\.$/);
      if (!match) {
        return summary;
      }
      return t(locale, "evidence.checkSummary.gitDiffChanged", {
        count: match[1]!,
        sha: match[2]!,
      });
    },
  },
];

/** Localize known persisted checker summaries; keep commands, paths, and unknown text literal. */
export function formatEvidenceCheckSummary(row: EvidenceRow, locale: Locale = DEFAULT_LOCALE): string {
  for (const pattern of SUMMARY_PATTERNS) {
    if (pattern.test(row.summary)) {
      return pattern.format(row.summary, locale);
    }
  }
  return row.summary;
}

export function extractEvidenceCheckCommand(summary: string): string | undefined {
  const failedMatch = summary.match(/Command failed:\s*(.+)/i);
  if (failedMatch?.[1]) {
    return failedMatch[1].trim();
  }
  const notApplicableMatch = summary.match(/^Command not applicable for this workspace:\s*(.+)$/i);
  if (notApplicableMatch?.[1]) {
    return notApplicableMatch[1].trim();
  }
  const succeededMatch = summary.match(/^Command succeeded:\s*(.+)$/i);
  if (succeededMatch?.[1]) {
    return succeededMatch[1].trim();
  }
  const timedOutMatch = summary.match(/^Command timed out:\s*(.+)$/i);
  if (timedOutMatch?.[1]) {
    return timedOutMatch[1].trim();
  }
  const bareCommandMatch = summary.match(/^(bun run .+)$/i);
  return bareCommandMatch?.[1]?.trim();
}

export function shouldShowEvidenceCheckSummary(userLine: string, summary: string): boolean {
  return summary.trim().length > 0 && summary.trim() !== userLine.trim();
}
