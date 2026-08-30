import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { detectSensitiveIntent } from "@/lib/sensitive-intent";
import { buildContract, WORKSPACE_NAME, zeroChangeRunnerState } from "@/lib/task-contract";
import type { RunnerState, TaskStatus } from "@/lib/task-contract";
import type { BlockedReason } from "@/lib/sensitive-intent";
import type { TaskRecord } from "@/lib/tasks-schema";
import { toTaskRecord, type TaskRowShape } from "@/lib/tasks/task-record";
import {
  applyHumanApproval,
  findExistingHumanApproval,
  type HumanGateDecision,
  type SensitiveApprovalAction,
} from "@/lib/human-approval";

const SELECT_COLUMNS =
  "id, workspace, goal, status, contract, blocked_reasons, runner_state, created_at, updated_at, locked_at, project_id, source_commit_sha";

export type SupabaseTaskRepository = ReturnType<typeof createSupabaseTaskRepository>;

export function createSupabaseTaskRepository(
  supabase: SupabaseClient<Database>,
  projectLookup?: {
    getProject(id: string, userId: string): Promise<{ repositoryUrl: string; connectedCommitSha: string | null } | null>;
  },
) {
  return {
    async createTask(input: {
      userId: string;
      goal: string;
      workspace?: string;
      projectId?: string;
    }): Promise<TaskRecord> {
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
        workspace = project.repositoryUrl;
        projectId = input.projectId;
        sourceCommitSha = project.connectedCommitSha;
        if (!sourceCommitSha) {
          throw new Error("Project belum memiliki commit SHA yang tercatat.");
        }
      }

      const contract = buildContract(input.goal);
      const blockedReasons = detectSensitiveIntent(input.goal);
      const blocked = blockedReasons.length > 0;

      const runnerState = zeroChangeRunnerState(
        blocked
          ? "Runner tidak dipanggil karena task dihentikan oleh pre-flight check."
          : "Runner belum dihubungkan pada tahap ini.",
      );

      const { data: row, error } = await supabase
        .from("tasks")
        .insert({
          user_id: input.userId,
          workspace,
          goal: contract.goal,
          status: blocked ? "BLOCKED" : "CONTRACT_READY",
          contract,
          blocked_reasons: blockedReasons,
          runner_state: runnerState,
          project_id: projectId,
          source_commit_sha: sourceCommitSha,
        })
        .select(SELECT_COLUMNS)
        .single();

      if (error || !row) {
        console.error("createTask failed", error?.code);
        throw new Error("Task gagal disimpan.");
      }

      return toTaskRecord(row as TaskRowShape);
    },

    async getTask(id: string): Promise<TaskRecord | null> {
      const { data: row, error } = await supabase
        .from("tasks")
        .select(SELECT_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("getTask failed", error.code);
        throw new Error("Task gagal dibaca.");
      }
      return row ? toTaskRecord(row as TaskRowShape) : null;
    },

    async listTasks(userId: string): Promise<TaskRecord[]> {
      const { data: rows, error } = await supabase
        .from("tasks")
        .select(SELECT_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("listTasks failed", error.code);
        throw new Error("Daftar task gagal dibaca.");
      }
      return (rows ?? []).map((row) => toTaskRecord(row as TaskRowShape));
    },

    async getTaskState(id: string): Promise<{
      status: TaskStatus;
      blockedReasons: BlockedReason[];
      runnerState: RunnerState | null;
      lockedAt: string | null;
    } | null> {
      const { data: row, error } = await supabase
        .from("tasks")
        .select("status, blocked_reasons, runner_state, locked_at")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("getTaskState failed", error.code);
        throw new Error("Status task gagal dibaca.");
      }
      if (!row) return null;

      return {
        status: row.status as TaskStatus,
        blockedReasons: (row.blocked_reasons ?? []) as BlockedReason[],
        runnerState: (row.runner_state ?? null) as RunnerState | null,
        lockedAt: row.locked_at,
      };
    },

    async lockContract(input: { id: string; userId: string }): Promise<TaskRecord> {
      const { data: row, error } = await supabase
        .from("tasks")
        .update({
          status: "APPROVED_FOR_EXECUTION",
          locked_at: new Date().toISOString(),
          runner_state: zeroChangeRunnerState(
            "Contract terkunci. Runner eksekusi belum dihubungkan, jadi belum ada kode yang dijalankan.",
          ),
        })
        .eq("id", input.id)
        .eq("status", "CONTRACT_READY")
        .is("locked_at", null)
        .select(SELECT_COLUMNS)
        .maybeSingle();

      if (error) {
        console.error("lockContract failed", error.code);
        throw new Error("Contract gagal dikunci.");
      }
      if (!row) {
        throw new Error("Contract tidak dapat dikunci pada status saat ini.");
      }

      await supabase.from("task_approvals").insert({
        task_id: input.id,
        decision: "APPROVE_EXECUTION",
        actor_user_id: input.userId,
        note: null,
      });

      return toTaskRecord(row as TaskRowShape);
    },

    async recordApproval(input: {
      id: string;
      userId: string;
      decision: string;
      note?: string;
    }): Promise<{ status: "ok" }> {
      const { error } = await supabase.from("task_approvals").insert({
        task_id: input.id,
        decision: input.decision,
        actor_user_id: input.userId,
        note: input.note ?? null,
      });

      if (error) {
        console.error("recordApproval failed", error.code);
        throw new Error("Keputusan gagal disimpan.");
      }
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

      const task = await this.getTask(input.id);
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
        return task;
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

      const { data: row, error: updateError } = await supabase
        .from("tasks")
        .update({
          status: result.status,
          runner_state: result.runnerState,
        })
        .eq("id", input.id)
        .select(SELECT_COLUMNS)
        .maybeSingle();

      if (updateError || !row) {
        console.error("recordHumanApproval update failed", updateError?.code);
        throw new Error("Approval belum tersimpan. Coba lagi.");
      }

      const { error: insertError } = await supabase.from("task_approvals").insert({
        task_id: input.id,
        decision: input.decision,
        actor_user_id: input.userId,
        note: input.note ?? null,
      });

      if (insertError) {
        console.error("recordHumanApproval insert failed", insertError.code);
        throw new Error("Approval belum tersimpan. Coba lagi.");
      }

      return toTaskRecord(row as TaskRowShape);
    },

    async updateAfterRun(input: {
      id: string;
      status: TaskStatus;
      runnerState: RunnerState;
      blockedReasons?: BlockedReason[];
    }): Promise<TaskRecord> {
      const update: {
        status: TaskStatus;
        runner_state: RunnerState;
        blocked_reasons?: BlockedReason[];
      } = {
        status: input.status,
        runner_state: input.runnerState,
      };
      if (input.blockedReasons) {
        update.blocked_reasons = input.blockedReasons;
      }

      const { data: row, error } = await supabase
        .from("tasks")
        .update(update)
        .eq("id", input.id)
        .select(SELECT_COLUMNS)
        .maybeSingle();

      if (error || !row) {
        throw new Error("Gagal menyimpan hasil orchestrator.");
      }

      return toTaskRecord(row as TaskRowShape);
    },
  };
}
