export type ProjectSourceType = "public_github";

export type ProjectRecord = {
  id: string;
  name: string;
  sourceType: ProjectSourceType;
  repositoryUrl: string;
  repositoryOwner: string;
  repositoryName: string;
  defaultBranch: string | null;
  connectedCommitSha: string | null;
  disconnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRepositoryStatus = "connected" | "not_connected" | "refreshing" | "connection_failed";

export function isProjectRepositoryConnected(project: ProjectRecord): boolean {
  return project.disconnectedAt === null;
}

export function projectRepositoryStatus(
  project: ProjectRecord | null,
  options?: { refreshing?: boolean; connectionFailed?: boolean },
): ProjectRepositoryStatus {
  if (options?.refreshing) {
    return "refreshing";
  }
  if (options?.connectionFailed) {
    return "connection_failed";
  }
  if (!project || project.disconnectedAt !== null) {
    return "not_connected";
  }
  return "connected";
}

export type ProjectRowShape = {
  id: string;
  name: string;
  source_type: string;
  repository_url: string;
  repository_owner: string;
  repository_name: string;
  default_branch: string | null;
  connected_commit_sha: string | null;
  disconnected_at?: string | null;
  created_at: string;
  updated_at: string;
};

export function toProjectRecord(row: ProjectRowShape): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    sourceType: "public_github",
    repositoryUrl: row.repository_url,
    repositoryOwner: row.repository_owner,
    repositoryName: row.repository_name,
    defaultBranch: row.default_branch,
    connectedCommitSha: row.connected_commit_sha,
    disconnectedAt: row.disconnected_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function projectDisplayName(
  project: Pick<ProjectRecord, "repositoryOwner" | "repositoryName">,
): string {
  return `${project.repositoryOwner}/${project.repositoryName}`;
}
