import { isPublicGitHubRepoUrl } from "@/lib/repository/public-github-url";
import { WORKSPACE_NAME } from "@/lib/task-contract";
import type { ProjectRecord } from "@/lib/projects/project-record";
import { projectDisplayName } from "@/lib/projects/project-record";
import type { TaskRecord } from "@/lib/tasks-schema";

export function taskWorkspaceLabel(task: TaskRecord, project?: ProjectRecord | null): string {
  if (project) {
    return projectDisplayName(project);
  }
  if (isPublicGitHubRepoUrl(task.workspace)) {
    const match = task.workspace.match(/github\.com\/([^/]+\/[^/]+)/);
    return match?.[1] ?? task.workspace;
  }
  return WORKSPACE_NAME;
}

export function taskSourceCommitSha(task: TaskRecord, project?: ProjectRecord | null): string | null {
  return task.sourceCommitSha ?? project?.connectedCommitSha ?? task.runnerState?.gitBaseline?.headSha ?? null;
}

export function abbreviateCommitSha(sha: string | null | undefined): string {
  if (!sha) {
    return "—";
  }
  return sha.length > 8 ? sha.slice(0, 8) : sha;
}

export function taskSourceBranch(task: TaskRecord, project?: ProjectRecord | null): string {
  return task.runnerState?.gitBaseline?.branch ?? project?.defaultBranch ?? "main";
}

export function isPublicGitHubTask(task: TaskRecord): boolean {
  return Boolean(task.projectId) || isPublicGitHubRepoUrl(task.workspace);
}
