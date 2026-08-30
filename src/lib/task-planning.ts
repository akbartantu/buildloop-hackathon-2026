import { detectSensitiveIntent, type BlockedReason } from "@/lib/sensitive-intent";
import {
  buildContract,
  zeroChangeRunnerState,
  type TaskContract,
  type RunnerState,
  type ApprovalType,
  type TaskStatus,
} from "@/lib/task-contract";
import { planWork, workPlanToContractFields } from "@/orchestrator/agents/planner/planner";
import type { WorkContract } from "@/orchestrator/agents/planner/types";
import { loadProjectGovernance } from "@/orchestrator/policy/project-policy";
import { resolveInitialTaskStatus } from "@/orchestrator/policy/auto-approval";

export type TaskPlanningResult = {
  contract: TaskContract;
  status: TaskStatus;
  blockedReasons: BlockedReason[];
  runnerState: RunnerState;
  approvalType: ApprovalType;
  lockedAt: string | null;
};

export async function planAndEvaluateTask(input: {
  goal: string;
  taskId: string;
  workspaceRoot: string;
}): Promise<TaskPlanningResult> {
  const policy = await loadProjectGovernance(input.workspaceRoot);
  const workPlan = planWork({ goal: input.goal, taskId: input.taskId });
  const fields = workPlanToContractFields(workPlan);

  const base = buildContract(input.goal);
  const contract: TaskContract = {
    ...base,
    goal: fields.goal,
    inScope: fields.inScope,
    acceptanceCriteria: fields.acceptanceCriteria,
    maxAttempts: fields.maxAttempts,
    workPlan: {
      userGoal: workPlan.userGoal,
      decomposed: workPlan.decomposed,
      plannerSummary: workPlan.plannerSummary,
      contracts: workPlan.contracts.map((c: WorkContract) => ({
        id: c.id,
        goal: c.goal,
        acceptanceCriteria: c.acceptanceCriteria,
        expectedScope: c.expectedScope,
        dependencies: c.dependencies,
        riskClassification: c.riskClassification,
        approvalState: c.approvalState,
        status: c.status,
      })),
    },
  };

  const sensitiveBlocked = detectSensitiveIntent(input.goal);
  if (sensitiveBlocked.length > 0) {
    return {
      contract,
      status: "BLOCKED",
      blockedReasons: sensitiveBlocked,
      runnerState: {
        ...zeroChangeRunnerState("Runner tidak dipanggil karena task dihentikan oleh pre-flight check."),
        orchestration: {
          phase: "BLOCKED",
          plannerOutput: workPlan.plannerSummary,
          approvalType: null,
          policyDecision: "BLOCKED",
          contracts: workPlan.contracts.map((c: WorkContract) => ({
            id: c.id,
            goal: c.goal,
            status: "blocked",
            approvalState: "pending",
          })),
        },
      },
      approvalType: null,
      lockedAt: null,
    };
  }

  const initial = resolveInitialTaskStatus(workPlan.contracts, policy);
  const approvalType = initial.approvalType;
  const now = initial.status === "APPROVED_FOR_EXECUTION" ? new Date().toISOString() : null;

  const updatedContracts = workPlan.contracts.map((c: WorkContract) => ({
    ...c,
    approvalState:
      initial.status === "APPROVED_FOR_EXECUTION"
        ? ("auto_approved" as const)
        : c.approvalState,
  }));

  return {
    contract,
    status: initial.status,
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState(
        initial.status === "APPROVED_FOR_EXECUTION"
          ? "Contract auto-approved by policy. Orchestrator siap dijalankan."
          : "Planner selesai. Tinjau contract sebelum eksekusi.",
      ),
      orchestration: {
        phase: initial.status === "APPROVED_FOR_EXECUTION" ? "AUTO_APPROVED" : "CONTRACT_READY",
        plannerOutput: workPlan.plannerSummary,
        approvalType,
        policyDecision: initial.approvalType ? "AUTO_APPROVED" : "HUMAN_APPROVAL_REQUIRED",
        policyReason: initial.policyReason,
        contracts: updatedContracts.map((c) => ({
          id: c.id,
          goal: c.goal,
          status: c.status,
          approvalState: c.approvalState,
        })),
      },
    },
    approvalType,
    lockedAt: now,
  };
}
