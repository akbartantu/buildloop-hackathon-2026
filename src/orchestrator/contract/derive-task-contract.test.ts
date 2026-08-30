import { describe, expect, test } from "bun:test";

import { deriveTaskContractFields, deriveRequiredChecks } from "./derive-task-contract";
import { planWork, workPlanToContractFields } from "@/orchestrator/agents/planner/planner";
import { createDraftContract, lockContract } from "@/orchestrator/contract/schema";
import { PROTECTED_PATHS } from "@/lib/task-contract";
import type { TaskContract } from "@/lib/task-contract";

const README_GOAL =
  "Update README subtitle to mention governed autonomous software delivery.";

const README_CRITERIA = [
  "Only README.md is modified.",
  "Add one concise sentence describing BuildLoop as a governed autonomous software-delivery agent.",
  "Do not modify dependencies, configuration, credentials, deployment files, or application code.",
  "Existing README structure remains intact.",
];

describe("deriveTaskContractFields", () => {
  test("documentation-only README task scopes to README.md", () => {
    const derived = deriveTaskContractFields({ goal: README_GOAL, acceptanceCriteria: README_CRITERIA });

    expect(derived.expectedScope).toEqual(["README.md"]);
    expect(derived.expectedScope).not.toContain("src/**");
    expect(derived.expectedScope).not.toContain("docs/**");
    expect(derived.acceptanceCriteria).toEqual([
      ...README_CRITERIA,
      "No protected paths are modified.",
    ]);
    expect(derived.requiredChecks).toEqual([
      "file-scope check",
      "protected-path check",
      "acceptance-criteria verification",
    ]);
    expect(derived.needsClarification).toBe(false);
  });

  test("explicit source file task scopes narrowly", () => {
    const derived = deriveTaskContractFields({
      goal: "Update src/components/site/home-page.tsx helper copy without touching protected files.",
    });

    expect(derived.expectedScope).toEqual(["src/components/site/home-page.tsx"]);
    expect(derived.expectedScope).not.toContain("src/**");
  });

  test("ambiguous task requires clarification instead of broad scope", () => {
    const derived = deriveTaskContractFields({
      goal: "Improve the product experience across the repository.",
    });

    expect(derived.needsClarification).toBe(true);
    expect(derived.expectedScope).toEqual([]);
    expect(derived.expectedScope).not.toContain("src/**");
    expect(derived.acceptanceCriteria[0]).toMatch(/Clarify the exact files/i);
  });

  test("protected path target requires clarification", () => {
    const derived = deriveTaskContractFields({
      goal: "Update package.json description copy.",
    });

    expect(derived.needsClarification).toBe(true);
  });

  test("semantic implementation task without explicit paths requires clarification", () => {
    const derived = deriveTaskContractFields({
      goal: "Add a reusable date formatting utility for the tasks list.",
    });

    expect(derived.needsClarification).toBe(true);
    expect(derived.expectedScope).toEqual([]);
    expect(derived.expectedScope).not.toContain("src/**");
  });
});

describe("planWork contract derivation integration", () => {
  test("README planner output preserves user acceptance criteria and narrow scope", async () => {
    const plan = await planWork({
      goal: README_GOAL,
      taskId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      acceptanceCriteria: README_CRITERIA,
    });
    const fields = workPlanToContractFields(plan);

    expect(fields.inScope).toEqual(["README.md"]);
    expect(fields.acceptanceCriteria).toEqual([
      ...README_CRITERIA,
      "No protected paths are modified.",
    ]);
    expect(fields.requiredChecks).toEqual([
      "file-scope check",
      "protected-path check",
      "acceptance-criteria verification",
    ]);
  });
});

describe("contract locking preserves derived scope", () => {
  test("locked orchestrator contract keeps README scope and criteria", async () => {
    const plan = await planWork({
      goal: README_GOAL,
      taskId: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
      acceptanceCriteria: README_CRITERIA,
    });
    const fields = workPlanToContractFields(plan);
    const storedContract: TaskContract = {
      goal: README_GOAL,
      inScope: fields.inScope,
      outOfScope: ["Deployment and infrastructure"],
      acceptanceCriteria: fields.acceptanceCriteria,
      allowedActions: [],
      protectedPaths: [],
      requiredChecks: fields.requiredChecks,
      maxAttempts: 2,
    };

    const locked = lockContract(
      createDraftContract({
        id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
        taskId: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
        version: 1,
        goal: storedContract.goal,
        objective: storedContract.goal,
        inScope: storedContract.inScope,
        outOfScope: storedContract.outOfScope,
        acceptanceCriteria: storedContract.acceptanceCriteria,
        allowedPaths: storedContract.inScope,
        maximumCorrections: 2,
      }),
    );

    expect(locked.allowedPaths).toEqual(["README.md"]);
    expect(locked.acceptanceCriteria).toEqual(fields.acceptanceCriteria);
    expect(locked.inScope).toEqual(["README.md"]);
  });
});

describe("deriveRequiredChecks", () => {
  test("documentation scope uses lightweight checks", () => {
    expect(deriveRequiredChecks(["README.md"])).toEqual([
      "file-scope check",
      "protected-path check",
      "acceptance-criteria verification",
    ]);
  });

  test("code scope retains typecheck and tests", () => {
    expect(deriveRequiredChecks(["src/lib/example.ts"])).toEqual([
      "typecheck",
      "relevant test",
      "protected-path check",
    ]);
  });
});
