import { SOURCE_COMMIT_DRIFT_CODE, detectSourceCommitDrift } from "@/lib/task-lifecycle-ops";
import type { TaskRecord } from "@/lib/tasks-schema";

export type ProjectExecutionContext = {
  repositoryUrl: string;
  connectedCommitSha: string | null;
  disconnectedAt?: string | null;
};

export { SOURCE_COMMIT_DRIFT_CODE, detectSourceCommitDrift };

export class SourceCommitDriftError extends Error {
  readonly code = SOURCE_COMMIT_DRIFT_CODE;

  constructor() {
    super("Repository changed since this contract was created.");
    this.name = "SourceCommitDriftError";
  }
}

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

  if (input.project.disconnectedAt) {
    throw new Error("Repository is disconnected for this workspace.");
  }

  if (input.project.repositoryUrl !== input.task.workspace) {
    throw new Error("Task repository source does not match the connected project.");
  }

  if (detectSourceCommitDrift(input.task, input.project.connectedCommitSha)) {
    throw new SourceCommitDriftError();
  }
}
