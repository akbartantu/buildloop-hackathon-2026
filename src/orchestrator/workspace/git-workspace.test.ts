import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

import {
  assertPathWithinRoot,
  cleanupSandboxDirectory,
  ensurePublicGitHubClone,
  publicGitHubCloneCachePath,
  resolveWorkspacePath,
  runGit,
  verifyRepositoryHeadSha,
} from "@/orchestrator/workspace/git-workspace";
import { getSandboxRoot } from "@/orchestrator/workspace/sandbox-root";
import { validatePublicGitHubUrl } from "@/lib/repository/public-github-url";
import { resolveWorkerExecutionMode, selectWorker } from "@/orchestrator/worker/worker-selection";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";

const HELLO_WORLD = "https://github.com/octocat/Hello-World";
const HAS_NETWORK = process.env.BUILDLOOP_RUN_CLONE_TESTS === "1";

describe("public GitHub clone lifecycle", () => {
  test("maps GitHub URL to deterministic cache path under sandbox root", () => {
    const validated = validatePublicGitHubUrl(HELLO_WORLD);
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }

    const sandboxRoot = path.join("/tmp", "buildloop-test");
    const cachePath = publicGitHubCloneCachePath(validated.normalizedUrl, sandboxRoot);
    expect(resolveWorkspacePath(validated.normalizedUrl, "/app")).toBe(
      publicGitHubCloneCachePath(validated.normalizedUrl, getSandboxRoot("/app")),
    );
    expect(cachePath).toContain(path.join("repos"));
  });

  test("keeps local demo workspace mapping unchanged", () => {
    expect(resolveWorkspacePath("buildloop-demo", "/app")).toBe("/app");
  });

  test.skipIf(!HAS_NETWORK)("clones public repository and captures branch and SHA", async () => {
    const sandboxRoot = path.join(getSandboxRoot(), "test-clone", crypto.randomUUID());
    await mkdir(sandboxRoot, { recursive: true });

    try {
      const repoPath = await ensurePublicGitHubClone(HELLO_WORLD, "/app", { sandboxRoot });
      const branch = await runGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
      const headSha = await runGit(repoPath, ["rev-parse", "HEAD"]);

      expect(branch.length).toBeGreaterThan(0);
      expect(headSha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      await cleanupSandboxDirectory(sandboxRoot);
    }
  });

  test.skipIf(!HAS_NETWORK)("reclone checks out captured SHA", async () => {
    const sandboxRoot = path.join(getSandboxRoot(), "test-clone-sha", crypto.randomUUID());
    await mkdir(sandboxRoot, { recursive: true });

    try {
      const initialPath = await ensurePublicGitHubClone(HELLO_WORLD, "/app", { sandboxRoot });
      const capturedSha = await runGit(initialPath, ["rev-parse", "HEAD"]);
      const runId = crypto.randomUUID();
      const pinnedPath = await ensurePublicGitHubClone(HELLO_WORLD, "/app", {
        sandboxRoot,
        runId,
        commitSha: capturedSha,
      });

      expect(await verifyRepositoryHeadSha(pinnedPath, capturedSha)).toBe(true);
    } finally {
      await cleanupSandboxDirectory(sandboxRoot);
    }
  });

  test("detects HEAD mismatch against expected SHA", async () => {
    const sandboxRoot = path.join(getSandboxRoot(), "test-mismatch", crypto.randomUUID());
    const repoPath = path.join(sandboxRoot, "repo");
    await mkdir(repoPath, { recursive: true });
    await runGit(repoPath, ["init"]);
    await writeFile(path.join(repoPath, "README.md"), "hello\n", "utf8");
    await runGit(repoPath, ["add", "README.md"]);
    await runGit(repoPath, ["commit", "-m", "init"]);

    const headSha = await runGit(repoPath, ["rev-parse", "HEAD"]);
    expect(await verifyRepositoryHeadSha(repoPath, headSha)).toBe(true);
    expect(await verifyRepositoryHeadSha(repoPath, "0".repeat(40))).toBe(false);

    await cleanupSandboxDirectory(sandboxRoot);
  });

  test("repository sandbox cannot escape root", () => {
    const root = path.join("/tmp", "buildloop-sandbox");
    const inside = path.join(root, "runs", "abc", "repo");
    expect(() => assertPathWithinRoot(root, inside)).not.toThrow();
    expect(() => assertPathWithinRoot(root, "/etc/passwd")).toThrow(/escapes sandbox root/);
  });

  test("blocks remote git push in sandbox execution", async () => {
    const sandboxRoot = path.join(getSandboxRoot(), "test-push-block", crypto.randomUUID());
    const repoPath = path.join(sandboxRoot, "repo");
    await mkdir(repoPath, { recursive: true });
    await runGit(repoPath, ["init"]);

    await expect(runGit(repoPath, ["push", "origin", "main"])).rejects.toThrow(
      /Remote git mutations are not permitted/,
    );

    await cleanupSandboxDirectory(sandboxRoot);
  });

  test("cleans up sandbox directory", async () => {
    const target = path.join(getSandboxRoot(), "test-cleanup", crypto.randomUUID());
    await mkdir(path.join(target, "nested"), { recursive: true });
    await cleanupSandboxDirectory(target);
    await expect(Bun.file(path.join(target, "nested")).exists()).resolves.toBe(false);
  });
});

describe("real repository worker selection", () => {
  test("public GitHub workspace never selects demo worker even for demo goal text", () => {
    const mode = resolveWorkerExecutionMode(PASS_DEMO_GOAL, undefined, HELLO_WORLD);
    expect(mode).toBe("real");
    const selected = selectWorker({ mode, goal: PASS_DEMO_GOAL });
    expect(selected.workerId).toBe("adk-gemini-worker");
  });
});
