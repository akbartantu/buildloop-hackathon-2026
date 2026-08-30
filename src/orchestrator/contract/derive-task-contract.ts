const FILE_NAME_PATTERN =
  /\b([A-Za-z0-9_./-]+\.(?:md|markdown|txt|rst|tsx?|jsx?|json|ya?ml|css|html))\b/gi;
const README_PATTERN = /\breadme(?:\.md)?\b/i;
const SRC_PATH_PATTERN = /\b(src\/[A-Za-z0-9_./-]+)\b/g;
const DOCS_PATH_PATTERN = /\b(docs\/[A-Za-z0-9_./-]+(?:\.[A-Za-z0-9]+)?)\b/g;

const GOVERNANCE_CRITERION = "No protected paths are modified.";

export type DeriveTaskContractInput = {
  goal: string;
  acceptanceCriteria?: string[];
  repositoryCandidates?: string[];
};

export type DerivedTaskContractFields = {
  expectedScope: string[];
  acceptanceCriteria: string[];
  requiredChecks: string[];
  needsClarification: boolean;
};

function normalizeUserCriteria(criteria: string[] | undefined): string[] {
  if (!criteria?.length) return [];
  return criteria.map((item) => item.trim()).filter((item) => item.length >= 3);
}

function uniqueSorted(paths: Iterable<string>): string[] {
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}

function extractExplicitScope(goal: string, criteria: string[]): string[] {
  const text = [goal, ...criteria].join("\n");
  const paths = new Set<string>();

  if (README_PATTERN.test(text)) {
    paths.add("README.md");
  }

  for (const match of text.matchAll(FILE_NAME_PATTERN)) {
    const candidate = match[1]!.replace(/^\.\//, "");
    if (!candidate.includes("*")) {
      paths.add(candidate);
    }
  }

  for (const match of text.matchAll(SRC_PATH_PATTERN)) {
    paths.add(match[1]!);
  }

  for (const match of text.matchAll(DOCS_PATH_PATTERN)) {
    paths.add(match[1]!);
  }

  return uniqueSorted(paths);
}

function mentionsProtectedPath(scope: string[]): boolean {
  return scope.some((path) =>
    [".env", "package.json", "bun.lock", "supabase/migrations", "infrastructure", ".github/workflows"].some(
      (protectedPath) => path === protectedPath || path.startsWith(`${protectedPath}/`) || path.startsWith(protectedPath.replace("*", "")),
    ),
  );
}

function isDocumentationOnlyScope(scope: string[]): boolean {
  return scope.length > 0 && scope.every((path) => path.endsWith(".md") || path.endsWith(".txt") || path.startsWith("docs/"));
}

function isGeneralImplementationTask(goal: string): boolean {
  const normalized = goal.toLowerCase();
  return /\b(feature|component|endpoint|utility|helper|function|module|page|view|hook|api|test)\b/.test(
    normalized,
  );
}

function deriveImplementationScope(goal: string): string[] {
  const explicit = extractExplicitScope(goal, []);
  if (explicit.length > 0) {
    return explicit;
  }

  const srcMatch = goal.match(/\b(src\/[A-Za-z0-9_./-]+\.(?:tsx?|jsx?|ts|js))\b/);
  if (srcMatch) {
    return [srcMatch[1]!];
  }

  return [];
}

export function deriveRequiredChecks(scope: string[]): string[] {
  if (scope.length === 0) {
    return ["scope clarification", "protected-path check"];
  }

  if (isDocumentationOnlyScope(scope)) {
    return ["file-scope check", "protected-path check", "acceptance-criteria verification"];
  }

  return ["typecheck", "relevant test", "protected-path check"];
}

function appendGovernanceCriterion(criteria: string[]): string[] {
  const normalized = criteria.map((item) => item.trim()).filter(Boolean);
  if (normalized.some((item) => /protected path/i.test(item))) {
    return normalized;
  }
  return [...normalized, GOVERNANCE_CRITERION];
}

function deriveDefaultAcceptanceCriteria(goal: string, scope: string[]): string[] {
  if (scope.length === 0) {
    return [
      "Clarify the exact files or directories BuildLoop may modify before execution.",
      GOVERNANCE_CRITERION,
    ];
  }

  if (scope.length === 1 && scope[0] === "README.md") {
    return [
      "Only README.md is modified.",
      `Fulfill the requested README change: ${goal.trim()}`,
      "Do not modify dependencies, configuration, credentials, deployment files, or application code.",
      "Existing README structure remains intact.",
      GOVERNANCE_CRITERION,
    ];
  }

  if (isDocumentationOnlyScope(scope)) {
    return [
      `Only the approved documentation paths are modified: ${scope.join(", ")}.`,
      `Fulfill the requested documentation change: ${goal.trim()}`,
      "Do not modify dependencies, configuration, credentials, deployment files, or unrelated application code.",
      GOVERNANCE_CRITERION,
    ];
  }

  if (scope.length === 1) {
    return [
      `Implement the requested change within ${scope[0]}.`,
      "Relevant checks pass.",
      GOVERNANCE_CRITERION,
    ];
  }

  return [
    `Implement the requested change within the approved scope: ${scope.join(", ")}.`,
    "Relevant checks pass.",
    GOVERNANCE_CRITERION,
  ];
}

export function isAmbiguousGoal(goal: string): boolean {
  const normalized = goal.toLowerCase();
  return (
    /\bacross the repository\b/.test(normalized) ||
    /\bproduct experience\b/.test(normalized) ||
    /\bimprove the product\b/.test(normalized) ||
    /\bthroughout the codebase\b/.test(normalized)
  );
}

export function deriveTaskContractFields(input: DeriveTaskContractInput): DerivedTaskContractFields {
  const goal = input.goal.trim();
  const userCriteria = normalizeUserCriteria(input.acceptanceCriteria);
  const explicitScope = extractExplicitScope(goal, userCriteria);

  let expectedScope: string[];
  let needsClarification = false;

  if (explicitScope.length > 0) {
    expectedScope = explicitScope;
  } else if (isAmbiguousGoal(goal)) {
    needsClarification = true;
    expectedScope = [];
  } else if (input.repositoryCandidates && input.repositoryCandidates.length > 0) {
    expectedScope = uniqueSorted(input.repositoryCandidates);
    if (expectedScope.length > 6) {
      needsClarification = true;
      expectedScope = [];
    }
  } else if (isGeneralImplementationTask(goal)) {
    expectedScope = deriveImplementationScope(goal);
    if (expectedScope.length === 0) {
      needsClarification = true;
    }
  } else {
    needsClarification = true;
    expectedScope = [];
  }

  if (mentionsProtectedPath(expectedScope)) {
    needsClarification = true;
  }

  const acceptanceCriteria =
    userCriteria.length > 0
      ? appendGovernanceCriterion(userCriteria)
      : deriveDefaultAcceptanceCriteria(goal, expectedScope);

  return {
    expectedScope,
    acceptanceCriteria,
    requiredChecks: deriveRequiredChecks(expectedScope),
    needsClarification,
  };
}

export function deriveAllowedCommands(scope: string[]): string[] {
  if (isDocumentationOnlyScope(scope)) {
    return [];
  }
  return ["bun run typecheck", "bun test", "bun run lint"];
}
