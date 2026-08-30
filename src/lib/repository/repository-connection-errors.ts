export const REPOSITORY_NOT_ACCESSIBLE_MESSAGE =
  "Repository was not found or is not publicly accessible. BuildLoop currently supports public GitHub repositories only.";

export const GIT_UNAVAILABLE_MESSAGE =
  "Git is unavailable in this runtime. Repository connection requires a working git executable.";

export const REPOSITORY_NETWORK_FAILURE_MESSAGE =
  "Could not reach GitHub to verify the repository. Check network connectivity from this environment and try again.";

export const REPOSITORY_CLONE_FAILED_MESSAGE =
  "Repository clone failed. Verify the URL is correct and the repository is publicly accessible.";

export const REPOSITORY_INSPECTION_FAILED_MESSAGE =
  "Repository inspection failed. The repository may be empty or missing a default branch.";

export const PROJECT_PERSISTENCE_FAILED_MESSAGE =
  "Project persistence failed. The repository was cloned but could not be saved.";

export const UNEXPECTED_REPOSITORY_ERROR_MESSAGE =
  "An unexpected server error occurred while connecting the repository.";

export type RepositoryConnectionFailureCategory =
  | "not_accessible"
  | "git_unavailable"
  | "network_failure"
  | "clone_failed"
  | "inspection_failed"
  | "persistence_failed"
  | "unexpected";

export type RepositoryProbeDiagnostics = {
  stage: "repository accessibility";
  repositoryHost: string;
  gitExitCode?: number | string;
  sanitizedStderr?: string;
  sanitizedMessage?: string;
};

export class RepositoryProbeError extends Error {
  readonly category: RepositoryConnectionFailureCategory;
  readonly diagnostics: RepositoryProbeDiagnostics;

  constructor(
    category: RepositoryConnectionFailureCategory,
    diagnostics: RepositoryProbeDiagnostics,
    cause?: unknown,
  ) {
    super(diagnostics.sanitizedMessage ?? repositoryConnectionMessage(category));
    this.name = "RepositoryProbeError";
    this.category = category;
    this.diagnostics = diagnostics;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function repositoryConnectionMessage(category: RepositoryConnectionFailureCategory): string {
  switch (category) {
    case "not_accessible":
      return REPOSITORY_NOT_ACCESSIBLE_MESSAGE;
    case "git_unavailable":
      return GIT_UNAVAILABLE_MESSAGE;
    case "network_failure":
      return REPOSITORY_NETWORK_FAILURE_MESSAGE;
    case "clone_failed":
      return REPOSITORY_CLONE_FAILED_MESSAGE;
    case "inspection_failed":
      return REPOSITORY_INSPECTION_FAILED_MESSAGE;
    case "persistence_failed":
      return PROJECT_PERSISTENCE_FAILED_MESSAGE;
    case "unexpected":
      return UNEXPECTED_REPOSITORY_ERROR_MESSAGE;
  }
}

export type ExecFileFailureDetails = {
  message: string;
  code?: number | string;
  stderr?: string;
  stdout?: string;
};

function combinedErrorText(error: unknown): string {
  if (error instanceof Error) {
    const parts = [error.message];
    if ("stderr" in error && typeof error.stderr === "string") {
      parts.push(error.stderr);
    }
    if ("stdout" in error && typeof error.stdout === "string") {
      parts.push(error.stdout);
    }
    return parts.join("\n");
  }
  return String(error);
}

export function extractExecFileFailureDetails(error: unknown): ExecFileFailureDetails | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const details: ExecFileFailureDetails = { message: error.message };
  if ("code" in error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (typeof code === "number" || typeof code === "string") {
      details.code = code;
    }
  }
  if ("stderr" in error && typeof error.stderr === "string") {
    details.stderr = error.stderr;
  }
  if ("stdout" in error && typeof error.stdout === "string") {
    details.stdout = error.stdout;
  }
  return details;
}

export function sanitizeGitDiagnosticText(text: string): string {
  return text
    .replace(/https:\/\/[^@\s/]+:[^@\s/]+@/gi, "https://***:***@")
    .replace(/https:\/\/[^:@\s/]+@/gi, "https://***@")
    .replace(/([?&])(token|access_token|key|password|secret)=[^&\s]+/gi, "$1$2=***")
    .trim();
}

export function extractRepositoryHost(normalizedUrl: string): string {
  try {
    return new URL(normalizedUrl).host;
  } catch {
    return "unknown";
  }
}

function probeFailureText(error: unknown): string {
  const details = extractExecFileFailureDetails(error);
  if (!details) {
    return combinedErrorText(error).toLowerCase();
  }
  return [details.message, details.stderr, details.stdout].filter(Boolean).join("\n").toLowerCase();
}

export function classifyRepositoryProbeFailure(error: unknown): RepositoryConnectionFailureCategory {
  if (isGitUnavailableError(error)) {
    return "git_unavailable";
  }

  const text = probeFailureText(error);
  if (isRepositoryNetworkFailureError(text, error)) {
    return "network_failure";
  }
  if (isRepositoryProbeNotAccessibleError(text)) {
    return "not_accessible";
  }
  return "unexpected";
}

function isRepositoryProbeNotAccessibleError(text: string): boolean {
  return (
    text.includes("repository not found") ||
    text.includes("could not read from remote repository") ||
    text.includes("authentication failed") ||
    text.includes("permission denied") ||
    text.includes("access denied") ||
    text.includes("invalid username or password") ||
    text.includes("terminal prompts disabled") ||
    text.includes("the requested url returned error: 403") ||
    text.includes("the requested url returned error: 404")
  );
}

function isRepositoryNetworkFailureError(text: string, error: unknown): boolean {
  const details = extractExecFileFailureDetails(error);
  const code = details?.code;
  if (
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENETUNREACH" ||
    code === "EAI_AGAIN"
  ) {
    return true;
  }

  if (error instanceof Error && "killed" in error && (error as { killed?: boolean }).killed === true) {
    return true;
  }

  return (
    text.includes("could not resolve host") ||
    text.includes("getaddrinfo") ||
    text.includes("name or service not known") ||
    text.includes("network is unreachable") ||
    text.includes("connection timed out") ||
    text.includes("connection refused") ||
    text.includes("unable to access") ||
    text.includes("ssl peer certificate") ||
    text.includes("certificate verify failed") ||
    text.includes("tls") ||
    text.includes("remote error") ||
    text.includes("the requested url returned error: 5") ||
    text.includes("command timed out")
  );
}

export function createRepositoryProbeError(
  normalizedUrl: string,
  cause: unknown,
): RepositoryProbeError {
  const details = extractExecFileFailureDetails(cause);
  const category = classifyRepositoryProbeFailure(cause);
  const sanitizedStderr = details?.stderr ? sanitizeGitDiagnosticText(details.stderr) : undefined;
  const sanitizedMessage = sanitizeGitDiagnosticText(details?.message ?? combinedErrorText(cause));

  const diagnostics: RepositoryProbeDiagnostics = {
    stage: "repository accessibility",
    repositoryHost: extractRepositoryHost(normalizedUrl),
    sanitizedMessage,
  };
  if (details?.code !== undefined) {
    diagnostics.gitExitCode = details.code;
  }
  if (sanitizedStderr !== undefined) {
    diagnostics.sanitizedStderr = sanitizedStderr;
  }

  return new RepositoryProbeError(category, diagnostics, cause);
}

export function isGitUnavailableError(error: unknown): boolean {
  const details = extractExecFileFailureDetails(error);
  if (details?.code === "ENOENT") {
    return true;
  }

  const text = combinedErrorText(error).toLowerCase();
  return (
    text.includes("enoent") ||
    text.includes("not recognized") ||
    text.includes("spawn git")
  );
}

export function isRepositoryNotAccessibleError(error: unknown): boolean {
  const text = combinedErrorText(error).toLowerCase();
  return (
    text.includes("repository not found") ||
    text.includes("not found") ||
    text.includes("could not read from remote repository") ||
    text.includes("authentication failed") ||
    text.includes("permission denied") ||
    text.includes("access denied") ||
    text.includes("invalid username or password") ||
    text.includes("terminal prompts disabled")
  );
}

export function isRepositoryCloneError(error: unknown): boolean {
  const text = combinedErrorText(error).toLowerCase();
  return text.includes("clone") || text.includes("remote error");
}

export function isProjectPersistenceError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes("Project gagal") ||
    error.message.includes("Daftar project gagal")
  );
}

export function classifyRepositoryConnectionError(error: unknown): RepositoryConnectionFailureCategory {
  if (isGitUnavailableError(error)) {
    return "git_unavailable";
  }
  if (isProjectPersistenceError(error)) {
    return "persistence_failed";
  }
  if (isRepositoryNotAccessibleError(error)) {
    return "not_accessible";
  }
  if (isRepositoryCloneError(error)) {
    return "clone_failed";
  }
  return "unexpected";
}

export function logRepositoryConnectionError(stage: string, error: unknown): void {
  if (error instanceof RepositoryProbeError) {
    console.error(
      `connectPublicRepository ${stage} failed`,
      JSON.stringify({
        stage: error.diagnostics.stage,
        category: error.category,
        repositoryHost: error.diagnostics.repositoryHost,
        gitExitCode: error.diagnostics.gitExitCode,
        sanitizedStderr: error.diagnostics.sanitizedStderr,
        sanitizedMessage: error.diagnostics.sanitizedMessage,
      }),
    );
    return;
  }

  const detail = combinedErrorText(error);
  console.error(`connectPublicRepository ${stage} failed`, detail);
}
