import type { TaskRecord } from "@/lib/tasks-schema";

export type ProjectExecutionContext = {
  repositoryUrl: string;
  connectedCommitSha: string | null;
};

export function assertTaskProjectExecutionSafe(input: {
  task: TaskRecord;
  project: ProjectExecutionContext | null;
  activeProjectId?: string | null;
}): void {
  if (input.activeProjectId !== undefined) {
    const taskProjectId = input.task.projectId ?? null;
    if (taskProjectId !== input.activeProjectId) {
      throw new Error("Task does not belong to the active workspace.");
    }
  }

  if (!input.task.projectId) {
    return;
  }

  if (!input.project) {
    throw new Error("Project workspace could not be verified.");
  }

  if (input.project.repositoryUrl !== input.task.workspace) {
    throw new Error("Task repository source does not match the connected project.");
  }

  if (
    input.project.connectedCommitSha &&
    input.task.sourceCommitSha &&
    input.project.connectedCommitSha !== input.task.sourceCommitSha
  ) {
    throw new Error("Task source commit does not match the connected project baseline.");
  }
}
