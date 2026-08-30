import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { randomUUID } from "node:crypto";

import { detectSensitiveIntent } from "@/lib/sensitive-intent";
import { buildContract, WORKSPACE_NAME, zeroChangeRunnerState } from "@/lib/task-contract";
import type { RunnerState, TaskStatus } from "@/lib/task-contract";
import type { BlockedReason } from "@/lib/sensitive-intent";
import type { TaskRecord } from "@/lib/tasks-schema";
import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import {
  applyHumanApproval,
  findExistingHumanApproval,
  type HumanGateDecision,
  type SensitiveApprovalAction,
} from "@/lib/human-approval";

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

function toRecord(task: DevTaskStore["tasks"][number]): TaskRecord {
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
  };
}

export type DevTaskRepository = ReturnType<typeof createDevTaskRepository>;

export function createDevTaskRepository() {
  return {
    async createTask(input: { userId: string; goal: string }): Promise<TaskRecord> {
      const store = await readStore();
      const contract = buildContract(input.goal);
      const blockedReasons = detectSensitiveIntent(input.goal);
      const blocked = blockedReasons.length > 0;
      const now = new Date().toISOString();

      const task = {
        id: randomUUID(),
        userId: input.userId,
        workspace: WORKSPACE_NAME,
        goal: contract.goal,
        status: (blocked ? "BLOCKED" : "CONTRACT_READY") as TaskStatus,
        contract,
        blockedReasons,
        runnerState: zeroChangeRunnerState(
          blocked
            ? "Runner tidak dipanggil karena task dihentikan oleh pre-flight check."
            : "Runner belum dihubungkan pada tahap ini.",
        ),
        createdAt: now,
        updatedAt: now,
        lockedAt: null,
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

    async listTasks(userId: string): Promise<TaskRecord[]> {
      const store = await readStore();
      return store.tasks
        .filter((task) => task.userId === userId)
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
        throw new Error("Task tidak ditemukan.");
      }

      const task = store.tasks[index];
      if (!task) {
        throw new Error("Task tidak ditemukan.");
      }
      if (task.status !== "CONTRACT_READY" || task.lockedAt) {
        throw new Error("Contract tidak dapat dikunci pada status saat ini.");
      }

      const now = new Date().toISOString();
      task.status = "APPROVED_FOR_EXECUTION";
      task.lockedAt = now;
      task.updatedAt = now;
      task.runnerState = zeroChangeRunnerState(
        "Contract terkunci. Orchestrator siap dijalankan.",
      );

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
      confirmedReview: boolean;
    }): Promise<TaskRecord> {
      if (!input.confirmedReview) {
        throw new Error("Konfirmasi review diperlukan sebelum menyimpan approval.");
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
