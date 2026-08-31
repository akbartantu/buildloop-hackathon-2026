import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { WORKSPACE_NAME, zeroChangeRunnerState } from "@/lib/task-contract";
import type { RunnerState, TaskStatus } from "@/lib/task-contract";
import type { BlockedReason } from "@/lib/sensitive-intent";
import type { TaskRecord } from "@/lib/tasks-schema";
import { buildPlanningInputForTask, type PlanningDeps } from "@/lib/planning/build-planning-input";
import { planAndEvaluateTask } from "@/lib/task-planning";
import { getWorkspaceRoot } from "@/orchestrator/product/orchestrator";
import { toTaskRecord, fromTaskRow, type TaskRowShape } from "@/lib/tasks/task-record";
import {
  resolveAuthorizedDeliveryHandoff,
  sanitizeRunnerStateForClient,
  DeliveryArtifactAccessError,
  type AuthorizedDeliveryHandoff,
} from "@/lib/delivery-artifact-gate";
import {
  applyClarificationAnswer,
  applyContractRefresh,
  applyDraftUpdate,
  applyTaskRevision,
} from "@/lib/tasks/task-mutations";
import {
  applyHumanApproval,
  findExistingHumanApproval,
  type HumanGateDecision,
  type SensitiveApprovalAction,
} from "@/lib/human-approval";
import { captureContractInputs } from "@/lib/task-rerun";

const SELECT_COLUMNS =
  "id, workspace, goal, status, contract, blocked_reasons, runner_state, created_at, updated_at, locked_at, project_id, source_commit_sha";

const SELECT_COLUMNS_WITH_OWNER = `${SELECT_COLUMNS}, user_id`;

async function readTaskRow(
  supabase: SupabaseClient<Database>,
  id: string,
  withOwner = false,
): Promise<(TaskRowShape & { user_id?: string }) | null> {
  const { data: row, error } = await supabase
    .from("tasks")
    .select(withOwner ? SELECT_COLUMNS_WITH_OWNER : SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("readTaskRow failed", error.code);
    throw new Error("Task gagal dibaca.");
  }
  return row ? (row as unknown as TaskRowShape & { user_id?: string }) : null;
}

export type SupabaseTaskRepository = ReturnType<typeof createSupabaseTaskRepository>;

export function createSupabaseTaskRepository(
  supabase: SupabaseClient<Database>,
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

      const taskId = crypto.randomUUID();
      const planningInput = await buildPlanningInputForTask(
        {
          id: taskId,
          goal: input.goal,
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
        { workspaceRoot: getWorkspaceRoot() },
      );
      const planned = await planAndEvaluateTask(planningInput);

      const runnerState = planned.runnerState;

      const { data: row, error } = await supabase
        .from("tasks")
        .insert({
          user_id: input.userId,
          workspace,
          goal: planned.contract.goal,
          status: planned.status,
          contract: planned.contract,
          blocked_reasons: planned.blockedReasons,
          runner_state: runnerState,
          locked_at: planned.lockedAt,
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
      const row = await readTaskRow(supabase, id);
      return row ? toTaskRecord(row) : null;
    },

    async getAuthorizedDeliveryHandoff(input: {
      id: string;
      userId: string;
    }): Promise<AuthorizedDeliveryHandoff> {
      const row = await readTaskRow(supabase, input.id, true);
      if (!row || row.user_id !== input.userId) {
        throw new DeliveryArtifactAccessError("Delivery handoff is not authorized.");
      }
      return resolveAuthorizedDeliveryHandoff(fromTaskRow(row));
    },

    async listTasks(userId: string, filter?: { projectId?: string | null }): Promise<TaskRecord[]> {
      let query = supabase
        .from("tasks")
        .select(SELECT_COLUMNS)
        .eq("user_id", userId);

      if (filter?.projectId === null) {
        query = query.is("project_id", null);
      } else if (filter?.projectId) {
        query = query.eq("project_id", filter.projectId);
      }

      const { data: rows, error } = await query.order("created_at", { ascending: false }).limit(20);

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
        runnerState: sanitizeRunnerStateForClient(
          (row.runner_state ?? null) as RunnerState | null,
        ),
        lockedAt: row.locked_at,
      };
    },

    async lockContract(input: { id: string; userId: string }): Promise<TaskRecord> {
      const existing = await this.getTask(input.id);
      if (!existing) {
        throw new Error("Contract cannot be locked in the current status.");
      }

      const { data: row, error } = await supabase
        .from("tasks")
        .update({
          status: "APPROVED_FOR_EXECUTION",
          locked_at: new Date().toISOString(),
          runner_state: {
            ...zeroChangeRunnerState("Contract locked. Orchestrator is ready to run."),
            lockedContractInputs: captureContractInputs(existing.contract),
          },
        })
        .eq("id", input.id)
        .in("status", ["DRAFT", "CONTRACT_READY"])
        .is("locked_at", null)
        .select(SELECT_COLUMNS)
        .maybeSingle();

      if (error) {
        console.error("lockContract failed", error.code);
        throw new Error("Contract could not be locked.");
      }
      if (!row) {
        throw new Error("Contract cannot be locked in the current status.");
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
      reviewType?: import("@/lib/human-approval").AdditionalReviewType;
      confirmedReview?: boolean;
    }): Promise<TaskRecord> {
      if (input.decision === "APPROVE_COMMIT" && !input.confirmedReview) {
        throw new Error("Konfirmasi review diperlukan sebelum menyimpan approval commit.");
      }

      const row = await readTaskRow(supabase, input.id);
      if (!row) {
        throw new Error("Task tidak ditemukan.");
      }
      const task = fromTaskRow(row);

      const runId = task.runnerState?.runId ?? null;
      const existing = findExistingHumanApproval(
        task.runnerState,
        input.decision,
        input.action,
        runId,
      );
      if (existing) {
        return toTaskRecord(row as TaskRowShape);
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

      const { data: updatedRow, error: updateError } = await supabase
        .from("tasks")
        .update({
          status: result.status,
          runner_state: result.runnerState,
        })
        .eq("id", input.id)
        .select(SELECT_COLUMNS)
        .maybeSingle();

      if (updateError || !updatedRow) {
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

      return toTaskRecord(updatedRow as TaskRowShape);
    },

    async updateDraftTask(input: {
      id: string;
      userId: string;
      goal: string;
      acceptanceCriteria?: string[];
    }): Promise<TaskRecord> {
      const existing = await this.getTask(input.id);
      if (!existing) throw new Error("Task not found.");
      const stored = {
        ...existing,
        userId: input.userId,
      };
      const { task: updated } = await applyDraftUpdate(
        stored as never,
        {
          goal: input.goal,
          ...(input.acceptanceCriteria ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
        },
        planningDeps,
      );
      const { data: row, error } = await supabase
        .from("tasks")
        .update({
          goal: updated.goal,
          status: updated.status,
          contract: updated.contract,
          blocked_reasons: updated.blockedReasons,
          runner_state: updated.runnerState,
          locked_at: null,
        })
        .eq("id", input.id)
        .select(SELECT_COLUMNS)
        .maybeSingle();
      if (error || !row) throw new Error("Task could not be updated.");
      return toTaskRecord(row as TaskRowShape);
    },

    async reviseTask(input: {
      id: string;
      userId: string;
      goal?: string;
      acceptanceCriteria?: string[];
    }): Promise<TaskRecord> {
      const existing = await this.getTask(input.id);
      if (!existing) throw new Error("Task not found.");
      const { task: updated } = await applyTaskRevision(
        existing as never,
        {
          ...(input.goal ? { goal: input.goal } : {}),
          ...(input.acceptanceCriteria ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
        },
        planningDeps,
      );
      const { data: row, error } = await supabase
        .from("tasks")
        .update({
          goal: updated.goal,
          status: updated.status,
          contract: updated.contract,
          blocked_reasons: updated.blockedReasons,
          runner_state: updated.runnerState,
          locked_at: null,
        })
        .eq("id", input.id)
        .select(SELECT_COLUMNS)
        .maybeSingle();
      if (error || !row) throw new Error("Task could not be revised.");
      await supabase.from("task_approvals").insert({
        task_id: input.id,
        decision: "REVISE",
        actor_user_id: input.userId,
        note: "Contract revised before execution.",
      });
      return toTaskRecord(row as TaskRowShape);
    },

    async refreshContract(input: { id: string; userId: string }): Promise<TaskRecord> {
      const existing = await this.getTask(input.id);
      if (!existing) throw new Error("Task not found.");
      if (!existing.projectId || !projectLookup) {
        throw new Error("Project workspace could not be verified.");
      }
      const project = await projectLookup.getProject(existing.projectId, input.userId);
      if (!project) throw new Error("Project not found.");
      const { task: updated } = await applyContractRefresh(
        existing as never,
        project,
        input.userId,
        projectLookup,
        planningDeps,
      );
      const { data: row, error } = await supabase
        .from("tasks")
        .update({
          goal: updated.goal,
          status: updated.status,
          contract: updated.contract,
          blocked_reasons: updated.blockedReasons,
          runner_state: updated.runnerState,
          locked_at: null,
          source_commit_sha: updated.sourceCommitSha,
        })
        .eq("id", input.id)
        .select(SELECT_COLUMNS)
        .maybeSingle();
      if (error || !row) throw new Error("Contract could not be refreshed.");
      await supabase.from("task_approvals").insert({
        task_id: input.id,
        decision: "REVISE",
        actor_user_id: input.userId,
        note: "Contract refreshed after repository commit change.",
      });
      return toTaskRecord(row as TaskRowShape);
    },

    async answerTaskClarification(input: {
      id: string;
      userId: string;
      answer: string;
    }): Promise<TaskRecord> {
      const existing = await this.getTask(input.id);
      if (!existing) throw new Error("Task not found.");
      const stored = { ...existing, userId: input.userId };
      const { task: updated } = await applyClarificationAnswer(
        stored as never,
        { answer: input.answer },
        planningDeps,
      );
      const { data: row, error } = await supabase
        .from("tasks")
        .update({
          goal: updated.goal,
          status: updated.status,
          contract: updated.contract,
          blocked_reasons: updated.blockedReasons,
          runner_state: updated.runnerState,
          locked_at: null,
        })
        .eq("id", input.id)
        .select(SELECT_COLUMNS)
        .maybeSingle();
      if (error || !row) throw new Error("Clarification could not be saved.");
      return toTaskRecord(row as TaskRowShape);
    },

    async updateRunProgress(input: {
      id: string;
      status: TaskStatus;
      runnerState: RunnerState;
      onlyFromStatuses?: TaskStatus[];
    }): Promise<TaskRecord> {
      let query = supabase
        .from("tasks")
        .update({
          status: input.status,
          runner_state: input.runnerState,
        })
        .eq("id", input.id);

      if (input.onlyFromStatuses?.length) {
        query = query.in("status", input.onlyFromStatuses);
      }

      const { data: row, error } = await query.select(SELECT_COLUMNS).maybeSingle();

      if (error) {
        throw new Error("Failed to persist orchestration progress.");
      }
      if (!row) {
        throw new Error("Orchestrator sudah berjalan untuk task ini.");
      }

      return toTaskRecord(row as TaskRowShape);
    },

    async prepareForRerun(input: {
      id: string;
      status: TaskStatus;
      runnerState: RunnerState;
    }): Promise<TaskRecord> {
      const { data: row, error } = await supabase
        .from("tasks")
        .update({
          status: input.status,
          runner_state: input.runnerState,
        })
        .eq("id", input.id)
        .select(SELECT_COLUMNS)
        .maybeSingle();

      if (error || !row) {
        throw new Error("Failed to prepare task for re-run.");
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
