import { describe, expect, test } from "bun:test";

import { createRepositoryProbeError } from "@/lib/repository/repository-connection-errors";
import { parseLsRemoteHeads } from "@/orchestrator/workspace/git-workspace";

function execFileError(input: {
  message: string;
  code?: number | string;
  stderr?: string;
}): Error {
  const error = new Error(input.message) as Error & {
    code?: number | string;
    stderr?: string;
  };
  if (input.code !== undefined) {
    error.code = input.code;
  }
  if (input.stderr !== undefined) {
    error.stderr = input.stderr;
  }
  return error;
}

describe("parseLsRemoteHeads", () => {
  test("returns refs from successful ls-remote output", () => {
    expect(parseLsRemoteHeads("abc123\trefs/heads/main\n")).toEqual(["abc123\trefs/heads/main"]);
  });

  test("returns empty array when stdout is empty", () => {
    expect(parseLsRemoteHeads("")).toEqual([]);
    expect(parseLsRemoteHeads("   \n\n")).toEqual([]);
  });
});

describe("probePublicRepositoryRefs error model", () => {
  test("maps ls-remote failures to RepositoryProbeError with operational metadata", () => {
    const cause = execFileError({
      message:
        "Command failed: git ls-remote --heads https://github.com/example/private.git\nremote: Repository not found.\n",
      code: 128,
      stderr: "remote: Repository not found.\n",
    });

    const probeError = createRepositoryProbeError("https://github.com/example/private.git", cause);

    expect(probeError.category).toBe("not_accessible");
    expect(probeError.diagnostics).toEqual({
      stage: "repository accessibility",
      repositoryHost: "github.com",
      gitExitCode: 128,
      sanitizedStderr: "remote: Repository not found.",
      sanitizedMessage: expect.stringContaining("Command failed: git ls-remote"),
    });
  });
});
