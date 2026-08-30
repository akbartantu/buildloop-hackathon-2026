import { roleDefinition, type AgentRoleId } from "../agents/roles";
import type { ResolvedProjectPolicy } from "../policy/policy-schema";
import type { LockedContract } from "../contract/schema";
import type { WorkPlan } from "../agents/planner/types";

export type RoleContext = {
  roleId: AgentRoleId;
  roleDefinition: ReturnType<typeof roleDefinition>;
  policyConstraints: string[];
  projectInstructions: string | null;
  payload: Record<string, unknown>;
};

export function assemblePlannerContext(input: {
  goal: string;
  policy: ResolvedProjectPolicy;
  workPlan?: WorkPlan;
}): RoleContext {
  return {
    roleId: "planner",
    roleDefinition: roleDefinition("planner"),
    policyConstraints: [
      `Max contracts: 4`,
      `Auto-approve low risk: ${input.policy.execution.auto_approve_low_risk}`,
    ],
    projectInstructions: input.policy.instructionsSummary,
    payload: {
      userGoal: input.goal,
      ...(input.workPlan ? { workPlan: input.workPlan } : {}),
    },
  };
}

export function assembleWorkerContext(input: {
  contract: LockedContract;
  policy: ResolvedProjectPolicy;
  correctionInstruction?: string;
}): RoleContext {
  return {
    roleId: "worker",
    roleDefinition: roleDefinition("worker"),
    policyConstraints: [
      `Allowed paths: ${input.contract.allowedPaths.join(", ")}`,
      `Protected areas: ${input.contract.protectedAreas.join(", ")}`,
      `Max corrections: ${input.contract.maximumCorrections}`,
    ],
    projectInstructions: input.policy.instructionsSummary,
    payload: {
      contract: {
        goal: input.contract.goal,
        acceptanceCriteria: input.contract.acceptanceCriteria,
        inScope: input.contract.inScope,
        outOfScope: input.contract.outOfScope,
      },
      ...(input.correctionInstruction ? { correctionInstruction: input.correctionInstruction } : {}),
    },
  };
}

export function assembleCheckerContext(input: {
  contract: LockedContract;
  changedFiles: string[];
  evidenceSummary: string;
}): RoleContext {
  return {
    roleId: "checker",
    roleDefinition: roleDefinition("checker"),
    policyConstraints: [],
    projectInstructions: null,
    payload: {
      contract: {
        goal: input.contract.goal,
        acceptanceCriteria: input.contract.acceptanceCriteria,
      },
      changedFiles: input.changedFiles,
      evidenceSummary: input.evidenceSummary,
    },
  };
}

export function assembleSecurityReviewerContext(input: {
  contract: LockedContract;
  changedFiles: string[];
  policy: ResolvedProjectPolicy;
}): RoleContext {
  return {
    roleId: "security-reviewer",
    roleDefinition: roleDefinition("security-reviewer"),
    policyConstraints: input.policy.protected_paths.map((p) => `Protected: ${p}`),
    projectInstructions: input.policy.instructionsSummary,
    payload: {
      contract: { goal: input.contract.goal },
      changedFiles: input.changedFiles,
    },
  };
}
