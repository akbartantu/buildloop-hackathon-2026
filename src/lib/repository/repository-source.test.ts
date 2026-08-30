import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  publicGitHubCloneCachePath,
  resolveWorkspacePath,
} from "@/orchestrator/workspace/git-workspace";
import { getSandboxRoot } from "@/orchestrator/workspace/sandbox-root";
import { validatePublicGitHubUrl } from "@/lib/repository/public-github-url";

describe("public repository workspace resolution", () => {
  test("maps GitHub URL to deterministic cache path", () => {
    const validated = validatePublicGitHubUrl("https://github.com/octocat/Hello-World");
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }

    const sandboxRoot = getSandboxRoot("/app");
    const cachePath = publicGitHubCloneCachePath(validated.normalizedUrl, sandboxRoot);
    expect(resolveWorkspacePath(validated.normalizedUrl, "/app")).toBe(cachePath);
    expect(cachePath).toContain(path.join("repos"));
  });

  test("keeps local demo workspace mapping unchanged", () => {
    expect(resolveWorkspacePath("buildloop-demo", "/app")).toBe("/app");
  });
});

describe("repository source persistence", () => {
  test("task creation accepts connected repository workspace", async () => {
    const source = await Bun.file(new URL("../tasks-schema.ts", import.meta.url)).text();
    expect(source).toContain("workspace: z.string().trim().min(1).optional()");
  });

  test("git clone uses fixed args without user-provided flags", async () => {
    const source = await Bun.file(
      new URL("../../orchestrator/workspace/git-workspace.ts", import.meta.url),
    ).text();

    expect(source).toContain('["clone", "--depth", "1", validated.normalizedUrl, cloneDir]');
    expect(source).not.toContain("process.argv");
  });
});
