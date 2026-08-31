import { describe, expect, test } from "bun:test";

import {
  DEPENDENCY_CONFIGURATION_PROTECTED_PATHS,
  GOVERNANCE_CRITERION_APPROVAL_REQUIRED,
  GOVERNANCE_CRITERION_STRICT,
  deriveContractGovernance,
  deriveGreenfieldOutOfScope,
  detectGreenfieldBootstrap,
  evaluateProtectedPathPolicy,
  validateContractConsistency,
} from "@/lib/contract-governance";
import { deriveTaskContractFields } from "@/orchestrator/contract/derive-task-contract";
import { planAndEvaluateTask } from "@/lib/task-planning";
import { documentToPlanningEntry } from "@/lib/specifications/specification-planning";
import {
  extractApprovedProtectedPaths,
  recordProtectedPathApproval,
  resolvePatchProtectedPathDecision,
} from "@/lib/protected-path-approval";
import { evaluatePolicy } from "@/orchestrator/policy/evaluator";
import { resolveProjectPolicy } from "@/orchestrator/policy/policy-schema";
import { PROTECTED_PATHS, zeroChangeRunnerState } from "@/lib/task-contract";

const CLEVIA_GOAL =
  "CLEVIA-001 — Initialize the Clevia frontend foundation and responsive dashboard shell using mock data only.";

const CLEVIA_PRD = documentToPlanningEntry({
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000099",
  projectId: "00000000-0000-4000-8000-000000000010",
  filename: "PRD.md",
  originalPath: null,
  documentType: "PRD",
  content: "Clevia uses Next.js and TypeScript for the frontend. Dashboard uses mock data only.",
  parseStatus: "ready",
  summary: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("contract governance", () => {
  test("ordinary task keeps strict protected-path criterion", () => {
    const derived = deriveTaskContractFields({
      goal: "Update README subtitle to mention governed autonomous software delivery.",
      acceptanceCriteria: ["Only README.md is modified."],
    });
    const plan = deriveContractGovernance({
      goal: "Update README subtitle to mention governed autonomous software delivery.",
      specifications: [],
      repositoryManifestPaths: ["README.md", "package.json", "src/app.tsx"],
      derived,
      userCriteria: derived.acceptanceCriteria,
    });

    expect(plan.isGreenfieldBootstrap).toBe(false);
    expect(plan.acceptanceCriteria).toContain(GOVERNANCE_CRITERION_STRICT);
    expect(plan.acceptanceCriteria).not.toContain(GOVERNANCE_CRITERION_APPROVAL_REQUIRED);
    expect(plan.outOfScope.some((item) => /dependency and lockfile/i.test(item))).toBe(true);
  });

  test("greenfield bootstrap marks dependency paths approval-required", () => {
    const derived = deriveTaskContractFields({ goal: CLEVIA_GOAL });
    const plan = deriveContractGovernance({
      goal: CLEVIA_GOAL,
      specifications: [CLEVIA_PRD],
      repositoryManifestPaths: ["README.md"],
      derived,
    });

    expect(plan.isGreenfieldBootstrap).toBe(true);
    expect(plan.approvalRequiredPaths).toEqual([...DEPENDENCY_CONFIGURATION_PROTECTED_PATHS]);
    expect(plan.acceptanceCriteria).toContain(GOVERNANCE_CRITERION_APPROVAL_REQUIRED);
    expect(plan.acceptanceCriteria).not.toContain(GOVERNANCE_CRITERION_STRICT);
    expect(plan.outOfScope).toEqual(deriveGreenfieldOutOfScope());
    expect(plan.outOfScope.some((item) => item === "Unrelated dependency or configuration changes")).toBe(
      true,
    );
    expect(plan.outOfScope.some((item) => /dependency and lockfile/i.test(item))).toBe(false);
    expect(validateContractConsistency(plan).ok).toBe(true);
  });

  test("clevia regression contract output is internally consistent", async () => {
    const planned = await planAndEvaluateTask({
      goal: CLEVIA_GOAL,
      taskId: "00000000-0000-4000-8000-000000000030",
      workspaceRoot: process.cwd(),
      repositoryRoot: null,
      specifications: [CLEVIA_PRD],
      sourceCommitSha: "a10183eb66a20fa0df619233b3e85231d2c193d9",
    });

    expect(planned.contract.inScope).toContain("Next.js + TypeScript frontend baseline");
    expect(planned.contract.inScope).toContain("Responsive application shell");
    expect(planned.contract.inScope).toContain("Dashboard using mock data only");
    expect(planned.contract.outOfScope).toContain("Authentication");
    expect(planned.contract.outOfScope).toContain("Unrelated dependency or configuration changes");
    expect(planned.contract.acceptanceCriteria.join("\n")).toContain("explicit human approval");
    expect(planned.contract.acceptanceCriteria.join("\n")).not.toContain("No protected paths are modified.");
    expect(planned.contract.approvalRequiredPaths).toEqual(["package.json", "bun.lock"]);
    expect(planned.contract.executionAllowedPaths?.length).toBeGreaterThan(0);
    expect(planned.contract.protectedPaths).toEqual([...PROTECTED_PATHS]);
  });

  test("contradictory contract is rejected by validation", () => {
    const plan = deriveContractGovernance({
      goal: CLEVIA_GOAL,
      specifications: [CLEVIA_PRD],
      repositoryManifestPaths: ["README.md"],
      derived: deriveTaskContractFields({ goal: CLEVIA_GOAL }),
    });
    const inconsistent = {
      ...plan,
      acceptanceCriteria: [...plan.acceptanceCriteria, GOVERNANCE_CRITERION_STRICT],
    };
    expect(validateContractConsistency(inconsistent).ok).toBe(false);
  });

  test("greenfield without stack evidence requires clarification", () => {
    const plan = deriveContractGovernance({
      goal: "Initialize the frontend foundation and dashboard shell.",
      specifications: [],
      repositoryManifestPaths: ["README.md"],
      derived: deriveTaskContractFields({ goal: "Initialize the frontend foundation and dashboard shell." }),
    });
    expect(plan.needsClarification).toBe(true);
    expect(detectGreenfieldBootstrap({
      goal: "Initialize the frontend foundation and dashboard shell.",
      specifications: [],
      repositoryManifestPaths: ["README.md"],
      derived: deriveTaskContractFields({ goal: "Initialize the frontend foundation and dashboard shell." }),
    })).toBe(false);
  });
});

describe("protected path runtime policy", () => {
  const policy = resolveProjectPolicy(null, null);

  test("unrelated protected path remains forbidden", () => {
    const result = evaluateProtectedPathPolicy({
      changedFiles: [".env"],
      protectedPaths: policy.protected_paths,
      approvalRequiredPaths: ["package.json", "bun.lock"],
      approvedProtectedPaths: ["package.json"],
    });
    expect(result.decision).toBe("FORBIDDEN");
  });

  test("approval-required path needs explicit approval before write", () => {
    const result = evaluateProtectedPathPolicy({
      changedFiles: ["package.json"],
      protectedPaths: policy.protected_paths,
      approvalRequiredPaths: ["package.json", "bun.lock"],
      approvedProtectedPaths: [],
    });
    expect(result.decision).toBe("REQUIRES_PROTECTED_PATH_APPROVAL");
  });

  test("bounded protected-path approval allows only approved path", () => {
    const approved = evaluateProtectedPathPolicy({
      changedFiles: ["package.json"],
      protectedPaths: policy.protected_paths,
      approvalRequiredPaths: ["package.json", "bun.lock"],
      approvedProtectedPaths: ["package.json"],
    });
    expect(approved.decision).toBe("ALLOW");

    const lockStillBlocked = evaluateProtectedPathPolicy({
      changedFiles: ["bun.lock"],
      protectedPaths: policy.protected_paths,
      approvalRequiredPaths: ["package.json", "bun.lock"],
      approvedProtectedPaths: ["package.json"],
    });
    expect(lockStillBlocked.decision).toBe("REQUIRES_PROTECTED_PATH_APPROVAL");
  });

  test("patch apply requires approval for package.json until recorded", () => {
    expect(
      resolvePatchProtectedPathDecision({
        filePath: "package.json",
        allowedPaths: ["src/**"],
        protectedAreas: [...PROTECTED_PATHS],
        approvalRequiredPaths: ["package.json", "bun.lock"],
        approvedProtectedPaths: [],
      }),
    ).toBe("requires_approval");

    expect(
      resolvePatchProtectedPathDecision({
        filePath: "package.json",
        allowedPaths: ["src/**"],
        protectedAreas: [...PROTECTED_PATHS],
        approvalRequiredPaths: ["package.json", "bun.lock"],
        approvedProtectedPaths: ["package.json"],
      }),
    ).toBe("apply");
  });

  test("contract approval path does not imply protected-path write approval in policy", () => {
    const evaluation = evaluatePolicy({
      goal: CLEVIA_GOAL,
      changedFiles: ["package.json"],
      policy,
      approvalRequiredPaths: ["package.json", "bun.lock"],
      approvedProtectedPaths: [],
    });
    expect(evaluation.decision).toBe("HUMAN_APPROVAL_REQUIRED");
    expect(evaluation.matchedRules).toContain("PROTECTED_PATH_APPROVAL_REQUIRED");
  });

  test("recordProtectedPathApproval stores bounded approval separately from contract lock", () => {
    const runner = recordProtectedPathApproval({
      runnerState: zeroChangeRunnerState("Contract locked."),
      paths: ["package.json"],
      actorUserId: "user-1",
      note: "Approve initial dependency manifest only.",
    });
    expect(extractApprovedProtectedPaths(runner.protectedPathApprovals)).toEqual(["package.json"]);
    expect(runner.commitApproved).toBeUndefined();
  });
});
