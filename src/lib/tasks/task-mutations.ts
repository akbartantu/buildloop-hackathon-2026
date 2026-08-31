import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPlanningInputForTask, type PlanningDeps } from "@/lib/planning/build-planning-input";
import { zeroChangeRunnerState } from "@/lib/task-contract";
import { planAndEvaluateTask } from "@/lib/task-planning";
import type { TaskRecord } from "@/lib/tasks-schema";
import {
  appendContractHistory,
  canReviseTask,
  canUpdateDraft,
  getContractVersion,
  type TaskContractWithMeta,
} from "@/lib/task-lifecycle-ops";

function projectRoot(): string {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

type StoredTask = {
  id: string;
  userId: string;
  workspace: string;
  goal: string;
  status: TaskRecord["status"];
  contract: TaskRecord["contract"];
  blockedReasons: TaskRecord["blockedReasons"];
  runnerState: TaskRecord["runnerState"];
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
  projectId: string | null;
  sourceCommitSha: string | null;
};

type ProjectLookup = {
  getProject(
    id: string,
    userId: string,
  ): Promise<{ repositoryUrl: string; connectedCommitSha: string | null } | null>;
};

async function replanTask(
  task: StoredTask,
  input: { goal: string; acceptanceCriteria?: string[]; clarificationAnswer?: string },
  deps: PlanningDeps,
  options?: { incrementVersion?: boolean },
): Promise<ReturnType<typeof planAndEvaluateTask>> {
  const increment = options?.incrementVersion ?? true;
  const currentVersion = getContractVersion(task.contract);
  const version = increment ? currentVersion + 1 : currentVersion;
  const history = increment
    ? appendContractHistory(task.contract as TaskContractWithMeta, task)
    : (task.contract as TaskContractWithMeta).contractHistory;

  const planningInput = await buildPlanningInputForTask(task, input, deps, {
    workspaceRoot: projectRoot(),
    contractVersion: version,
    ...(history?.length ? { contractHistory: history } : {}),
  });

  return planAndEvaluateTask(planningInput);
}

export async function applyDraftUpdate(
  task: StoredTask,
  input: { goal: string; acceptanceCriteria?: string[]; clarificationAnswer?: string },
  deps: PlanningDeps = {},
  options?: { incrementVersion?: boolean },
): Promise<{ task: StoredTask; planned: Awaited<ReturnType<typeof planAndEvaluateTask>> }> {
  if (!canUpdateDraft(task as TaskRecord)) {
    throw new Error("Task cannot be edited in its current lifecycle state.");
  }
  const planned = await replanTask(task, input, deps, {
    incrementVersion: options?.incrementVersion ?? false,
  });
  return {
    task: {
      ...task,
      goal: planned.contract.goal,
      status: planned.status,
      contract: planned.contract,
      blockedReasons: planned.blockedReasons,
      runnerState: planned.runnerState,
      lockedAt: null,
    },
    planned,
  };
}

export async function applyTaskRevision(
  task: StoredTask,
  input: { goal?: string; acceptanceCriteria?: string[]; clarificationAnswer?: string },
  deps: PlanningDeps = {},
): Promise<{ task: StoredTask; planned: Awaited<ReturnType<typeof planAndEvaluateTask>> }> {
  if (!canReviseTask(task as TaskRecord)) {
    if ((task as TaskRecord).runnerState?.runnerInvoked) {
      throw new Error("Task has already executed. Duplicate as a new task instead of revising history.");
    }
    throw new Error("Task cannot be revised in its current lifecycle state.");
  }
  const planned = await replanTask(
    task,
    {
      goal: input.goal ?? task.goal,
      ...(input.acceptanceCriteria ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
      ...(input.clarificationAnswer ? { clarificationAnswer: input.clarificationAnswer } : {}),
    },
    deps,
  );
  return {
    task: {
      ...task,
      goal: planned.contract.goal,
      status: planned.status === "APPROVED_FOR_EXECUTION" ? "CONTRACT_READY" : planned.status,
      contract: planned.contract,
      blockedReasons: planned.blockedReasons,
      runnerState: planned.runnerState,
      lockedAt: null,
    },
    planned,
  };
}

export async function applyClarificationAnswer(
  task: StoredTask,
  input: { answer: string },
  deps: PlanningDeps = {},
): Promise<{ task: StoredTask; planned: Awaited<ReturnType<typeof planAndEvaluateTask>> }> {
  if (task.status !== "DRAFT") {
    throw new Error("Clarification answers are only accepted for draft tasks.");
  }
  if (!task.contract.clarification?.question) {
    throw new Error("This task does not require clarification.");
  }
  if (task.contract.clarification.answer) {
    throw new Error("Clarification was already answered for this task.");
  }

  const planned = await replanTask(
    task,
    {
      goal: task.goal,
      acceptanceCriteria: task.contract.acceptanceCriteria,
      clarificationAnswer: input.answer,
    },
    deps,
    { incrementVersion: false },
  );

  return {
    task: {
      ...task,
      goal: planned.contract.goal,
      status: planned.status,
      contract: planned.contract,
      blockedReasons: planned.blockedReasons,
      runnerState: planned.runnerState,
      lockedAt: null,
    },
    planned,
  };
}

export async function applyContractRefresh(
  task: StoredTask,
  project: { connectedCommitSha: string | null },
  userId: string,
  projectLookup?: ProjectLookup,
  deps: PlanningDeps = {},
): Promise<{ task: StoredTask; planned: Awaited<ReturnType<typeof planAndEvaluateTask>> }> {
  if (!task.projectId) {
    throw new Error("Only project-linked tasks can refresh against repository changes.");
  }
  if (!project.connectedCommitSha) {
    throw new Error("Project has no recorded commit SHA.");
  }
  if (task.sourceCommitSha === project.connectedCommitSha) {
    throw new Error("Repository commit matches this task — refresh is not required.");
  }
  if ((task as TaskRecord).runnerState?.runnerInvoked) {
    throw new Error("Task has already executed. Duplicate as a new task instead of refreshing history.");
  }

  if (projectLookup) {
    const verified = await projectLookup.getProject(task.projectId, userId);
    if (!verified?.connectedCommitSha) {
      throw new Error("Project workspace could not be verified.");
    }
  }

  const planned = await replanTask(task, { goal: task.goal }, deps);
  return {
    task: {
      ...task,
      goal: planned.contract.goal,
      status: planned.status === "APPROVED_FOR_EXECUTION" ? "CONTRACT_READY" : planned.status,
      contract: planned.contract,
      blockedReasons: planned.blockedReasons,
      runnerState: zeroChangeRunnerState("Contract refreshed against updated repository commit."),
      lockedAt: null,
      sourceCommitSha: project.connectedCommitSha,
    },
    planned,
  };
}

export function newTaskId(): string {
  return randomUUID();
}
