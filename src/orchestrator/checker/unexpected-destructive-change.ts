import { isDocumentationOnlyScope } from "../contract/derive-task-contract";
import type { LockedContract } from "../contract/schema";
import {
  countDiffLineChanges,
  isLargeDeletion,
  type DiffLineChangeCounts,
} from "@/lib/change-diff-presentation";

const DESTRUCTIVE_VERBS =
  /\b(delete|remove|drop|strip|rewrite|replace|restructure|refactor|overhaul|truncate|eliminate|purge|gut|hapus|ganti|tulis ulang)\b/i;

const ADDITIVE_SIGNALS =
  /\b(add|append|insert|include|mention|clarify|extend|supplement|one sentence|short sentence|single sentence|update text|document|tambah|tambahkan|sisipkan|satu kalimat)\b/i;

const INTEGRITY_SIGNALS =
  /\b(remains intact|structure intact|preserve existing|do not remove|without removing|keep existing|tetap utuh|struktur tetap|jangan hapus)\b/i;

const ONLY_FILE_MODIFIED = /\bonly\s+[a-z0-9_./-]+\s+is modified\b/i;

export const UNEXPECTED_DESTRUCTIVE_CHANGE_SUMMARY =
  "Unexpected destructive change: the task requested a bounded edit, but substantially more existing content was removed than expected.";

function contractScopeText(contract: LockedContract): string {
  return [contract.goal, ...contract.inScope, ...contract.acceptanceCriteria].join("\n");
}

function positiveClauses(text: string): string[] {
  const segments = text.split(/(?:,\s*|\.\s+|\n+)(?:and\s+)?(?:do\s+not|don't|jangan)\s+/i);
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

export function contractAuthorizesDestructiveChanges(contract: LockedContract): boolean {
  const normalized = contractScopeText(contract).toLowerCase();
  return positiveClauses(normalized).some((clause) => DESTRUCTIVE_VERBS.test(clause));
}

export function contractExpectsBoundedAdditiveEdit(contract: LockedContract): boolean {
  if (contractAuthorizesDestructiveChanges(contract)) {
    return false;
  }

  const text = contractScopeText(contract).toLowerCase();

  if (INTEGRITY_SIGNALS.test(text) || ADDITIVE_SIGNALS.test(text) || ONLY_FILE_MODIFIED.test(text)) {
    return true;
  }

  if (isDocumentationOnlyScope(contract.allowedPaths)) {
    return true;
  }

  return false;
}

export type DestructiveChangeAssessment = {
  unexpected: boolean;
  added: number;
  removed: number;
  baselineLineCount: number;
  retainedLineRatio: number;
};

function normalizeLines(content: string): string[] {
  return content.split(/\r?\n/).map((line) => line.trim());
}

function longestCommonSubsequenceLength(left: string[], right: string[]): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (left[i - 1] === right[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  return dp[left.length]![right.length]!;
}

export function countContentLineChanges(baselineContent: string, updatedContent: string): DiffLineChangeCounts {
  const baselineLines = normalizeLines(baselineContent);
  const updatedLines = normalizeLines(updatedContent);
  const shared = longestCommonSubsequenceLength(baselineLines, updatedLines);

  return {
    added: Math.max(0, updatedLines.length - shared),
    removed: Math.max(0, baselineLines.length - shared),
  };
}

function retainedNonEmptyLineRatio(baselineContent: string, updatedContent: string): number {
  const baselineLines = normalizeLines(baselineContent).filter((line) => line.length > 0);
  if (baselineLines.length === 0) {
    return 1;
  }

  const updatedLines = new Set(
    normalizeLines(updatedContent).filter((line) => line.length > 0),
  );
  const preserved = baselineLines.filter((line) => updatedLines.has(line)).length;
  return preserved / baselineLines.length;
}

export function isDisproportionateDestructiveChange(input: {
  baselineLineCount: number;
  counts: DiffLineChangeCounts;
  retainedLineRatio: number;
}): boolean {
  const { baselineLineCount, counts, retainedLineRatio } = input;

  if (counts.removed === 0) {
    return false;
  }

  if (isLargeDeletion(counts)) {
    return true;
  }

  if (baselineLineCount >= 10 && retainedLineRatio < 0.5 && counts.added <= 5) {
    return true;
  }

  if (baselineLineCount >= 5 && counts.removed >= 5 && counts.removed > counts.added * 3) {
    return true;
  }

  return false;
}

export function assessContentDestructiveChange(
  baselineContent: string,
  updatedContent: string,
): DestructiveChangeAssessment {
  const baselineLines = normalizeLines(baselineContent);
  const counts = countContentLineChanges(baselineContent, updatedContent);
  const retainedLineRatio = retainedNonEmptyLineRatio(baselineContent, updatedContent);
  const unexpected = isDisproportionateDestructiveChange({
    baselineLineCount: baselineLines.length,
    counts,
    retainedLineRatio,
  });

  return {
    unexpected,
    added: counts.added,
    removed: counts.removed,
    baselineLineCount: baselineLines.length,
    retainedLineRatio,
  };
}

export function assessDiffDestructiveChange(diff: string): DestructiveChangeAssessment {
  const counts = countDiffLineChanges(diff);
  const retainedLineRatio =
    counts.removed === 0 ? 1 : counts.added / (counts.removed + counts.added);

  return {
    unexpected: isDisproportionateDestructiveChange({
      baselineLineCount: Math.max(counts.removed, counts.added),
      counts,
      retainedLineRatio,
    }),
    added: counts.added,
    removed: counts.removed,
    baselineLineCount: Math.max(counts.removed, counts.added),
    retainedLineRatio,
  };
}

export function shouldFlagUnexpectedDestructiveChange(
  contract: LockedContract,
  assessment: DestructiveChangeAssessment,
): boolean {
  if (!contractExpectsBoundedAdditiveEdit(contract)) {
    return false;
  }
  return assessment.unexpected;
}
