export type DiffLineKind = "added" | "removed" | "hunk" | "meta" | "context";

export type DiffLineChangeCounts = {
  added: number;
  removed: number;
};

export const LARGE_DELETION_REMOVED_THRESHOLD = 20;
export const LARGE_DELETION_RATIO = 10;

export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith("@@")) {
    return "hunk";
  }
  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("new file mode") ||
    line.startsWith("deleted file mode") ||
    line.startsWith("similarity index") ||
    line.startsWith("rename from") ||
    line.startsWith("rename to")
  ) {
    return "meta";
  }
  if (line.startsWith("+")) {
    return "added";
  }
  if (line.startsWith("-")) {
    return "removed";
  }
  return "context";
}

export function countDiffLineChanges(diff: string | null | undefined): DiffLineChangeCounts {
  if (!diff) {
    return { added: 0, removed: 0 };
  }

  let added = 0;
  let removed = 0;

  for (const line of diff.split("\n")) {
    const kind = classifyDiffLine(line);
    if (kind === "added") {
      added += 1;
    } else if (kind === "removed") {
      removed += 1;
    }
  }

  return { added, removed };
}

export function isLargeDeletion(counts: DiffLineChangeCounts): boolean {
  if (counts.removed < LARGE_DELETION_REMOVED_THRESHOLD) {
    return false;
  }
  if (counts.added === 0) {
    return true;
  }
  return counts.removed / counts.added >= LARGE_DELETION_RATIO;
}

export function diffLineClassName(kind: DiffLineKind): string {
  switch (kind) {
    case "added":
      return "block whitespace-pre-wrap bg-emerald-500/10 text-foreground";
    case "removed":
      return "block whitespace-pre-wrap bg-red-500/10 text-foreground";
    case "hunk":
      return "block whitespace-pre-wrap bg-sky-500/5 text-muted-foreground";
    case "meta":
      return "block whitespace-pre-wrap text-muted-foreground";
    case "context":
    default:
      return "block whitespace-pre-wrap text-foreground";
  }
}

export function formatDiffChangeSummary(counts: DiffLineChangeCounts): string {
  return `+${counts.added} added · -${counts.removed} removed`;
}
