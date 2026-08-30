import type { ResolvedProjectPolicy } from "./policy-schema";
import { evaluatePolicy, type PolicyDecision } from "./evaluator";
import type { WorkContract } from "../agents/planner/types";

export type ApprovalType = "AUTO_APPROVED_BY_POLICY" | "APPROVED_BY_HUMAN" | null;

export type AutoApprovalResult = {
  approvalType: ApprovalType;
  policyDecision: PolicyDecision;
  reason: string;
  autoApproved: boolean;
  requiresHumanApproval: boolean;
};

export function evaluateContractApproval(
  contract: Pick<WorkContract, "goal" | "riskClassification">,
  policy: ResolvedProjectPolicy,
): AutoApprovalResult {
  const evaluation = evaluatePolicy({
    goal: contract.goal,
    riskClassification: contract.riskClassification,
    policy,
  });

  if (evaluation.decision === "AUTO_APPROVED") {
    return {
      approvalType: "AUTO_APPROVED_BY_POLICY",
      policyDecision: evaluation.decision,
      reason: evaluation.reason,
      autoApproved: true,
      requiresHumanApproval: false,
    };
  }

  if (evaluation.decision === "BLOCKED") {
    return {
      approvalType: null,
      policyDecision: evaluation.decision,
      reason: evaluation.reason,
      autoApproved: false,
      requiresHumanApproval: false,
    };
  }

  return {
    approvalType: null,
    policyDecision: evaluation.decision,
    reason: evaluation.reason,
    autoApproved: false,
    requiresHumanApproval: true,
  };
}

/** Evaluate work plan and determine initial task status. */
export function resolveInitialTaskStatus(
  contracts: WorkContract[],
  policy: ResolvedProjectPolicy,
): {
  status: "BLOCKED" | "CONTRACT_READY" | "APPROVED_FOR_EXECUTION";
  approvalType: ApprovalType;
  policyReason: string;
} {
  for (const contract of contracts) {
    const result = evaluateContractApproval(contract, policy);
    if (result.policyDecision === "BLOCKED") {
      return { status: "BLOCKED", approvalType: null, policyReason: result.reason };
    }
  }

  const allAutoApproved = contracts.every((c) => {
    const r = evaluateContractApproval(c, policy);
    return r.autoApproved;
  });

  if (allAutoApproved && contracts.length > 0) {
    return {
      status: "APPROVED_FOR_EXECUTION",
      approvalType: "AUTO_APPROVED_BY_POLICY",
      policyReason: "All contracts auto-approved by policy.",
    };
  }

  return {
    status: "CONTRACT_READY",
    approvalType: null,
    policyReason: "One or more contracts require human approval.",
  };
}
