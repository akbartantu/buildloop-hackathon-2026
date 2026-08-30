import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "@/lib/auth/require-auth";
import {
  createTaskSchema,
  recordApprovalSchema,
  recordHumanApprovalSchema,
  taskIdSchema,
  type TaskRecord,
} from "./tasks-schema";

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => createTaskSchema.parse(input))
  .handler(async ({ data, context }): Promise<TaskRecord> => {
    return context.tasks.createTask({
      userId: context.auth.userId,
      goal: data.goal,
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
  .handler(async ({ context }): Promise<TaskRecord[]> => {
    return context.tasks.listTasks(context.auth.userId);
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
      confirmedReview: data.confirmedReview,
      ...(data.note !== undefined ? { note: data.note } : {}),
    });
  });
