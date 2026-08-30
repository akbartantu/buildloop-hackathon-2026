import type { CheckerEvidence } from "@/orchestrator/types";
import { requiresSecurityReview } from "@/orchestrator/policy/evaluator";

export type SecurityFindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export type SecurityFinding = {
  id: string;
  severity: SecurityFindingSeverity;
  finding: string;
  evidence: string;
  recommendedCorrection: string | null;
  requiresApproval: boolean;
};

export type SecurityReviewVerdict = "PASS" | "CORRECTABLE" | "REQUIRES_APPROVAL" | "BLOCKED";

export type SecurityReviewResult = {
  invoked: boolean;
  skippedReason: string | null;
  verdict: SecurityReviewVerdict | null;
  findings: SecurityFinding[];
  evidence: CheckerEvidence[];
};

export type SecurityReviewInput = {
  runId: string;
  attemptNumber: number;
  goal: string;
  changedFiles: string[];
  diffContent?: string;
  checkerSecurityFlag?: boolean;
};

const UNSAFE_PATTERNS: Array<{
  pattern: RegExp;
  severity: SecurityFindingSeverity;
  finding: string;
  correction: string;
  requiresApproval: boolean;
}> = [
  {
    pattern: /\bpassword\b.*=\s*["'][^"']+["']/i,
    severity: "critical",
    finding: "Hardcoded password detected in changed content.",
    correction: "Remove hardcoded password; use environment configuration.",
    requiresApproval: true,
  },
  {
    pattern: /\bapi[_-]?key\b\s*[:=]\s*["'][^"']+["']/i,
    severity: "critical",
    finding: "Hardcoded API key detected.",
    correction: "Remove hardcoded key; use secret management.",
    requiresApproval: true,
  },
  {
    pattern: /\beval\s*\(/,
    severity: "high",
    finding: "Use of eval() detected — potential code injection risk.",
    correction: "Replace eval with safe parsing.",
    requiresApproval: false,
  },
  {
    pattern: /\.innerHTML\s*=/,
    severity: "medium",
    finding: "Direct innerHTML assignment — potential XSS.",
    correction: "Use textContent or sanitized rendering.",
    requiresApproval: false,
  },
  {
    pattern: /\bsql\b.*\+.*\b(req\.|request\.|params\.|query\.)/i,
    severity: "high",
    finding: "Possible SQL injection via string concatenation.",
    correction: "Use parameterized queries.",
    requiresApproval: false,
  },
  {
    pattern: /\bfetch\s*\(\s*(req\.|request\.|params\.|user\.)/i,
    severity: "medium",
    finding: "User-controlled URL in fetch — potential SSRF.",
    correction: "Validate and allowlist URLs before fetch.",
    requiresApproval: true,
  },
  {
    pattern: /\bsession\b.*(?:httpOnly\s*:\s*false|secure\s*:\s*false)/i,
    severity: "medium",
    finding: "Insecure session cookie configuration.",
    correction: "Set httpOnly and secure flags on session cookies.",
    requiresApproval: false,
  },
  {
    pattern: /user\s*(?:\.|\[).*email.*(?:===|==|includes).*req/i,
    severity: "low",
    finding: "Possible account enumeration in auth flow.",
    correction: "Use generic error messages for auth failures.",
    requiresApproval: false,
  },
];

/** Deterministic security reviewer — bounded appsec review, not production pentesting. */
export function runSecurityReview(input: SecurityReviewInput): SecurityReviewResult {
  const shouldInvoke = requiresSecurityReview({
    goal: input.goal,
    changedFiles: input.changedFiles,
    ...(input.checkerSecurityFlag !== undefined
      ? { checkerSecurityFlag: input.checkerSecurityFlag }
      : {}),
  });

  if (!shouldInvoke) {
    return {
      invoked: false,
      skippedReason: "No security-relevant contract or file changes.",
      verdict: null,
      findings: [],
      evidence: [],
    };
  }

  const now = new Date().toISOString();
  const findings: SecurityFinding[] = [];
  const contentToScan = [input.diffContent ?? "", ...input.changedFiles].join("\n");

  for (const rule of UNSAFE_PATTERNS) {
    if (rule.pattern.test(contentToScan)) {
      findings.push({
        id: crypto.randomUUID(),
        severity: rule.severity,
        finding: rule.finding,
        evidence: `Pattern matched in security-relevant changes.`,
        recommendedCorrection: rule.correction,
        requiresApproval: rule.requiresApproval,
      });
    }
  }

  const authFiles = input.changedFiles.filter((f) => /auth|login|session|password/i.test(f));
  if (authFiles.length > 0 && findings.length === 0) {
    findings.push({
      id: crypto.randomUUID(),
      severity: "info",
      finding: "Authentication-related files changed — manual review recommended.",
      evidence: `Files: ${authFiles.join(", ")}`,
      recommendedCorrection: null,
      requiresApproval: false,
    });
  }

  const evidence: CheckerEvidence[] = [
    {
      id: crypto.randomUUID(),
      runId: input.runId,
      attemptNumber: input.attemptNumber,
      category: "acceptance",
      name: "security_review",
      status: findings.some((f) => f.severity === "critical" || f.severity === "high")
        ? "fail"
        : "pass",
      summary: `Security review: ${findings.length} finding(s).`,
      details: JSON.stringify(findings),
      affectedFiles: input.changedFiles,
      severity: findings.some((f) => f.severity === "critical") ? "critical" : "info",
      createdAt: now,
    },
  ];

  let verdict: SecurityReviewVerdict = "PASS";
  if (findings.some((f) => f.severity === "critical")) {
    verdict = findings.some((f) => f.requiresApproval) ? "REQUIRES_APPROVAL" : "BLOCKED";
  } else if (findings.some((f) => f.severity === "high" || f.severity === "medium")) {
    verdict = findings.some((f) => f.requiresApproval) ? "REQUIRES_APPROVAL" : "CORRECTABLE";
  } else if (findings.some((f) => f.severity === "low")) {
    verdict = "CORRECTABLE";
  }

  return {
    invoked: true,
    skippedReason: null,
    verdict,
    findings,
    evidence,
  };
}
