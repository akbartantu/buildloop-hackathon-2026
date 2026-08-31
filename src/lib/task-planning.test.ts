import { describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeTaskGoal } from "@/lib/task-planning";
import { deriveTaskContractFields } from "@/orchestrator/contract/derive-task-contract";

const workspaceRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

describe("analyzeTaskGoal", () => {
  test("generates README acceptance criteria for explicit README goals", async () => {
    const goal =
      "Update README subtitle to mention governed autonomous software delivery.";
    const analysis = await analyzeTaskGoal({ goal, taskId: "preview", workspaceRoot });

    expect(analysis.suggestedFromGoal).toBe(true);
    expect(analysis.needsClarification).toBe(false);
    expect(analysis.acceptanceCriteria.some((c) => /README\.md/i.test(c))).toBe(true);
  });

  test("preserves user-supplied criteria", async () => {
    const userCriteria = ["Only README.md is modified.", "Keep existing structure."];
    const derived = deriveTaskContractFields({
      goal: "Update README subtitle to mention governed autonomous software delivery.",
      acceptanceCriteria: userCriteria,
    });

    expect(derived.acceptanceCriteria.slice(0, 2)).toEqual(userCriteria);
  });

  test("flags ambiguous goals for clarification when no user criteria", async () => {
    const analysis = await analyzeTaskGoal({
      goal: "Improve the product experience across the repository.",
      taskId: "preview",
      workspaceRoot,
    });

    expect(analysis.needsClarification).toBe(true);
    expect(analysis.clarificationMessage).toBeTruthy();
  });
});
