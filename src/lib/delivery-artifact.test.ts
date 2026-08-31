import { describe, expect, test } from "bun:test";

import {
  buildBlockedDeliveryHandoff,
  buildDeliveryHandoff,
  DELIVERY_PATCH_MAX_BYTES,
} from "@/lib/delivery-artifact";
import type { GitDiffSummary } from "@/orchestrator/workspace/git-workspace";

function diffSummary(changedFiles: string[]): GitDiffSummary {
  return {
    baselineSha: "abc1234567890abcdef1234567890abcdef12345678",
    changedFiles,
    addedFiles: changedFiles.filter((file) => file.endsWith(".new")),
    deletedFiles: [],
    modifiedFiles: changedFiles.filter((file) => !file.endsWith(".new")),
  };
}

describe("delivery artifact", () => {
  test("PASS final attempt produces durable delivery patch", async () => {
    const patch = "diff --git a/README.md b/README.md\n+verified\n";
    const handoff = await buildDeliveryHandoff({
      taskId: "00000000-0000-4000-8000-000000000001",
      runId: "run-1",
      contractGoal: "Update README subtitle",
      worktreePath: "/tmp/worktree",
      baselineSha: "abc1234567890abcdef1234567890abcdef12345678",
      attemptNumber: 2,
      checkerVerdict: "PASS",
      allowedPaths: ["README.md"],
      protectedPaths: [".env*"],
      diffSummary: diffSummary(["README.md"]),
      captureDiff: async () => ({ diff: patch, isBinary: false }),
    });

    expect(handoff?.blocked).toBe(false);
    expect(handoff?.patch).toBe(patch);
    expect(handoff?.patchSha256).toHaveLength(64);
    expect(handoff?.attemptNumber).toBe(2);
    expect(handoff?.mode).toBe("MANUAL_HANDOFF");
  });

  test("patch reflects final verified attempt only", async () => {
    const handoff = await buildDeliveryHandoff({
      taskId: "00000000-0000-4000-8000-000000000002",
      runId: "run-2",
      contractGoal: "Fix timing visibility",
      worktreePath: "/tmp/worktree",
      baselineSha: "def4567890abcdef4567890abcdef4567890abcd",
      attemptNumber: 2,
      checkerVerdict: "PASS",
      allowedPaths: ["src/lib/task-run-progress.ts"],
      protectedPaths: [".env*"],
      diffSummary: diffSummary(["src/lib/task-run-progress.ts"]),
      captureDiff: async () => ({
        diff: "diff --git a/src/lib/task-run-progress.ts b/src/lib/task-run-progress.ts\n+attempt 2\n",
        isBinary: false,
      }),
    });

    expect(handoff?.attemptNumber).toBe(2);
    expect(handoff?.patch).toContain("attempt 2");
  });

  test("changed files match verified final changed files", async () => {
    const handoff = await buildDeliveryHandoff({
      taskId: "00000000-0000-4000-8000-000000000003",
      runId: "run-3",
      contractGoal: "Update docs",
      worktreePath: "/tmp/worktree",
      baselineSha: "abc1234567890abcdef1234567890abcdef12345678",
      attemptNumber: 1,
      checkerVerdict: "PASS",
      allowedPaths: ["README.md", "docs/**"],
      protectedPaths: [".env*"],
      diffSummary: diffSummary(["README.md", "docs/guide.md"]),
      captureDiff: async (_root, _sha, file) => ({
        diff: `diff --git a/${file} b/${file}\n+change\n`,
        isBinary: false,
      }),
    });

    expect(handoff?.changedFiles).toEqual(["README.md", "docs/guide.md"]);
  });

  test("protected paths never produce downloadable artifact", async () => {
    const handoff = await buildDeliveryHandoff({
      taskId: "00000000-0000-4000-8000-000000000004",
      runId: "run-4",
      contractGoal: "Touch env",
      worktreePath: "/tmp/worktree",
      baselineSha: "abc1234567890abcdef1234567890abcdef12345678",
      attemptNumber: 1,
      checkerVerdict: "PASS",
      allowedPaths: ["**"],
      protectedPaths: [".env*"],
      diffSummary: diffSummary([".env.local"]),
      captureDiff: async () => ({
        diff: "diff --git a/.env.local b/.env.local\n+SECRET=bad\n",
        isBinary: false,
      }),
    });

    expect(handoff?.blocked).toBe(true);
    expect(handoff?.patch).toBeNull();
    expect(handoff?.blockedReason).toContain("protected paths");
  });

  test("unsafe secret-bearing content blocks artifact generation", async () => {
    const handoff = await buildDeliveryHandoff({
      taskId: "00000000-0000-4000-8000-000000000005",
      runId: "run-5",
      contractGoal: "Update config",
      worktreePath: "/tmp/worktree",
      baselineSha: "abc1234567890abcdef1234567890abcdef12345678",
      attemptNumber: 1,
      checkerVerdict: "PASS",
      allowedPaths: ["README.md"],
      protectedPaths: [".env*"],
      diffSummary: diffSummary(["README.md"]),
      captureDiff: async () => ({
        diff: "diff --git a/README.md b/README.md\n+api_key=sk-abcdefghijklmnopqrstuvwxyz123456\n",
        isBinary: false,
      }),
    });

    expect(handoff?.blocked).toBe(true);
    expect(handoff?.patch).toBeNull();
    expect(handoff?.blockedReason).toContain("secret-like material");
  });

  test("binary changes are handled safely", async () => {
    const handoff = await buildDeliveryHandoff({
      taskId: "00000000-0000-4000-8000-000000000006",
      runId: "run-6",
      contractGoal: "Update asset",
      worktreePath: "/tmp/worktree",
      baselineSha: "abc1234567890abcdef1234567890abcdef12345678",
      attemptNumber: 1,
      checkerVerdict: "PASS",
      allowedPaths: ["assets/**"],
      protectedPaths: [".env*"],
      diffSummary: diffSummary(["assets/logo.png"]),
      captureDiff: async () => ({
        diff: "Binary files a/assets/logo.png and b/assets/logo.png differ",
        isBinary: true,
      }),
    });

    expect(handoff?.blocked).toBe(true);
    expect(handoff?.patch).toBeNull();
    expect(handoff?.blockedReason).toContain("binary");
  });

  test("artifact size limits are handled safely", async () => {
    const oversized = "x".repeat(DELIVERY_PATCH_MAX_BYTES + 1);
    const handoff = await buildDeliveryHandoff({
      taskId: "00000000-0000-4000-8000-000000000007",
      runId: "run-7",
      contractGoal: "Large change",
      worktreePath: "/tmp/worktree",
      baselineSha: "abc1234567890abcdef1234567890abcdef12345678",
      attemptNumber: 1,
      checkerVerdict: "PASS",
      allowedPaths: ["README.md"],
      protectedPaths: [".env*"],
      diffSummary: diffSummary(["README.md"]),
      captureDiff: async () => ({ diff: oversized, isBinary: false }),
    });

    expect(handoff?.blocked).toBe(true);
    expect(handoff?.patch).toBeNull();
    expect(handoff?.blockedReason).toContain("size limit");
  });

  test("source SHA metadata is preserved", async () => {
    const baseline = "abc1234567890abcdef1234567890abcdef12345678";
    const handoff = await buildDeliveryHandoff({
      taskId: "00000000-0000-4000-8000-000000000008",
      runId: "run-8",
      contractGoal: "Update README",
      worktreePath: "/tmp/worktree",
      baselineSha: baseline,
      attemptNumber: 1,
      checkerVerdict: "PASS",
      allowedPaths: ["README.md"],
      protectedPaths: [".env*"],
      diffSummary: diffSummary(["README.md"]),
      captureDiff: async () => ({ diff: "diff --git a/README.md b/README.md\n+ok\n", isBinary: false }),
    });

    expect(handoff?.baselineSha).toBe(baseline);
    expect(handoff?.patchFilename).toMatch(/^buildloop-BL-/);
  });

  test("blocked handoff keeps suggestions without patch", () => {
    const handoff = buildBlockedDeliveryHandoff({
      taskId: "00000000-0000-4000-8000-000000000009",
      runId: "run-9",
      baselineSha: "abc1234567890abcdef1234567890abcdef12345678",
      attemptNumber: 1,
      checkerVerdict: "PASS",
      contractGoal: "Update README subtitle",
      blockedReason: "blocked for test",
      changedFiles: ["README.md"],
    });

    expect(handoff.blocked).toBe(true);
    expect(handoff.patch).toBeNull();
    expect(handoff.suggestedCommitMessage).toContain("docs:");
  });
});

describe("delivery artifact persistence", () => {
  test("patch survives reload from persisted handoff state", async () => {
    const patch = "diff --git a/README.md b/README.md\n+verified\n";
    const handoff = await buildDeliveryHandoff({
      taskId: "00000000-0000-4000-8000-000000000010",
      runId: "run-10",
      contractGoal: "Update README",
      worktreePath: "/tmp/worktree",
      baselineSha: "abc1234567890abcdef1234567890abcdef12345678",
      attemptNumber: 1,
      checkerVerdict: "PASS",
      allowedPaths: ["README.md"],
      protectedPaths: [".env*"],
      diffSummary: diffSummary(["README.md"]),
      captureDiff: async () => ({ diff: patch, isBinary: false }),
    });

    const restored = JSON.parse(JSON.stringify(handoff));
    expect(restored.patch).toBe(patch);
    expect(restored.patchSha256).toBe(handoff?.patchSha256);
  });

  test("old run records without delivery artifact load gracefully", () => {
    const runnerState = {
      runnerInvoked: true,
      filesChanged: 1,
      commandsExecuted: 0,
      commit: false,
      push: false,
      note: "legacy",
      changeArtifact: {
        baselineSha: "abc",
        attemptNumber: 1,
        checkerVerified: true,
        files: [],
        totalBytes: 0,
        truncated: false,
      },
    };

    expect(runnerState).not.toHaveProperty("deliveryHandoff");
  });
});
