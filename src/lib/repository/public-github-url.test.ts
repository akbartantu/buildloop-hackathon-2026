import { describe, expect, test } from "bun:test";
import {
  isPublicGitHubRepoUrl,
  validatePublicGitHubUrl,
} from "@/lib/repository/public-github-url";

describe("validatePublicGitHubUrl", () => {
  test("accepts valid public GitHub HTTPS URL", () => {
    const result = validatePublicGitHubUrl("https://github.com/octocat/Hello-World");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedUrl).toBe("https://github.com/octocat/Hello-World");
      expect(result.repoName).toBe("octocat/Hello-World");
    }
  });

  test("rejects non-GitHub host", () => {
    const result = validatePublicGitHubUrl("https://gitlab.com/example/repo");
    expect(result).toEqual({
      ok: false,
      reason: "Only public GitHub repositories are supported.",
    });
  });

  test("rejects SSH URL", () => {
    const result = validatePublicGitHubUrl("git@github.com:octocat/Hello-World.git");
    expect(result).toEqual({
      ok: false,
      reason: "SSH repository URLs are not supported.",
    });
  });

  test("rejects credential-bearing URL", () => {
    const result = validatePublicGitHubUrl("https://token@github.com/octocat/Hello-World");
    expect(result).toEqual({
      ok: false,
      reason: "Credential-bearing repository URLs are not supported.",
    });
  });

  test("rejects local file URL", () => {
    const result = validatePublicGitHubUrl("file:///tmp/repo");
    expect(result).toEqual({
      ok: false,
      reason: "Local file URLs are not supported.",
    });
  });
});

describe("isPublicGitHubRepoUrl", () => {
  test("detects normalized GitHub repository URLs", () => {
    expect(isPublicGitHubRepoUrl("https://github.com/octocat/Hello-World")).toBe(true);
    expect(isPublicGitHubRepoUrl("buildloop-demo")).toBe(false);
  });
});
