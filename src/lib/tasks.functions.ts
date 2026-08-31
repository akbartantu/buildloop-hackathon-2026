import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "@/lib/auth/require-auth";
import { getWorkspaceRoot } from "@/orchestrator/product/orchestrator";
import { analyzeTaskGoal } from "@/lib/task-planning";
import {
  analyzeTaskGoalSchema,
  answerTaskClarificationSchema,
  createTaskSchema,
  executeTaskRunSchema,
  listTasksSchema,
  recordApprovalSchema,
  recordHumanApprovalSchema,
  reviseTaskSchema,
  taskIdSchema,
  updateDraftTaskSchema,
  type TaskRecord,
} from "./tasks-schema";

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => createTaskSchema.parse(input))
  .handler(async ({ data, context }): Promise<TaskRecord> => {
    return context.tasks.createTask({
      userId: context.auth.userId,
      goal: data.goal,
      ...(data.workspace ? { workspace: data.workspace } : {}),
      ...(data.projectId ? { projectId: data.projectId } : {}),
      ...(data.acceptanceCriteria ? { acceptanceCriteria: data.acceptanceCriteria } : {}),
      ...(data.clarificationAnswer ? { clarificationAnswer: data.clarificationAnswer } : {}),
    });
  });

export const getTask = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => taskIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<TaskRecord | null> => {
    return context.tasks.getTask(data.id);
  });

/** Alias eksplisit untuk pembacaan status task (state machine). */
export const getTaskState = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => taskIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    return context.tasks.getTaskState(data.id);
  });

export const listTasks = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => listTasksSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<TaskRecord[]> => {
    return context.tasks.listTasks(context.auth.userId, {
      ...(data.projectId !== undefined ? { projectId: data.projectId } : {}),
    });
  });

export const lockContract = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => taskIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<TaskRecord> => {
    return context.tasks.lockContract({
      id: data.id,
      userId: context.auth.userId,
    });
  });

export const recordApproval = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => recordApprovalSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ status: "ok" }> => {
    return context.tasks.recordApproval({
      id: data.id,
      userId: context.auth.userId,
      decision: data.decision,
      ...(data.note !== undefined ? { note: data.note } : {}),
    });
  });

export const recordHumanApproval = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => recordHumanApprovalSchema.parse(input))
  .handler(async ({ data, context }): Promise<TaskRecord> => {
    return context.tasks.recordHumanApproval({
      id: data.id,
      userId: context.auth.userId,
      decision: data.decision,
      action: data.action,
      ...(data.confirmedReview !== undefined ? { confirmedReview: data.confirmedReview } : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
      ...(data.reviewType !== undefined ? { reviewType: data.reviewType } : {}),
    });
  });

export const analyzeTaskGoalPreview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => analyzeTaskGoalSchema.parse(input))
  .handler(async ({ data, context }) => {
    const specifications = data.projectId
      ? await context.specifications.listPlanningSpecifications(data.projectId, context.auth.userId)
      : [];
    let sourceCommitSha: string | null = null;
    if (data.projectId) {
      const project = await context.projects.getProject(data.projectId, context.auth.userId);
      sourceCommitSha = project?.connectedCommitSha ?? null;
    }

    return analyzeTaskGoal({
      goal: data.goal,
      taskId: "preview",
      workspaceRoot: getWorkspaceRoot(),
      specifications,
      sourceCommitSha,
      ...(data.acceptanceCriteria ? { acceptanceCriteria: data.acceptanceCriteria } : {}),
      ...(data.clarificationAnswer ? { clarificationAnswer: data.clarificationAnswer } : {}),
    });
  });

export const answerTaskClarification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => answerTaskClarificationSchema.parse(input))
  .handler(async ({ data, context }): Promise<TaskRecord> => {
    return context.tasks.answerTaskClarification({
      id: data.id,
      userId: context.auth.userId,
      answer: data.answer,
    });
  });

export const updateDraftTask = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => updateDraftTaskSchema.parse(input))
  .handler(async ({ data, context }): Promise<TaskRecord> => {
    return context.tasks.updateDraftTask({
      id: data.id,
      userId: context.auth.userId,
      goal: data.goal,
      ...(data.acceptanceCriteria ? { acceptanceCriteria: data.acceptanceCriteria } : {}),
    });
  });

export const reviseTask = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => reviseTaskSchema.parse(input))
  .handler(async ({ data, context }): Promise<TaskRecord> => {
    return context.tasks.reviseTask({
      id: data.id,
      userId: context.auth.userId,
      ...(data.goal ? { goal: data.goal } : {}),
      ...(data.acceptanceCriteria ? { acceptanceCriteria: data.acceptanceCriteria } : {}),
    });
  });

export const refreshContract = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => taskIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<TaskRecord> => {
    return context.tasks.refreshContract({
      id: data.id,
      userId: context.auth.userId,
    });
  });
