import { detectSensitiveIntent, type BlockedReason } from "@/lib/sensitive-intent";
import { evaluateProtectedPathPolicy } from "@/lib/contract-governance";
import type { ResolvedProjectPolicy } from "./policy-schema";

export type PolicyDecision = "AUTO_APPROVED" | "HUMAN_APPROVAL_REQUIRED" | "BLOCKED";

export type PolicyEvaluationInput = {
  goal: string;
  changedFiles?: string[];
  riskClassification?: "low" | "medium" | "high" | "security";
  policy: ResolvedProjectPolicy;
  sensitiveActions?: string[];
  approvalRequiredPaths?: string[];
  approvedProtectedPaths?: string[];
};

export type PolicyEvaluationResult = {
  decision: PolicyDecision;
  reason: string;
  blockedReasons: BlockedReason[];
  requiresSecurityReview: boolean;
  matchedRules: string[];
};

const SECURITY_FILE_PATTERNS = [
  /auth/i,
  /login/i,
  /session/i,
  /password/i,
  /rls/i,
  /middleware/i,
  /api\/.*route/i,
  /upload/i,
  /credential/i,
];

const SECURITY_GOAL_PATTERNS = [
  /\bauth(entication|orization)?\b/i,
  /\bsign[- ]?(up|in)\b/i,
  /\bforgot password\b/i,
  /\bsession\b/i,
  /\bpassword\b/i,
  /\brls\b/i,
  /\baccess control\b/i,
  /\bapi route\b/i,
  /\bfile upload\b/i,
];

export function classifyRisk(goal: string): "low" | "medium" | "high" | "security" {
  const normalized = goal.toLowerCase();
  if (SECURITY_GOAL_PATTERNS.some((p) => p.test(normalized))) {
    return "security";
  }
  if (/\bmigration\b|\bdeploy\b|\binfrastructure\b|\bdependency\b/.test(normalized)) {
    return "high";
  }
  if (/\brefactor\b|\bdatabase\b|\bapi\b/.test(normalized)) {
    return "medium";
  }
  return "low";
}

export function requiresSecurityReview(input: {
  goal: string;
  riskClassification?: string;
  changedFiles?: string[];
  checkerSecurityFlag?: boolean;
}): boolean {
  if (input.checkerSecurityFlag) return true;
  if (input.riskClassification === "security") return true;
  if (SECURITY_GOAL_PATTERNS.some((p) => p.test(input.goal))) return true;
  if (input.changedFiles?.some((f) => SECURITY_FILE_PATTERNS.some((p) => p.test(f)))) {
    return true;
  }
  return false;
}

/** Deterministic policy engine — separate from Security Reviewer LLM/heuristic. */
export function evaluatePolicy(input: PolicyEvaluationInput): PolicyEvaluationResult {
  const blockedReasons = detectSensitiveIntent(input.goal);
  const matchedRules: string[] = blockedReasons.map((r) => r.rule);
  const risk = input.riskClassification ?? classifyRisk(input.goal);
  const requiresSecurityReviewFlag = requiresSecurityReview({
    goal: input.goal,
    riskClassification: risk,
    ...(input.changedFiles ? { changedFiles: input.changedFiles } : {}),
  });

  if (blockedReasons.length > 0) {
    return {
      decision: "BLOCKED",
      reason: blockedReasons[0]!.explanation,
      blockedReasons,
      requiresSecurityReview: false,
      matchedRules,
    };
  }

  for (const file of input.changedFiles ?? []) {
    const protectedEval = evaluateProtectedPathPolicy({
      changedFiles: [file],
      protectedPaths: input.policy.protected_paths,
      approvalRequiredPaths: input.approvalRequiredPaths ?? [],
      ...(input.approvedProtectedPaths ? { approvedProtectedPaths: input.approvedProtectedPaths } : {}),
    });

    if (protectedEval.decision === "FORBIDDEN") {
      matchedRules.push("PROTECTED_PATH_ACCESS");
      return {
        decision: "BLOCKED",
        reason: protectedEval.reason ?? `Protected path access detected: ${file}`,
        blockedReasons: [
          {
            rule: "PROTECTED_PATH_ACCESS",
            matchedText: file,
            explanation: "Worker attempted to modify a forbidden protected path.",
            protectedTarget: file,
          },
        ],
        requiresSecurityReview: false,
        matchedRules,
      };
    }

    if (protectedEval.decision === "REQUIRES_PROTECTED_PATH_APPROVAL") {
      matchedRules.push("PROTECTED_PATH_APPROVAL_REQUIRED");
      return {
        decision: "HUMAN_APPROVAL_REQUIRED",
        reason:
          protectedEval.reason ??
          `Protected path "${file}" requires explicit human approval before modification.`,
        blockedReasons: [],
        requiresSecurityReview: requiresSecurityReviewFlag,
        matchedRules,
      };
    }
  }

  for (const action of input.sensitiveActions ?? []) {
    if (input.policy.require_human_approval.includes(action)) {
      matchedRules.push(`HUMAN_APPROVAL_${action.toUpperCase()}`);
      return {
        decision: "HUMAN_APPROVAL_REQUIRED",
        reason: `Sensitive action requires human approval: ${action}`,
        blockedReasons: [],
        requiresSecurityReview: requiresSecurityReviewFlag,
        matchedRules,
      };
    }
  }

  const goalLower = input.goal.toLowerCase();
  if (/\bmigration\b|\bmigrasi\b/.test(goalLower)) {
    matchedRules.push("DATABASE_MIGRATION");
    return {
      decision: "HUMAN_APPROVAL_REQUIRED",
      reason: "Database migration requires human approval.",
      blockedReasons: [],
      requiresSecurityReview: requiresSecurityReviewFlag,
      matchedRules,
    };
  }

  if (/\bdependency\b|\bpackage\.json\b|\bbun\.lock\b/.test(goalLower)) {
    matchedRules.push("DEPENDENCY_CHANGE");
    return {
      decision: "HUMAN_APPROVAL_REQUIRED",
      reason: "Dependency change requires human approval.",
      blockedReasons: [],
      requiresSecurityReview: requiresSecurityReviewFlag,
      matchedRules,
    };
  }

  if (risk === "high") {
    matchedRules.push("HIGH_RISK_CONTRACT");
    return {
      decision: "HUMAN_APPROVAL_REQUIRED",
      reason: "High-risk contract requires human approval.",
      blockedReasons: [],
      requiresSecurityReview: requiresSecurityReviewFlag,
      matchedRules,
    };
  }

  if (
    input.policy.execution.auto_approve_low_risk &&
    risk === "low" &&
    !requiresSecurityReviewFlag
  ) {
    matchedRules.push("AUTO_APPROVE_LOW_RISK");
    return {
      decision: "AUTO_APPROVED",
      reason: "Low-risk bounded contract auto-approved by policy.",
      blockedReasons: [],
      requiresSecurityReview: false,
      matchedRules,
    };
  }

  matchedRules.push("DEFAULT_HUMAN_APPROVAL");
  return {
    decision: "HUMAN_APPROVAL_REQUIRED",
    reason: "Contract requires human approval before execution.",
    blockedReasons: [],
    requiresSecurityReview: requiresSecurityReviewFlag,
    matchedRules,
  };
}
