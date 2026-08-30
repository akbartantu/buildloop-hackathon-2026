import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

import { discoverCandidatePaths } from "./discover-candidate-paths";
import { deriveTaskContractFields } from "./derive-task-contract";
import { planWork } from "@/orchestrator/agents/planner/planner";

const workspaceRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

describe("discoverCandidatePaths", () => {
  test("forgot password goal discovers auth-related paths in this repository", async () => {
    const result = await discoverCandidatePaths("Fix forgot password flow", workspaceRoot);

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.length).toBeLessThanOrEqual(6);
    expect(result.candidates.some((candidate) => /auth|password|sign/i.test(candidate))).toBe(true);
    expect(result.candidates).not.toContain("src/**");
  });

  test("ambiguous repository-wide goal returns no contract scope", async () => {
    const derived = deriveTaskContractFields({
      goal: "Improve the product experience across the repository.",
    });

    expect(derived.needsClarification).toBe(true);
    expect(derived.expectedScope).toEqual([]);

    const plan = await planWork({
      goal: "Improve the product experience across the repository.",
      taskId: "22222222-2222-2222-2222-222222222222",
      workspaceRoot,
    });
    expect(plan.contracts[0]!.expectedScope).toEqual([]);
  });
});

describe("repository-aware contract derivation", () => {
  test("semantic auth task uses discovered candidates instead of src/**", async () => {
    const discovered = await discoverCandidatePaths("Fix forgot password flow", workspaceRoot);
    const derived = deriveTaskContractFields({
      goal: "Fix forgot password flow",
      repositoryCandidates: discovered.candidates,
    });

    expect(derived.expectedScope.length).toBeGreaterThan(0);
    expect(derived.expectedScope).not.toContain("src/**");
    expect(derived.needsClarification).toBe(false);
  });

  test("planWork with workspace root proposes bounded scope for semantic task", async () => {
    const plan = await planWork({
      goal: "Fix forgot password flow",
      taskId: "11111111-1111-1111-1111-111111111111",
      workspaceRoot,
    });

    const scope = plan.contracts[0]!.expectedScope;
    expect(scope.length).toBeGreaterThan(0);
    expect(scope).not.toContain("src/**");
  });
});
