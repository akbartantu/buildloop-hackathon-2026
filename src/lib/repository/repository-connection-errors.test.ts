import { describe, expect, test } from "bun:test";

import {
  classifyRepositoryConnectionError,
  repositoryConnectionMessage,
  REPOSITORY_NOT_ACCESSIBLE_MESSAGE,
} from "@/lib/repository/repository-connection-errors";

describe("repositoryConnectionMessage", () => {
  test("returns actionable category messages", () => {
    expect(repositoryConnectionMessage("not_accessible")).toBe(REPOSITORY_NOT_ACCESSIBLE_MESSAGE);
    expect(repositoryConnectionMessage("git_unavailable")).toContain("Git is unavailable");
    expect(repositoryConnectionMessage("clone_failed")).toContain("clone failed");
    expect(repositoryConnectionMessage("inspection_failed")).toContain("inspection failed");
    expect(repositoryConnectionMessage("persistence_failed")).toContain("persistence failed");
  });
});

describe("classifyRepositoryConnectionError", () => {
  test("classifies git missing errors", () => {
    expect(
      classifyRepositoryConnectionError(new Error("'git' is not recognized as an internal or external command")),
    ).toBe("git_unavailable");
  });

  test("classifies repository not found errors", () => {
    expect(
      classifyRepositoryConnectionError(
        new Error("remote: Repository not found.\nfatal: repository not found"),
      ),
    ).toBe("not_accessible");
  });

  test("classifies Supabase persistence errors", () => {
    expect(classifyRepositoryConnectionError(new Error("Project gagal disimpan."))).toBe(
      "persistence_failed",
    );
  });

  test("classifies clone failures", () => {
    expect(classifyRepositoryConnectionError(new Error("git clone failed for repository"))).toBe(
      "clone_failed",
    );
  });
});
