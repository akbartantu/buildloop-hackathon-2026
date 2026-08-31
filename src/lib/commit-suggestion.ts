import { redactSecrets } from "@/lib/redaction";

const DOC_PATH = /\.(md|mdx|txt|rst)$/i;
const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|spec)\/|\.(?:test|spec)\.[a-z]+$/i;

function sanitizeGoalText(goal: string): string {
  return redactSecrets(goal).replace(/\b(sk-[a-zA-Z0-9]{10,})\b/g, "[REDACTED]");
}

function inferCommitType(changedFiles: string[], goal: string): "feat" | "fix" | "docs" | "test" | "chore" {
  const normalizedGoal = goal.toLowerCase();
  if (changedFiles.length > 0 && changedFiles.every((file) => DOC_PATH.test(file) || file.startsWith("docs/"))) {
    return "docs";
  }
  if (changedFiles.some((file) => TEST_PATH.test(file.replace(/\\/g, "/")))) {
    return "test";
  }
  if (/\b(fix|bug|regression|broken|fail(?:ed|ure)?|error)\b/.test(normalizedGoal)) {
    return "fix";
  }
  if (/\b(readme|documentation|docs|subtitle|copy|clarify)\b/.test(normalizedGoal)) {
    return "docs";
  }
  if (/\b(chore|refactor|cleanup|format)\b/.test(normalizedGoal)) {
    return "chore";
  }
  return "feat";
}

function summarizeGoalForSubject(goal: string): string {
  const firstSentence = sanitizeGoalText(goal).split(/[.!?]/)[0]?.trim() ?? goal.trim();
  const cleaned = firstSentence
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase();
  if (!cleaned) {
    return "apply verified task changes";
  }
  if (cleaned.length <= 72) {
    return cleaned;
  }
  return `${cleaned.slice(0, 69).trim()}...`;
}

function displayFilePath(file: string): string {
  const normalized = file.replace(/\\/g, "/");
  const worktreeMarker = "/worktree/";
  const worktreeIdx = normalized.indexOf(worktreeMarker);
  if (worktreeIdx >= 0) {
    return normalized.slice(worktreeIdx + worktreeMarker.length);
  }
  if (/^\/tmp\//.test(normalized) || /^[A-Za-z]:\//.test(normalized)) {
    const segments = normalized.split("/").filter(Boolean);
    return segments.slice(-2).join("/") || normalized;
  }
  return normalized.replace(/^\/+/, "");
}

function fileScopeSummary(changedFiles: string[]): string {
  const displayPaths = changedFiles.map(displayFilePath);
  if (displayPaths.length === 0) {
    return "verified task scope";
  }
  if (displayPaths.length === 1) {
    return displayPaths[0]!;
  }
  if (displayPaths.length <= 3) {
    return displayPaths.join(", ");
  }
  return `${displayPaths.slice(0, 3).join(", ")} and ${displayPaths.length - 3} more`;
}

export function buildSuggestedCommitMetadata(input: {
  contractGoal: string;
  changedFiles: string[];
  checkerVerdict: string;
  deliveryBlocked: boolean;
}): { message: string; description: string } {
  const type = inferCommitType(input.changedFiles, input.contractGoal);
  const subject = summarizeGoalForSubject(input.contractGoal);
  const message = `${type}: ${subject}`;

  const scopeSummary = fileScopeSummary(input.changedFiles);
  const lines = [
    `Apply the verified BuildLoop result for: ${sanitizeGoalText(input.contractGoal.trim())}`,
    input.changedFiles.length > 0
      ? `Changed files: ${scopeSummary}.`
      : "No downloadable changed-file list is available for this run.",
    `Checker verdict: ${input.checkerVerdict}.`,
  ];

  if (input.deliveryBlocked) {
    lines.push("Manual patch download was blocked for safety. Review evidence before applying changes manually.");
  } else {
    lines.push(
      "This suggestion records the verified implementation only. BuildLoop did not execute commit, push, merge, or deploy.",
    );
  }

  return {
    message,
    description: lines.join("\n"),
  };
}
