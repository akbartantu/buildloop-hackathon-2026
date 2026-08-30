import { afterEach, describe, expect, mock, test } from "bun:test";

import { probePublicRepositoryRefsViaGitHubApi } from "@/orchestrator/workspace/github-api-probe";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("probePublicRepositoryRefsViaGitHubApi", () => {
  test("returns ls-remote-shaped refs for a public repository", async () => {
    globalThis.fetch = mock(async () =>
      Response.json([
        { ref: "refs/heads/main", object: { sha: "abc1234567890123456789012345678901234567890" } },
      ]),
    ) as typeof fetch;

    await expect(
      probePublicRepositoryRefsViaGitHubApi("https://github.com/example/repo.git"),
    ).resolves.toEqual([
      "abc1234567890123456789012345678901234567890\trefs/heads/main",
    ]);
  });

  test("throws for missing repositories", async () => {
    globalThis.fetch = mock(async () => new Response("Not Found", { status: 404 })) as typeof fetch;

    await expect(
      probePublicRepositoryRefsViaGitHubApi("https://github.com/example/missing.git"),
    ).rejects.toMatchObject({
      stderr: "GitHub API: repository not found",
    });
  });
});
