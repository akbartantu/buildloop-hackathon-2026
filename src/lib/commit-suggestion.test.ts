import { describe, expect, test } from "bun:test";

import { buildSuggestedCommitMetadata } from "@/lib/commit-suggestion";

describe("commit suggestion", () => {
  test("suggested commit message is generated from verified task result", () => {
    const result = buildSuggestedCommitMetadata({
      contractGoal: "Add run timing visibility to orchestration evidence",
      changedFiles: ["src/lib/task-run-progress.ts"],
      checkerVerdict: "PASS",
      deliveryBlocked: false,
    });

    expect(result.message).toBe("feat: add run timing visibility to orchestration evidence");
  });

  test("suggested description reflects verified implementation", () => {
    const result = buildSuggestedCommitMetadata({
      contractGoal: "Clarify human control over sensitive actions",
      changedFiles: ["README.md", "docs/guide.md"],
      checkerVerdict: "PASS",
      deliveryBlocked: false,
    });

    expect(result.description).toContain("Clarify human control over sensitive actions");
    expect(result.description).toContain("README.md");
    expect(result.description).toContain("Checker verdict: PASS");
    expect(result.description).toContain("BuildLoop did not execute commit");
  });

  test("suggestions contain no sandbox paths", () => {
    const result = buildSuggestedCommitMetadata({
      contractGoal: "Fix preserve active run status across navigation",
      changedFiles: ["/tmp/sandbox/worktree/src/app.tsx"],
      checkerVerdict: "PASS",
      deliveryBlocked: false,
    });

    expect(result.message).not.toContain("/tmp/");
    expect(result.description).not.toContain("/tmp/sandbox");
  });

  test("suggestions do not contain raw secrets", () => {
    const result = buildSuggestedCommitMetadata({
      contractGoal: "Update README with api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
      changedFiles: ["README.md"],
      checkerVerdict: "PASS",
      deliveryBlocked: false,
    });

    expect(result.message).not.toContain("sk-");
    expect(result.description).not.toContain("sk-");
  });

  test("suggestions are deterministic enough for the same persisted verified result", () => {
    const input = {
      contractGoal: "Preserve active run status across navigation",
      changedFiles: ["src/hooks/use-workspace-tasks.ts"],
      checkerVerdict: "PASS" as const,
      deliveryBlocked: false,
    };
    const first = buildSuggestedCommitMetadata(input);
    const second = buildSuggestedCommitMetadata(input);
    expect(first).toEqual(second);
  });

  test("docs type is inferred for documentation-only changes", () => {
    const result = buildSuggestedCommitMetadata({
      contractGoal: "Clarify approval copy in README",
      changedFiles: ["README.md"],
      checkerVerdict: "PASS",
      deliveryBlocked: false,
    });

    expect(result.message.startsWith("docs:")).toBe(true);
  });

  test("blocked delivery mentions manual review in description", () => {
    const result = buildSuggestedCommitMetadata({
      contractGoal: "Update README",
      changedFiles: ["README.md"],
      checkerVerdict: "PASS",
      deliveryBlocked: true,
    });

    expect(result.description).toContain("Manual patch download was blocked");
  });
});
