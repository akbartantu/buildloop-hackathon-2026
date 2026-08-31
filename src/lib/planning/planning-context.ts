import { discoverCandidatePaths } from "@/orchestrator/contract/discover-candidate-paths";
import { isAmbiguousGoal } from "@/orchestrator/contract/derive-task-contract";
import type { PlanningSpecificationEntry } from "@/lib/specifications/specification-set-record";
import type { PlanningSource } from "./planning-source";

const GOAL_TOKEN_PATTERN = /\b[a-z][a-z0-9_-]{2,}\b/gi;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "without",
  "within",
  "only",
  "task",
  "update",
  "add",
  "implement",
  "change",
  "modify",
  "flow",
  "feature",
  "small",
  "safe",
  "file",
  "files",
]);

function tokenizeGoal(goal: string): string[] {
  const tokens = goal.toLowerCase().match(GOAL_TOKEN_PATTERN) ?? [];
  return [...new Set(tokens.filter((token) => !STOP_WORDS.has(token) && token.length >= 3))];
}

export function isPasswordResetGoal(goal: string): boolean {
  const normalized = goal.toLowerCase();
  return /\b(forgot password|password reset|reset password)\b/.test(normalized);
}

export function isReadmeGoal(goal: string): boolean {
  return /\breadme(?:\.md)?\b/i.test(goal);
}

function planningHaystack(entry: PlanningSpecificationEntry): string {
  return [
    entry.filename,
    entry.path ?? "",
    entry.documentType,
    entry.setName ?? "",
    entry.fileRole ?? "",
    entry.content,
  ]
    .join(" ")
    .toLowerCase();
}

export function selectRelevantSpecifications(
  goal: string,
  specifications: PlanningSpecificationEntry[],
): PlanningSpecificationEntry[] {
  if (specifications.length === 0) {
    return [];
  }

  const tokens = tokenizeGoal(goal);
  const passwordReset = isPasswordResetGoal(goal);
  const authRelated = passwordReset || /\b(auth|sign[- ]?in|sign[- ]?up)\b/i.test(goal);

  const scored = specifications
    .map((spec) => {
      const haystack = planningHaystack(spec);
      let score = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) {
          score += 2;
        }
      }
      if (authRelated && /\b(auth|password|reset|sign[- ]?in|sign[- ]?up|supabase)\b/.test(haystack)) {
        score += 5;
      }
      if (passwordReset && /\b(password|reset|recovery|forgot)\b/.test(haystack)) {
        score += 4;
      }
      if (isReadmeGoal(goal) && spec.filename.toLowerCase().includes("readme")) {
        score += 8;
      }
      if (spec.fileRole === "spec" && /\b(requirement|feature|scope)\b/i.test(goal)) {
        score += 3;
      }
      if (spec.fileRole === "tasks" && /\b(task|implement|deliverable)\b/i.test(goal)) {
        score += 3;
      }
      if (spec.fileRole === "plan" && /\b(plan|approach|architecture)\b/i.test(goal)) {
        score += 2;
      }
      return { spec, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const orderA = a.spec.sortOrder ?? 999;
      const orderB = b.spec.sortOrder ?? 999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.spec.path ?? a.spec.filename).localeCompare(b.spec.path ?? b.spec.filename);
    });

  return scored.slice(0, 6).map((entry) => entry.spec);
}

function extractSectionReference(content: string, keyword: RegExp): string | undefined {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (keyword.test(line)) {
      const heading = line.replace(/^#+\s*/, "").trim();
      return heading.slice(0, 120) || undefined;
    }
  }
  return undefined;
}

export function specificationSourcesForGoal(
  goal: string,
  specifications: PlanningSpecificationEntry[],
): PlanningSource[] {
  return specifications.map((spec) => {
    let section: string | undefined;
    if (isPasswordResetGoal(goal)) {
      section = extractSectionReference(spec.content, /password|reset|recovery|authentication/i);
    } else if (isReadmeGoal(goal)) {
      section = extractSectionReference(spec.content, /readme|overview|subtitle/i);
    }

    const displayName = spec.setName
      ? `${spec.setName}/${spec.filename}`
      : spec.filename;

    return {
      sourceType: "specification" as const,
      displayName,
      ...(spec.path ? { path: spec.path } : {}),
      ...(section ? { section } : {}),
      documentId: spec.id,
      ...(spec.setId ? { setId: spec.setId } : {}),
      ...(spec.setName ? { setName: spec.setName } : {}),
      ...(spec.fileRole ? { fileRole: spec.fileRole } : {}),
    };
  });
}

export async function repositorySourcesForGoal(
  goal: string,
  workspaceRoot: string,
  sourceCommitSha?: string | null,
): Promise<PlanningSource[]> {
  if (isReadmeGoal(goal) || isAmbiguousGoal(goal)) {
    return sourceCommitSha
      ? [
          {
            sourceType: "source_commit" as const,
            displayName: sourceCommitSha.slice(0, 7),
            sourceCommitSha,
          },
        ]
      : [];
  }

  const discovered = await discoverCandidatePaths(goal, workspaceRoot);
  const sources: PlanningSource[] = discovered.candidates.slice(0, 4).map((candidatePath) => ({
    sourceType: "repository_file" as const,
    displayName: candidatePath,
    path: candidatePath,
    ...(sourceCommitSha ? { sourceCommitSha } : {}),
  }));

  if (sourceCommitSha) {
    sources.push({
      sourceType: "source_commit",
      displayName: sourceCommitSha.slice(0, 7),
      sourceCommitSha,
    });
  }

  return sources;
}

export type PlanningContextBundle = {
  relevantSpecifications: PlanningSpecificationEntry[];
  sourcesUsed: PlanningSource[];
};

export async function buildPlanningContext(input: {
  goal: string;
  specifications: PlanningSpecificationEntry[];
  workspaceRoot: string;
  sourceCommitSha?: string | null;
}): Promise<PlanningContextBundle> {
  const relevantSpecifications = selectRelevantSpecifications(input.goal, input.specifications);
  const specSources = specificationSourcesForGoal(input.goal, relevantSpecifications);
  const repoSources = await repositorySourcesForGoal(
    input.goal,
    input.workspaceRoot,
    input.sourceCommitSha,
  );

  const sourcesUsed = [...specSources, ...repoSources];
  return { relevantSpecifications, sourcesUsed };
}
