import { z } from "zod";
import type { BlockedReason } from "./sensitive-intent";
import type { RunnerState, TaskContract, TaskStatus } from "./task-contract";
import { ADDITIONAL_REVIEW_TYPES } from "@/lib/human-approval-input";

export const GOAL_MAX = 1000;

export const taskIdSchema = z.object({
  id: z.string().uuid(),
});

export const createTaskSchema = z.object({
  goal: z.string().trim().min(10, "Goal is too short").max(GOAL_MAX),
  workspace: z.string().trim().min(1).optional(),
  projectId: z.string().uuid().optional(),
  acceptanceCriteria: z.array(z.string().trim().min(3)).min(1).max(20).optional(),
  clarificationAnswer: z.string().trim().min(1).max(500).optional(),
});

export const updateDraftTaskSchema = taskIdSchema.extend({
  goal: z.string().trim().min(10, "Goal is too short").max(GOAL_MAX),
  acceptanceCriteria: z.array(z.string().trim().min(3)).min(1).max(20).optional(),
  clarificationAnswer: z.string().trim().min(1).max(500).optional(),
});

export const analyzeTaskGoalSchema = z.object({
  goal: z.string().trim().min(10, "Goal is too short").max(GOAL_MAX),
  projectId: z.string().uuid().optional(),
  acceptanceCriteria: z.array(z.string().trim().min(3)).min(1).max(20).optional(),
  clarificationAnswer: z.string().trim().min(1).max(500).optional(),
});

export const answerTaskClarificationSchema = taskIdSchema.extend({
  answer: z.string().trim().min(1).max(500),
});

export const reviseTaskSchema = taskIdSchema.extend({
  goal: z.string().trim().min(10, "Goal is too short").max(GOAL_MAX).optional(),
  acceptanceCriteria: z.array(z.string().trim().min(3)).min(1).max(20).optional(),
});

export const listTasksSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
});

export const executeTaskRunSchema = taskIdSchema.extend({
  activeProjectId: z.string().uuid().nullable().optional(),
});

export const APPROVAL_DECISIONS = ["APPROVE_EXECUTION", "REVISE", "ESCALATE", "CLOSE"] as const;

export const recordApprovalSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(APPROVAL_DECISIONS),
  note: z.string().trim().max(500).optional(),
});

export const HUMAN_GATE_DECISIONS = [
  "APPROVE_COMMIT",
  "REQUEST_REVISION",
  "REJECT_CHANGES",
  "ESCALATE_REVIEW",
] as const;

export const SENSITIVE_APPROVAL_ACTIONS = ["COMMIT", "PUSH", "MERGE", "DEPLOY"] as const;

export const recordHumanApprovalSchema = z
  .object({
    id: z.string().uuid(),
    decision: z.enum(HUMAN_GATE_DECISIONS),
    action: z.enum(SENSITIVE_APPROVAL_ACTIONS).default("COMMIT"),
    note: z.string().trim().max(2000).optional(),
    reviewType: z.enum(ADDITIONAL_REVIEW_TYPES).optional(),
    confirmedReview: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === "APPROVE_COMMIT" && !data.confirmedReview) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirm commit-only approval before submitting.",
        path: ["confirmedReview"],
      });
    }
    if (data.decision === "REQUEST_REVISION" && !data.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Revision note is required.",
        path: ["note"],
      });
    }
    if (data.decision === "ESCALATE_REVIEW") {
      if (!data.reviewType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Review type is required.",
          path: ["reviewType"],
        });
      }
      if (!data.note?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Additional review note is required.",
          path: ["note"],
        });
      }
    }
  });

export type TaskRecord = {
  id: string;
  workspace: string;
  goal: string;
  status: TaskStatus;
  contract: TaskContract;
  blockedReasons: BlockedReason[];
  runnerState: RunnerState | null;
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
  projectId: string | null;
  sourceCommitSha: string | null;
};
