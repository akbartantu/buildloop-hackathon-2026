import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WORKSPACE_NAME, zeroChangeRunnerState } from "@/lib/task-contract";
import type { RunnerState, TaskStatus } from "@/lib/task-contract";
import type { BlockedReason } from "@/lib/sensitive-intent";
import type { TaskRecord } from "@/lib/tasks-schema";
import { sanitizeTaskRecordForClient, resolveAuthorizedDeliveryHandoff, DeliveryArtifactAccessError, type AuthorizedDeliveryHandoff } from "@/lib/delivery-artifact-gate";
import { buildPlanningInputForTask, type PlanningDeps } from "@/lib/planning/build-planning-input";
import { planAndEvaluateTask } from "@/lib/task-planning";
import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import {
  applyClarificationAnswer,
  applyContractRefresh,
  applyDraftUpdate,
  applyTaskRevision,
  newTaskId,
} from "@/lib/tasks/task-mutations";
import {
  applyHumanApproval,
  findExistingHumanApproval,
  type HumanGateDecision,
  type SensitiveApprovalAction,
} from "@/lib/human-approval";
import { captureContractInputs } from "@/lib/task-rerun";

function projectRoot(): string {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

function storePath(): string {
  return path.join(projectRoot(), ".buildloop", "dev-tasks.json");
}

type StoredApproval = {
  taskId: string;
  decision: string;
  action: string | null;
  runId: string | null;
  actorUserId: string;
  note: string | null;
  createdAt: string;
};

type DevTaskStore = {
  tasks: Array<{
    id: string;
    userId: string;
    workspace: string;
    goal: string;
    status: TaskStatus;
    contract: TaskRecord["contract"];
    blockedReasons: BlockedReason[];
    runnerState: RunnerState | null;
    createdAt: string;
    updatedAt: string;
    lockedAt: string | null;
    projectId: string | null;
    sourceCommitSha: string | null;
  }>;
  approvals: StoredApproval[];
};

function emptyStore(): DevTaskStore {
  return { tasks: [], approvals: [] };
}

async function readStore(): Promise<DevTaskStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    return JSON.parse(raw) as DevTaskStore;
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: DevTaskStore): Promise<void> {
  const filePath = storePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

function toRawRecord(task: DevTaskStore["tasks"][number]): TaskRecord {
  return {
    id: task.id,
    workspace: task.workspace,
    goal: task.goal,
    status: task.status,
    contract: task.contract,
    blockedReasons: task.blockedReasons,
    runnerState: task.runnerState,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    lockedAt: task.lockedAt,
    projectId: task.projectId,
    sourceCommitSha: task.sourceCommitSha,
  };
}

function toRecord(task: DevTaskStore["tasks"][number]): TaskRecord {
  return sanitizeTaskRecordForClient(toRawRecord(task));
}

export type DevTaskRepository = ReturnType<typeof createDevTaskRepository>;

export function createDevTaskRepository(
  projectLookup?: {
    getProject(
      id: string,
      userId: string,
    ): Promise<{
      repositoryUrl: string;
      connectedCommitSha: string | null;
      disconnectedAt?: string | null;
    } | null>;
  },
  planningDeps: PlanningDeps = {},
) {
  return {
    async createTask(input: {
      userId: string;
      goal: string;
      workspace?: string;
      projectId?: string;
      acceptanceCriteria?: string[];
      clarificationAnswer?: string;
    }): Promise<TaskRecord> {
      const store = await readStore();
      let workspace = input.workspace ?? WORKSPACE_NAME;
      let projectId: string | null = null;
      let sourceCommitSha: string | null = null;

      if (input.projectId) {
        if (!projectLookup) {
          throw new Error("Project tidak dapat diverifikasi.");
        }
        const project = await projectLookup.getProject(input.projectId, input.userId);
        if (!project) {
          throw new Error("Project tidak ditemukan.");
        }
        if (project.disconnectedAt) {
          throw new Error("Repository is disconnected for this workspace.");
        }
        workspace = project.repositoryUrl;
        projectId = input.projectId;
        sourceCommitSha = project.connectedCommitSha;
        if (!sourceCommitSha) {
          throw new Error("Project belum memiliki commit SHA yang tercatat.");
        }
      }

      const taskId = newTaskId();
      const planningInput = await buildPlanningInputForTask(
        {
          id: taskId,
          goal: input.goal,
          workspace,
          projectId,
          sourceCommitSha,
          contract: {},
          userId: input.userId,
        },
        {
          goal: input.goal,
          ...(input.acceptanceCriteria ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
          ...(input.clarificationAnswer ? { clarificationAnswer: input.clarificationAnswer } : {}),
        },
        planningDeps,
        { workspaceRoot: projectRoot() },
      );
      const planned = await planAndEvaluateTask(planningInput);
      const now = new Date().toISOString();

      const task = {
        id: taskId,
        userId: input.userId,
        workspace,
        goal: planned.contract.goal,
        status: planned.status,
        contract: planned.contract,
        blockedReasons: planned.blockedReasons,
        runnerState: planned.runnerState,
        createdAt: now,
        updatedAt: now,
        lockedAt: planned.lockedAt,
        projectId,
        sourceCommitSha,
      };

      store.tasks.unshift(task);
      await writeStore(store);
      return toRecord(task);
    },

    async getTask(id: string): Promise<TaskRecord | null> {
      const store = await readStore();
      const task = store.tasks.find((item) => item.id === id);
      return task ? toRecord(task) : null;
    },

    async getAuthorizedDeliveryHandoff(input: {
      id: string;
      userId: string;
    }): Promise<AuthorizedDeliveryHandoff> {
      const store = await readStore();
      const task = store.tasks.find((item) => item.id === input.id);
      if (!task || task.userId !== input.userId) {
        throw new DeliveryArtifactAccessError("Delivery handoff is not authorized.");
      }
      return resolveAuthorizedDeliveryHandoff(toRawRecord(task));
    },

    async listTasks(userId: string, filter?: { projectId?: string | null }): Promise<TaskRecord[]> {
      const store = await readStore();
      return store.tasks
        .filter((task) => task.userId === userId)
        .filter((task) => {
          if (filter?.projectId === undefined) {
            return true;
          }
          if (filter.projectId === null) {
            return task.projectId === null;
          }
          return task.projectId === filter.projectId;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 20)
        .map(toRecord);
    },

    async getTaskState(id: string): Promise<{
      status: TaskStatus;
      blockedReasons: BlockedReason[];
      runnerState: RunnerState | null;
      lockedAt: string | null;
    } | null> {
      const task = await this.getTask(id);
      if (!task) return null;
      return {
        status: task.status,
        blockedReasons: task.blockedReasons,
        runnerState: task.runnerState,
        lockedAt: task.lockedAt,
      };
    },

    async lockContract(input: { id: string; userId: string }): Promise<TaskRecord> {
      const store = await readStore();
      const index = store.tasks.findIndex((task) => task.id === input.id);
      if (index === -1) {
        throw new Error("Task not found.");
      }

      const task = store.tasks[index];
      if (!task) {
        throw new Error("Task not found.");
      }
      if (!["DRAFT", "CONTRACT_READY"].includes(task.status) || task.lockedAt) {
        throw new Error("Contract cannot be locked in the current status.");
      }

      const now = new Date().toISOString();
      task.status = "APPROVED_FOR_EXECUTION";
      task.lockedAt = now;
      task.updatedAt = now;
      task.runnerState = {
        ...zeroChangeRunnerState("Contract locked. Orchestrator is ready to run."),
        lockedContractInputs: captureContractInputs(task.contract),
      };

      store.approvals.push({
        taskId: input.id,
        decision: "APPROVE_EXECUTION",
        action: null,
        runId: null,
        actorUserId: input.userId,
        note: null,
        createdAt: now,
      });

      await writeStore(store);
      return toRecord(task);
    },

    async recordApproval(input: {
      id: string;
      userId: string;
      decision: string;
      note?: string;
    }): Promise<{ status: "ok" }> {
      const store = await readStore();
      store.approvals.push({
        taskId: input.id,
        decision: input.decision,
        action: null,
        runId: null,
        actorUserId: input.userId,
        note: input.note ?? null,
        createdAt: new Date().toISOString(),
      });
      await writeStore(store);
      return { status: "ok" };
    },

    async recordHumanApproval(input: {
      id: string;
      userId: string;
      decision: HumanGateDecision;
      action: SensitiveApprovalAction;
      note?: string;
      reviewType?: import("@/lib/human-approval").AdditionalReviewType;
      confirmedReview?: boolean;
    }): Promise<TaskRecord> {
      if (input.decision === "APPROVE_COMMIT" && !input.confirmedReview) {
        throw new Error("Konfirmasi review diperlukan sebelum menyimpan approval commit.");
      }

      const store = await readStore();
      const index = store.tasks.findIndex((task) => task.id === input.id);
      if (index === -1) {
        throw new Error("Task tidak ditemukan.");
      }

      const task = store.tasks[index];
      if (!task) {
        throw new Error("Task tidak ditemukan.");
      }

      const runId = task.runnerState?.runId ?? null;
      const existing = findExistingHumanApproval(
        task.runnerState,
        input.decision,
        input.action,
        runId,
      );
      if (existing) {
        return toRecord(task);
      }

      const result = applyHumanApproval({
        task: {
          status: task.status,
          runnerState: task.runnerState,
          contract: task.contract,
        },
        decision: input.decision,
        action: input.action,
        actorUserId: input.userId,
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.reviewType !== undefined ? { reviewType: input.reviewType } : {}),
      });

      const now = new Date().toISOString();
      task.status = result.status;
      task.runnerState = result.runnerState;
      task.updatedAt = now;

      store.approvals.push({
        taskId: input.id,
        decision: input.decision,
        action: input.action,
        runId,
        actorUserId: input.userId,
        note: input.note ?? null,
        createdAt: now,
      });

      await writeStore(store);
      return toRecord(task);
    },

    async updateDraftTask(input: {
      id: string;
      userId: string;
      goal: string;
      acceptanceCriteria?: string[];
      clarificationAnswer?: string;
    }): Promise<TaskRecord> {
      const store = await readStore();
      const index = store.tasks.findIndex((task) => task.id === input.id);
      if (index === -1) throw new Error("Task not found.");
      const task = store.tasks[index]!;
      const { task: updated } = await applyDraftUpdate(
        task,
        {
          goal: input.goal,
          ...(input.acceptanceCriteria ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
          ...(input.clarificationAnswer ? { clarificationAnswer: input.clarificationAnswer } : {}),
        },
        planningDeps,
        { incrementVersion: true },
      );
      updated.updatedAt = new Date().toISOString();
      store.tasks[index] = updated;
      await writeStore(store);
      return toRecord(updated);
    },

    async reviseTask(input: {
      id: string;
      userId: string;
      goal?: string;
      acceptanceCriteria?: string[];
    }): Promise<TaskRecord> {
      const store = await readStore();
      const index = store.tasks.findIndex((task) => task.id === input.id);
      if (index === -1) throw new Error("Task not found.");
      const task = store.tasks[index]!;
      const { task: updated } = await applyTaskRevision(
        task,
        {
          ...(input.goal ? { goal: input.goal } : {}),
          ...(input.acceptanceCriteria ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
        },
        planningDeps,
      );
      updated.updatedAt = new Date().toISOString();
      store.approvals.push({
        taskId: input.id,
        decision: "REVISE",
        action: null,
        runId: null,
        actorUserId: input.userId,
        note: "Contract revised before execution.",
        createdAt: updated.updatedAt,
      });
      store.tasks[index] = updated;
      await writeStore(store);
      return toRecord(updated);
    },

    async refreshContract(input: { id: string; userId: string }): Promise<TaskRecord> {
      const store = await readStore();
      const index = store.tasks.findIndex((task) => task.id === input.id);
      if (index === -1) throw new Error("Task not found.");
      const task = store.tasks[index]!;
      if (!task.projectId || !projectLookup) {
        throw new Error("Project workspace could not be verified.");
      }
      const project = await projectLookup.getProject(task.projectId, input.userId);
      if (!project) throw new Error("Project not found.");
      const { task: updated } = await applyContractRefresh(
        task,
        project,
        input.userId,
        projectLookup,
        planningDeps,
      );
      updated.updatedAt = new Date().toISOString();
      store.approvals.push({
        taskId: input.id,
        decision: "REVISE",
        action: null,
        runId: null,
        actorUserId: input.userId,
        note: "Contract refreshed after repository commit change.",
        createdAt: updated.updatedAt,
      });
      store.tasks[index] = updated;
      await writeStore(store);
      return toRecord(updated);
    },

    async answerTaskClarification(input: {
      id: string;
      userId: string;
      answer: string;
    }): Promise<TaskRecord> {
      const store = await readStore();
      const index = store.tasks.findIndex((task) => task.id === input.id);
      if (index === -1) throw new Error("Task not found.");
      const task = store.tasks[index]!;
      const { task: updated } = await applyClarificationAnswer(
        task,
        { answer: input.answer },
        planningDeps,
      );
      updated.updatedAt = new Date().toISOString();
      store.tasks[index] = updated;
      await writeStore(store);
      return toRecord(updated);
    },

    async updateRunProgress(input: {
      id: string;
      status: TaskStatus;
      runnerState: RunnerState;
      onlyFromStatuses?: TaskStatus[];
    }): Promise<TaskRecord> {
      const store = await readStore();
      const index = store.tasks.findIndex((task) => task.id === input.id);
      if (index === -1) {
        throw new Error("Task not found.");
      }

      const task = store.tasks[index];
      if (!task) {
        throw new Error("Task not found.");
      }

      if (input.onlyFromStatuses && !input.onlyFromStatuses.includes(task.status)) {
        throw new Error("Orchestrator sudah berjalan untuk task ini.");
      }

      task.status = input.status;
      task.runnerState = input.runnerState;
      task.updatedAt = new Date().toISOString();
      await writeStore(store);
      return toRecord(task);
    },

    async prepareForRerun(input: {
      id: string;
      status: TaskStatus;
      runnerState: RunnerState;
    }): Promise<TaskRecord> {
      const store = await readStore();
      const index = store.tasks.findIndex((task) => task.id === input.id);
      if (index === -1) {
        throw new Error("Task not found.");
      }
      const task = store.tasks[index];
      if (!task) {
        throw new Error("Task not found.");
      }
      task.status = input.status;
      task.runnerState = input.runnerState;
      task.updatedAt = new Date().toISOString();
      await writeStore(store);
      return toRecord(task);
    },

    async updateAfterRun(input: {
      id: string;
      status: TaskStatus;
      runnerState: RunnerState;
      blockedReasons?: BlockedReason[];
    }): Promise<TaskRecord> {
      const store = await readStore();
      const index = store.tasks.findIndex((task) => task.id === input.id);
      if (index === -1) {
        throw new Error("Task tidak ditemukan.");
      }

      const task = store.tasks[index];
      if (!task) {
        throw new Error("Task tidak ditemukan.");
      }
      task.status = input.status;
      task.runnerState = input.runnerState;
      task.updatedAt = new Date().toISOString();
      if (input.blockedReasons) {
        task.blockedReasons = input.blockedReasons;
      }

      await writeStore(store);
      return toRecord(task);
    },

    async resetForTests(): Promise<void> {
      await writeStore(emptyStore());
    },
  };
}

/** Dev repository scopes tasks to the deterministic development principal. */
export function devTaskUserId(): string {
  return DEV_AUTH_BYPASS_USER_ID;
}
