import { PROTECTED_PATHS } from "@/lib/task-contract";
import { mergeUserAndGeneratedCriteria } from "@/lib/planning/clarification-policy";
import type { PlanningSpecificationEntry } from "@/lib/specifications/specification-set-record";
import type { DerivedTaskContractFields } from "@/orchestrator/contract/derive-task-contract";

export const GOVERNANCE_CRITERION_STRICT = "No protected paths are modified.";
export const GOVERNANCE_CRITERION_APPROVAL_REQUIRED =
  "Protected paths must not be modified without explicit human approval.";

/** Protected paths that may be approval-required for dependency/bootstrap initialization. */
export const DEPENDENCY_CONFIGURATION_PROTECTED_PATHS = ["package.json", "bun.lock"] as const;

export type ProtectedPathDisposition = "allowed" | "approval_required" | "forbidden";

export type ContractGovernanceInput = {
  goal: string;
  specifications: PlanningSpecificationEntry[];
  repositoryManifestPaths: string[];
  derived: DerivedTaskContractFields;
  userCriteria?: string[];
};

export type ContractGovernancePlan = {
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  approvalRequiredPaths: string[];
  executionAllowedPaths: string[];
  useApprovalGovernance: boolean;
  isGreenfieldBootstrap: boolean;
  needsClarification: boolean;
  clarificationReason?: string;
};

const GREENFIELD_EXECUTION_ALLOWED_PATHS = [
  "src/**",
  "app/**",
  "components/**",
  "public/**",
  "pages/**",
  "styles/**",
  "tsconfig.json",
  "next.config.js",
  "next.config.ts",
  "next.config.mjs",
  "postcss.config.js",
  "tailwind.config.js",
  "tailwind.config.ts",
] as const;

export type ContractConsistencyResult =
  | { ok: true }
  | { ok: false; reason: string };

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function matchesPathPattern(filePath: string, pattern: string): boolean {
  const normalized = normalizePath(filePath);
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (pattern.includes("*")) {
    const regex = new RegExp(
      `^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
    );
    return regex.test(normalized);
  }
  return normalized === pattern;
}

export function isGreenfieldRepository(manifestPaths: string[]): boolean {
  const normalized = manifestPaths.map(normalizePath);
  const hasPackageJson = normalized.includes("package.json");
  const hasAppSource = normalized.some(
    (entry) => entry.startsWith("src/") && !entry.startsWith("src/orchestrator/"),
  );
  return !hasPackageJson && !hasAppSource;
}

export function isBootstrapInitializationGoal(goal: string): boolean {
  const normalized = goal.toLowerCase();
  return (
    /\b(initializ(e|ing|ation)?|bootstrap|scaffold(ing)?|foundation|greenfield)\b/.test(normalized) ||
    /\b(frontend baseline|application shell|dashboard shell|app shell)\b/.test(normalized) ||
    /\bset up\b|\bsetup\b/.test(normalized)
  );
}

export function detectsApprovedStack(
  goal: string,
  specifications: PlanningSpecificationEntry[],
  userCriteria?: string[],
): boolean {
  const haystack = [
    goal,
    ...specifications.map((spec) => `${spec.filename}\n${spec.content}`),
    ...(userCriteria ?? []),
  ]
    .join("\n")
    .toLowerCase();
  return (
    /\bnext\.?js\b/.test(haystack) ||
    /\breact\b/.test(haystack) ||
    /\btypescript\b/.test(haystack) ||
    /\bvite\b/.test(haystack) ||
    /\bapproved frontend baseline\b/.test(haystack)
  );
}

export function detectGreenfieldBootstrap(input: ContractGovernanceInput): boolean {
  return (
    isGreenfieldRepository(input.repositoryManifestPaths) &&
    isBootstrapInitializationGoal(input.goal) &&
    detectsApprovedStack(input.goal, input.specifications, input.userCriteria)
  );
}

function deriveGreenfieldInScope(goal: string, specifications: PlanningSpecificationEntry[]): string[] {
  const haystack = [goal, ...specifications.map((spec) => `${spec.filename}\n${spec.content}`)].join(
    "\n",
  );
  const scope: string[] = [];

  if (/\bnext\.?js\b/i.test(haystack) && /\btypescript\b/i.test(haystack)) {
    scope.push("Next.js + TypeScript frontend baseline");
  } else if (/\bnext\.?js\b/i.test(haystack)) {
    scope.push("Next.js frontend baseline");
  } else if (/\btypescript\b/i.test(haystack)) {
    scope.push("TypeScript frontend baseline");
  } else if (/\b(frontend|react)\b/i.test(haystack)) {
    scope.push("Approved frontend baseline");
  }

  if (/\b(shell|responsive)\b/i.test(goal) || /\bdashboard shell\b/i.test(goal)) {
    scope.push("Responsive application shell");
  }
  if (/\bnavigation\b/i.test(goal)) {
    scope.push("Navigation");
  }
  if (/\bdashboard\b/i.test(goal) || /\bmock data\b/i.test(goal)) {
    scope.push("Dashboard using mock data only");
  }

  return [...new Set(scope)];
}

export function deriveGreenfieldOutOfScope(): string[] {
  return [
    "Authentication",
    "Database and migrations",
    "Backend services",
    "External APIs",
    "AI/LLM integrations",
    "Deployment and infrastructure",
    "Unrelated refactoring",
    "Unrelated dependency or configuration changes",
  ];
}

export function deriveDefaultOutOfScope(): string[] {
  return [
    "Deployment and infrastructure",
    "Credentials and secrets",
    "Dependency and lockfile",
    "Database and migrations",
    "Unrelated refactoring",
  ];
}

export function resolveGovernanceCriterion(useApprovalRequired: boolean): string {
  return useApprovalRequired ? GOVERNANCE_CRITERION_APPROVAL_REQUIRED : GOVERNANCE_CRITERION_STRICT;
}

export function appendGovernanceCriterion(
  criteria: string[],
  useApprovalRequired = false,
): string[] {
  const normalized = criteria.map((item) => item.trim()).filter(Boolean);
  if (normalized.some((item) => /protected path/i.test(item))) {
    return normalized.map((item) =>
      item === GOVERNANCE_CRITERION_STRICT && useApprovalRequired
        ? GOVERNANCE_CRITERION_APPROVAL_REQUIRED
        : item,
    );
  }
  return [...normalized, resolveGovernanceCriterion(useApprovalRequired)];
}

export const GREENFIELD_BASE_ACCEPTANCE_CRITERIA = [
  "Approved frontend baseline is initialized within the approved task scope.",
  "Responsive shell, navigation, and dashboard use mock data only.",
  "No authentication, backend, database, deployment, or external API integration is introduced.",
] as const;

function deriveGreenfieldAcceptanceCriteria(
  useApprovalRequired: boolean,
  userCriteria?: string[],
): string[] {
  const merged = mergeUserAndGeneratedCriteria(
    userCriteria,
    [...GREENFIELD_BASE_ACCEPTANCE_CRITERIA],
  );
  return appendGovernanceCriterion(merged, useApprovalRequired);
}

export function classifyProtectedPathForTask(
  protectedPath: string,
  approvalRequiredPaths: string[],
): ProtectedPathDisposition {
  if (approvalRequiredPaths.some((entry) => matchesPathPattern(protectedPath, entry))) {
    return "approval_required";
  }
  return "forbidden";
}

export function deriveContractGovernance(input: ContractGovernanceInput): ContractGovernancePlan {
  const isGreenfieldBootstrap = detectGreenfieldBootstrap(input);

  if (
    isGreenfieldRepository(input.repositoryManifestPaths) &&
    isBootstrapInitializationGoal(input.goal) &&
    !detectsApprovedStack(input.goal, input.specifications, input.userCriteria)
  ) {
    return {
      inScope: input.derived.expectedScope,
      outOfScope: deriveDefaultOutOfScope(),
      acceptanceCriteria: input.derived.acceptanceCriteria,
      approvalRequiredPaths: [],
      executionAllowedPaths: [],
      useApprovalGovernance: false,
      isGreenfieldBootstrap: false,
      needsClarification: true,
      clarificationReason:
        "Specify the approved frontend framework or stack in the goal or workspace specification before bootstrap planning.",
    };
  }

  if (!isGreenfieldBootstrap) {
    return {
      inScope: input.derived.expectedScope,
      outOfScope: deriveDefaultOutOfScope(),
      acceptanceCriteria: appendGovernanceCriterion(
        input.userCriteria?.length ? input.userCriteria : input.derived.acceptanceCriteria,
        false,
      ),
      approvalRequiredPaths: [],
      executionAllowedPaths: [],
      useApprovalGovernance: false,
      isGreenfieldBootstrap: false,
      needsClarification: input.derived.needsClarification,
    };
  }

  const greenfieldScope = deriveGreenfieldInScope(input.goal, input.specifications);
  const approvalRequiredPaths = [...DEPENDENCY_CONFIGURATION_PROTECTED_PATHS];

  return {
    inScope: greenfieldScope.length > 0 ? greenfieldScope : input.derived.expectedScope,
    outOfScope: deriveGreenfieldOutOfScope(),
    acceptanceCriteria: deriveGreenfieldAcceptanceCriteria(true, input.userCriteria),
    approvalRequiredPaths,
    executionAllowedPaths: [...GREENFIELD_EXECUTION_ALLOWED_PATHS],
    useApprovalGovernance: true,
    isGreenfieldBootstrap: true,
    needsClarification: greenfieldScope.length === 0,
    ...(greenfieldScope.length === 0
      ? {
          clarificationReason:
            "Greenfield bootstrap detected but BuildLoop could not derive a bounded in-scope summary.",
        }
      : {}),
  };
}

export function validateContractConsistency(plan: ContractGovernancePlan): ContractConsistencyResult {
  const criteriaText = plan.acceptanceCriteria.join("\n").toLowerCase();
  const outOfScopeText = plan.outOfScope.join("\n").toLowerCase();

  if (
    plan.approvalRequiredPaths.length > 0 &&
    criteriaText.includes("no protected paths are modified")
  ) {
    return {
      ok: false,
      reason:
        "Contract requires approval-gated protected paths but acceptance criteria forbid all protected-path changes.",
    };
  }

  if (
    plan.isGreenfieldBootstrap &&
    (outOfScopeText.includes("dependency dan lockfile") ||
      outOfScopeText.includes("dependency and lockfile"))
  ) {
    return {
      ok: false,
      reason:
        "Greenfield bootstrap contract cannot mark all dependency and lockfile work as out of scope.",
    };
  }

  if (plan.isGreenfieldBootstrap && plan.inScope.length === 0) {
    return {
      ok: false,
      reason: "Greenfield bootstrap contract must define bounded in-scope work.",
    };
  }

  if (
    plan.useApprovalGovernance &&
    !criteriaText.includes("explicit human approval") &&
    !criteriaText.includes("without explicit human approval")
  ) {
    return {
      ok: false,
      reason: "Approval-required protected-path tasks must state explicit human approval is required.",
    };
  }

  return { ok: true };
}

export function isProtectedPathWriteApproved(
  filePath: string,
  approvalRequiredPaths: string[],
  approvedPaths: string[] | undefined,
): boolean {
  if (!approvedPaths?.length) {
    return false;
  }
  const requiresApproval = approvalRequiredPaths.some((entry) => matchesPathPattern(filePath, entry));
  if (!requiresApproval) {
    return false;
  }
  return approvedPaths.some((approved) => matchesPathPattern(filePath, approved));
}

export function evaluateProtectedPathPolicy(input: {
  changedFiles: string[];
  protectedPaths: readonly string[];
  approvalRequiredPaths: string[];
  approvedProtectedPaths?: string[];
}): {
  decision: "ALLOW" | "REQUIRES_PROTECTED_PATH_APPROVAL" | "FORBIDDEN";
  path?: string;
  reason?: string;
} {
  for (const file of input.changedFiles) {
    const normalized = normalizePath(file);
    const isProtected = input.protectedPaths.some((pattern) => matchesPathPattern(normalized, pattern));
    if (!isProtected) {
      continue;
    }

    const disposition = classifyProtectedPathForTask(normalized, input.approvalRequiredPaths);
    if (disposition === "approval_required") {
      if (isProtectedPathWriteApproved(normalized, input.approvalRequiredPaths, input.approvedProtectedPaths)) {
        continue;
      }
      return {
        decision: "REQUIRES_PROTECTED_PATH_APPROVAL",
        path: normalized,
        reason: `Protected path "${normalized}" requires explicit human approval before modification.`,
      };
    }

    return {
      decision: "FORBIDDEN",
      path: normalized,
      reason: `Protected path "${normalized}" is forbidden for this task.`,
    };
  }

  return { decision: "ALLOW" };
}

export function listMandatoryProtectedPaths(): readonly string[] {
  return PROTECTED_PATHS;
}
