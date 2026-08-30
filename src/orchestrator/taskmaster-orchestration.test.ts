import { describe, expect, test } from "bun:test";

import { planWork } from "@/orchestrator/agents/planner/planner";
import { MAX_CONTRACTS_PER_GOAL } from "@/orchestrator/agents/planner/types";
import { runSecurityReview } from "@/orchestrator/agents/security-reviewer/reviewer";
import { decide } from "@/orchestrator/decision/engine";
import { evaluatePolicy, classifyRisk, requiresSecurityReview } from "@/orchestrator/policy/evaluator";
import {
  resolveProjectPolicy,
  repositoryPolicyWeakensMandatoryProtections,
} from "@/orchestrator/policy/policy-schema";
import { parseMinimalYaml } from "@/orchestrator/policy/project-policy";
import { evaluateContractApproval, resolveInitialTaskStatus } from "@/orchestrator/policy/auto-approval";
import { DEFAULT_POLICY } from "@/orchestrator/policy/mandatory-protections";
import { detectSensitiveIntent } from "@/lib/sensitive-intent";
import type { CheckerResult } from "@/orchestrator/checker/deterministic-checker";

const policy = resolveProjectPolicy(null);

describe("Taskmaster Planner", () => {
  test("large auth goal decomposes into bounded contracts", () => {
    const plan = planWork({
      goal: "Build authentication: sign up, sign in, forgot password",
      taskId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    expect(plan.decomposed).toBe(true);
    expect(plan.contracts.length).toBeGreaterThan(1);
    expect(plan.contracts.length).toBeLessThanOrEqual(MAX_CONTRACTS_PER_GOAL);
    expect(plan.contracts[0]!.id).toMatch(/^AUTH-/);
  });

  test("simple task remains single contract", () => {
    const plan = planWork({
      goal: "Add a small safe feature and its focused test",
      taskId: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    expect(plan.decomposed).toBe(false);
    expect(plan.contracts).toHaveLength(1);
  });

  test("decomposition max limit enforced", () => {
    const plan = planWork({
      goal: "Build authentication: sign up, sign in, forgot password, oauth, mfa, audit",
      taskId: "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee",
      maxContracts: 4,
    });
    expect(plan.contracts.length).toBeLessThanOrEqual(4);
  });
});

describe("Policy Engine", () => {
  test("low-risk contract auto-approved", () => {
    const result = evaluateContractApproval(
      { goal: "Add helper text to settings page", riskClassification: "low" },
      policy,
    );
    expect(result.autoApproved).toBe(true);
    expect(result.approvalType).toBe("AUTO_APPROVED_BY_POLICY");
  });

  test("auto approval cannot bypass protected paths", () => {
    const result = evaluatePolicy({
      goal: "Update settings page",
      changedFiles: [".env"],
      policy,
    });
    expect(result.decision).toBe("BLOCKED");
  });

  test("sensitive action becomes AWAITING_APPROVAL", () => {
    const result = evaluatePolicy({
      goal: "Add new npm dependency for date formatting utilities",
      policy,
    });
    expect(result.decision).toBe("HUMAN_APPROVAL_REQUIRED");
  });

  test("prohibited action becomes BLOCKED", () => {
    const result = evaluatePolicy({
      goal: "Commit and push changes to main branch",
      policy,
    });
    expect(result.decision).toBe("BLOCKED");
  });

  test("invalid policy fails safely", () => {
    const resolved = resolveProjectPolicy({ version: 99, execution: "bad" });
    expect(resolved.policySource).toBe("invalid_fallback");
    expect(resolved.execution.max_corrections).toBe(2);
  });

  test("repository policy may strengthen protections", () => {
    const yaml = parseMinimalYaml(`
version: 1
protected_paths:
  - "custom/secret/**"
`);
    const resolved = resolveProjectPolicy(yaml);
    expect(resolved.protected_paths).toContain("custom/secret/**");
    expect(resolved.protected_paths).toContain(".env*");
  });

  test("repository policy cannot weaken mandatory protections", () => {
    const weakens = repositoryPolicyWeakensMandatoryProtections({
      version: 1,
      require_human_approval: [],
    });
    expect(weakens).toBe(true);
  });
});

describe("Decision Engine", () => {
  const passedChecker: CheckerResult = {
    evidence: [],
    blocked: false,
    failed: false,
    passed: true,
  };

  test("correction max remains 2", () => {
    const failedChecker: CheckerResult = {
      evidence: [{ id: "1", runId: "r", attemptNumber: 1, category: "test", name: "t", status: "fail", summary: "fail", details: "", affectedFiles: [], severity: "error", createdAt: "" }],
      blocked: false,
      failed: true,
      passed: false,
    };
    const atLimit = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: failedChecker,
      correctionCount: 2,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(atLimit.outcome).toBe("FAILED");
    expect(atLimit.rule).toBe("CORRECTION_LIMIT");
  });

  test("operational errors do not consume correction attempts", () => {
    const opChecker: CheckerResult = {
      evidence: [{ id: "1", runId: "r", attemptNumber: 1, category: "command", name: "worker_operational_error", status: "fail", summary: "429", details: "", affectedFiles: [], severity: "error", createdAt: "" }],
      blocked: false,
      failed: true,
      passed: false,
      operationalFailure: true,
    };
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: opChecker,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(result.outcome).toBe("FAILED");
    expect(result.rule).toBe("OPERATIONAL_FAILURE");
  });

  test("security finding can trigger correction", () => {
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: passedChecker,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
      securityReviewVerdict: "CORRECTABLE",
    });
    expect(result.outcome).toBe("CORRECTION_ALLOWED");
    expect(result.rule).toBe("SECURITY_CORRECTION_ALLOWED");
  });

  test("high-risk security finding can require approval", () => {
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: passedChecker,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
      securityReviewVerdict: "REQUIRES_APPROVAL",
    });
    expect(result.outcome).toBe("AWAITING_APPROVAL");
  });

  test("runtime escalation to AWAITING_APPROVAL", () => {
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: passedChecker,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
      runtimeEscalation: "AWAITING_APPROVAL",
    });
    expect(result.outcome).toBe("AWAITING_APPROVAL");
    expect(result.rule).toBe("RUNTIME_ESCALATION_APPROVAL");
  });
});

describe("Security Reviewer", () => {
  test("triggers for auth task", () => {
    expect(
      requiresSecurityReview({ goal: "Build authentication sign up flow" }),
    ).toBe(true);
    const review = runSecurityReview({
      runId: "run-1",
      attemptNumber: 1,
      goal: "Build authentication sign up flow",
      changedFiles: ["src/lib/auth/signup.ts"],
    });
    expect(review.invoked).toBe(true);
  });

  test("skips trivial copy task", () => {
    const review = runSecurityReview({
      runId: "run-2",
      attemptNumber: 1,
      goal: "Change button copy on homepage",
      changedFiles: ["src/components/site/home-page.tsx"],
    });
    expect(review.invoked).toBe(false);
  });

  test("detects hardcoded credential pattern", () => {
    const review = runSecurityReview({
      runId: "run-3",
      attemptNumber: 1,
      goal: "Build authentication sign in",
      changedFiles: ["src/auth.ts"],
      diffContent: 'const api_key = "sk-live-secret"',
    });
    expect(review.invoked).toBe(true);
    expect(review.findings.some((f) => f.severity === "critical")).toBe(true);
  });
});

describe("Governance separation", () => {
  test("worker cannot self-approve — detectSensitiveIntent blocks git write", () => {
    const reasons = detectSensitiveIntent("Implement feature and commit to repository");
    expect(reasons.some((r) => r.rule === "GIT_WRITE_ACTION")).toBe(true);
  });

  test("instructions.md cannot override policy — mandatory paths preserved", () => {
    const resolved = resolveProjectPolicy({
      version: 1,
      protected_paths: [],
      require_human_approval: [],
    });
    expect(resolved.protected_paths).toContain(".env*");
    expect(resolved.require_human_approval).toContain("credential_access");
  });

  test("initial task status for low-risk is auto-approved when policy allows", () => {
    const plan = planWork({
      goal: "Add a small safe feature and its focused test",
      taskId: "dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    const initial = resolveInitialTaskStatus(plan.contracts, policy);
    expect(initial.status).toBe("APPROVED_FOR_EXECUTION");
    expect(initial.approvalType).toBe("AUTO_APPROVED_BY_POLICY");
  });

  test("migration goal requires human approval not auto", () => {
    const plan = planWork({
      goal: "Add users table via supabase migration",
      taskId: "eeeeeeee-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    const initial = resolveInitialTaskStatus(plan.contracts, policy);
    expect(initial.status).not.toBe("APPROVED_FOR_EXECUTION");
  });
});

describe("Risk classification", () => {
  test("auth goal classified as security", () => {
    expect(classifyRisk("Build authentication sign up")).toBe("security");
  });

  test("safe feature classified as low", () => {
    expect(classifyRisk("Add helper text to settings")).toBe("low");
  });
});
