import type { ApprovalAction, ApprovalStatus } from "../types";

export type ApprovalRequest = {
  id: string;
  runId: string;
  action: ApprovalAction;
  status: ApprovalStatus;
  requestedBy: string;
  decidedBy: string | null;
  decisionReason: string | null;
  impactSummary: string;
  createdAt: string;
  decidedAt: string | null;
};

export function createApprovalRequest(input: {
  id: string;
  runId: string;
  action: ApprovalAction;
  requestedBy: string;
  impactSummary: string;
}): ApprovalRequest {
  const now = new Date().toISOString();
  return {
    id: input.id,
    runId: input.runId,
    action: input.action,
    status: "pending",
    requestedBy: input.requestedBy,
    decidedBy: null,
    decisionReason: null,
    impactSummary: input.impactSummary,
    createdAt: now,
    decidedAt: null,
  };
}

export function decideApproval(
  request: ApprovalRequest,
  decision: "approved" | "rejected",
  actor: string,
  reason: string,
): ApprovalRequest {
  return {
    ...request,
    status: decision,
    decidedBy: actor,
    decisionReason: reason,
    decidedAt: new Date().toISOString(),
  };
}

/** Execution approval does not grant commit/push/merge/deploy. */
export function executionApprovalGrantsCommit(request: ApprovalRequest): boolean {
  return request.action === "commit" && request.status === "approved";
}
