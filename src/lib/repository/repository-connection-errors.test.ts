import { describe, expect, mock, test } from "bun:test";

import {
  classifyRepositoryConnectionError,
  classifyRepositoryProbeFailure,
  createRepositoryProbeError,
  logRepositoryConnectionError,
  RepositoryProbeError,
  repositoryConnectionMessage,
  REPOSITORY_NETWORK_FAILURE_MESSAGE,
  REPOSITORY_NOT_ACCESSIBLE_MESSAGE,
  sanitizeGitDiagnosticText,
} from "@/lib/repository/repository-connection-errors";

function execFileError(input: {
  message: string;
  code?: number | string;
  stderr?: string;
  stdout?: string;
}): Error {
  const error = new Error(input.message) as Error & {
    code?: number | string;
    stderr?: string;
    stdout?: string;
  };
  if (input.code !== undefined) {
    error.code = input.code;
  }
  if (input.stderr !== undefined) {
    error.stderr = input.stderr;
  }
  if (input.stdout !== undefined) {
    error.stdout = input.stdout;
  }
  return error;
}

describe("repositoryConnectionMessage", () => {
  test("returns actionable category messages", () => {
    expect(repositoryConnectionMessage("not_accessible")).toBe(REPOSITORY_NOT_ACCESSIBLE_MESSAGE);
    expect(repositoryConnectionMessage("git_unavailable")).toContain("Git is unavailable");
    expect(repositoryConnectionMessage("network_failure")).toBe(REPOSITORY_NETWORK_FAILURE_MESSAGE);
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

describe("sanitizeGitDiagnosticText", () => {
  test("redacts embedded credentials and secret query params", () => {
    expect(sanitizeGitDiagnosticText("https://user:secret@github.com/org/repo.git")).toBe(
      "https://***:***@github.com/org/repo.git",
    );
    expect(sanitizeGitDiagnosticText("fetch https://example.com?token=abc123")).toBe(
      "fetch https://example.com?token=***",
    );
  });
});

describe("classifyRepositoryProbeFailure", () => {
  test("classifies GitHub 404/private-style failures", () => {
    const error = execFileError({
      message:
        "Command failed: git ls-remote --heads https://github.com/example/missing.git\nremote: Repository not found.\nfatal: repository 'https://github.com/example/missing.git/' not found\n",
      code: 128,
      stderr:
        "remote: Repository not found.\nfatal: repository 'https://github.com/example/missing.git/' not found\n",
    });

    expect(classifyRepositoryProbeFailure(error)).toBe("not_accessible");
  });

  test("classifies DNS/network-style failures", () => {
    const error = execFileError({
      message:
        "Command failed: git ls-remote --heads https://missing.example/repo.git\nfatal: unable to access 'https://missing.example/repo.git/': Could not resolve host: missing.example\n",
      code: 128,
      stderr:
        "fatal: unable to access 'https://missing.example/repo.git/': Could not resolve host: missing.example\n",
    });

    expect(classifyRepositoryProbeFailure(error)).toBe("network_failure");
  });

  test("classifies TLS-style failures", () => {
    const error = execFileError({
      message:
        "Command failed: git ls-remote --heads https://expired.badssl.com/repo.git\nfatal: unable to access 'https://expired.badssl.com/repo.git/': SSL peer certificate or SSH remote key was not OK\n",
      code: 128,
      stderr:
        "fatal: unable to access 'https://expired.badssl.com/repo.git/': SSL peer certificate or SSH remote key was not OK\n",
    });

    expect(classifyRepositoryProbeFailure(error)).toBe("network_failure");
  });

  test("classifies git executable missing errors", () => {
    const error = execFileError({
      message: "spawn git ENOENT",
      code: "ENOENT",
    });

    expect(classifyRepositoryProbeFailure(error)).toBe("git_unavailable");
  });

  test("classifies execFile timeout failures", () => {
    const error = Object.assign(new Error("Command timed out"), { killed: true, signal: "SIGTERM" });

    expect(classifyRepositoryProbeFailure(error)).toBe("network_failure");
  });
});

describe("createRepositoryProbeError", () => {
  test("preserves sanitized operational metadata without exposing credentials", () => {
    const cause = execFileError({
      message:
        "Command failed: git ls-remote --heads https://user:secret@github.com/example/repo.git\nfatal: unable to access 'https://user:secret@github.com/example/repo.git/': Could not resolve host: github.com\n",
      code: 128,
      stderr:
        "fatal: unable to access 'https://user:secret@github.com/example/repo.git/': Could not resolve host: github.com\n",
    });

    const probeError = createRepositoryProbeError(
      "https://github.com/example/repo.git",
      cause,
    );

    expect(probeError).toBeInstanceOf(RepositoryProbeError);
    expect(probeError.category).toBe("network_failure");
    expect(probeError.diagnostics.repositoryHost).toBe("github.com");
    expect(probeError.diagnostics.gitExitCode).toBe(128);
    expect(probeError.diagnostics.sanitizedStderr).toContain("Could not resolve host");
    expect(probeError.diagnostics.sanitizedStderr).not.toContain("secret");
    expect(probeError.diagnostics.sanitizedMessage).not.toContain("secret");
  });

  test("uses safe user-facing message categories", () => {
    const cause = execFileError({
      message: "Command failed: git ls-remote --heads https://github.com/example/repo.git",
      code: 128,
      stderr: "remote: Repository not found.\n",
    });

    const probeError = createRepositoryProbeError("https://github.com/example/repo.git", cause);

    expect(repositoryConnectionMessage(probeError.category)).toBe(REPOSITORY_NOT_ACCESSIBLE_MESSAGE);
    expect(repositoryConnectionMessage(probeError.category)).not.toContain("remote:");
    expect(repositoryConnectionMessage(probeError.category)).not.toContain("fatal:");
  });
});

describe("logRepositoryConnectionError", () => {
  test("logs structured probe diagnostics server-side", () => {
    const consoleErrorMock = mock(() => {});
    const originalConsoleError = console.error;
    console.error = consoleErrorMock;

    try {
      const probeError = createRepositoryProbeError(
        "https://github.com/example/repo.git",
        execFileError({
          message: "Command failed: git ls-remote --heads https://github.com/example/repo.git",
          code: 128,
          stderr: "fatal: unable to access 'https://github.com/example/repo.git/': Connection timed out\n",
        }),
      );

      logRepositoryConnectionError("repository accessibility", probeError);

      expect(consoleErrorMock).toHaveBeenCalledTimes(1);
      const [prefix, payload] = consoleErrorMock.mock.calls[0] as [string, string];
      expect(prefix).toBe("connectPublicRepository repository accessibility failed");
      const parsed = JSON.parse(payload) as {
        stage: string;
        category: string;
        repositoryHost: string;
        gitExitCode: number;
        sanitizedStderr: string;
      };
      expect(parsed.stage).toBe("repository accessibility");
      expect(parsed.category).toBe("network_failure");
      expect(parsed.repositoryHost).toBe("github.com");
      expect(parsed.gitExitCode).toBe(128);
      expect(parsed.sanitizedStderr).toContain("Connection timed out");
    } finally {
      console.error = originalConsoleError;
    }
  });
});
