import { computeManifestRevision } from "@/orchestrator/manifest/revision";

const SOURCE_EXTENSIONS = /\.(tsx?|jsx?|ts|js|md|css|html|json|ya?ml)$/i;

const manifestCache = new Map<string, Promise<Array<{ path: string }>>>();

export function clearDiscoverCandidatePathsCache(): void {
  manifestCache.clear();
}

export function invalidateDiscoverCandidatePathsCache(workspaceRoot: string): void {
  manifestCache.delete(workspaceRoot);
}

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
  "buildloop",
  "update",
  "fix",
  "add",
  "implement",
  "change",
  "modify",
  "flow",
  "feature",
  "small",
  "safe",
  "its",
  "focused",
  "test",
  "tests",
  "file",
  "files",
  "path",
  "paths",
]);

function tokenizeGoal(goal: string): string[] {
  const tokens = goal.toLowerCase().match(GOAL_TOKEN_PATTERN) ?? [];
  return [...new Set(tokens.filter((token) => !STOP_WORDS.has(token) && token.length >= 3))];
}

function scorePath(path: string, tokens: string[]): number {
  const normalized = path.toLowerCase().replace(/\\/g, "/");
  const segments = normalized.split("/");
  const fileName = segments.at(-1) ?? normalized;
  let score = 0;

  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += token.length >= 6 ? 4 : 3;
    }
    if (fileName.includes(token)) {
      score += 2;
    }
    for (const segment of segments) {
      if (segment.includes(token)) {
        score += 1;
      }
    }
  }

  if (normalized === "readme.md" && tokens.some((token) => token.startsWith("readme"))) {
    score += 10;
  }

  return score;
}

export type DiscoverCandidatePathsResult = {
  candidates: string[];
  confidence: "high" | "low" | "none";
};

async function listSourceFiles(workspaceRoot: string): Promise<Array<{ path: string }>> {
  const cached = manifestCache.get(workspaceRoot);
  if (cached) {
    return cached;
  }

  const pending = computeManifestRevision(workspaceRoot)
    .then((manifest) => manifest.entries.filter((entry) => SOURCE_EXTENSIONS.test(entry.path)))
    .catch(() => [] as Array<{ path: string }>);
  manifestCache.set(workspaceRoot, pending);
  return pending;
}

/** Deterministic repository inspection — proposes narrow candidate paths, never grants permission. */
export async function discoverCandidatePaths(
  goal: string,
  workspaceRoot: string,
): Promise<DiscoverCandidatePathsResult> {
  const tokens = tokenizeGoal(goal);
  if (tokens.length === 0) {
    return { candidates: [], confidence: "none" };
  }

  const entries = await listSourceFiles(workspaceRoot);

  const scored = entries
    .map((entry) => ({ path: entry.path, score: scorePath(entry.path, tokens) }))
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  if (scored.length === 0) {
    return { candidates: [], confidence: "none" };
  }

  const topScore = scored[0]!.score;
  const relativeLeaders = scored.filter((entry) => entry.score >= topScore - 1);
  const candidates = relativeLeaders.slice(0, 6).map((entry) => entry.path);

  if (candidates.length === 1) {
    return { candidates, confidence: "high" };
  }

  if (candidates.length <= 4 && topScore >= 5) {
    return { candidates, confidence: "high" };
  }

  if (candidates.length <= 6 && topScore >= 4) {
    return { candidates, confidence: "low" };
  }

  return { candidates: [], confidence: "none" };
}
