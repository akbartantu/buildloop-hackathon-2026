export const REPOSITORY_NOT_ACCESSIBLE_MESSAGE =
  "Repository was not found or is not publicly accessible. BuildLoop currently supports public GitHub repositories only.";

export const GIT_UNAVAILABLE_MESSAGE =
  "Git is unavailable in this runtime. Repository connection requires a working git executable.";

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
  | "clone_failed"
  | "inspection_failed"
  | "persistence_failed"
  | "unexpected";

export function repositoryConnectionMessage(category: RepositoryConnectionFailureCategory): string {
  switch (category) {
    case "not_accessible":
      return REPOSITORY_NOT_ACCESSIBLE_MESSAGE;
    case "git_unavailable":
      return GIT_UNAVAILABLE_MESSAGE;
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

export function isGitUnavailableError(error: unknown): boolean {
  const text = combinedErrorText(error).toLowerCase();
  return (
    text.includes("enoent") ||
    text.includes("not recognized") ||
    text.includes("not found") && text.includes("git")
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
  const detail = combinedErrorText(error);
  console.error(`connectPublicRepository ${stage} failed`, detail);
}
