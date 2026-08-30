export type RepositorySourceType = "public_github" | "local_demo";

export type ConnectedRepositorySource = {
  url: string;
  repoName: string;
  branch: string;
  commitSha: string;
  sourceType: RepositorySourceType;
  projectId?: string;
};

export const CONNECTED_REPOSITORY_STORAGE_KEY = "buildloop-connected-repository";

export function serializeConnectedRepository(source: ConnectedRepositorySource): string {
  return JSON.stringify(source);
}

export function parseConnectedRepository(raw: string | null): ConnectedRepositorySource | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ConnectedRepositorySource>;
    if (
      typeof parsed.url !== "string" ||
      typeof parsed.repoName !== "string" ||
      typeof parsed.branch !== "string" ||
      typeof parsed.commitSha !== "string" ||
      parsed.sourceType !== "public_github"
    ) {
      return null;
    }

    return {
      url: parsed.url,
      repoName: parsed.repoName,
      branch: parsed.branch,
      commitSha: parsed.commitSha,
      sourceType: "public_github",
      ...(typeof parsed.projectId === "string" ? { projectId: parsed.projectId } : {}),
    };
  } catch {
    return null;
  }
}
