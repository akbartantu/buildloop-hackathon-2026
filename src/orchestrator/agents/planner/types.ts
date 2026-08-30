export const MAX_CONTRACTS_PER_GOAL = 4;

export type ContractRisk = "low" | "medium" | "high" | "security";
export type ContractApprovalState = "pending" | "auto_approved" | "human_approved" | "awaiting_approval";
export type ContractStatus = "pending" | "running" | "pass" | "failed" | "blocked" | "awaiting_approval";

export type WorkContract = {
  id: string;
  goal: string;
  acceptanceCriteria: string[];
  expectedScope: string[];
  dependencies: string[];
  riskClassification: ContractRisk;
  approvalState: ContractApprovalState;
  status: ContractStatus;
};

export type WorkPlan = {
  userGoal: string;
  contracts: WorkContract[];
  decomposed: boolean;
  plannerSummary: string;
};

export type PlannerInput = {
  goal: string;
  taskId: string;
  maxContracts?: number;
  acceptanceCriteria?: string[];
  workspaceRoot?: string;
};

export type PlannerOutput = WorkPlan;
