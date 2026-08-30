import { MAX_ATTEMPTS } from "@/lib/task-contract";
import { deriveTaskContractFields, isAmbiguousGoal } from "@/orchestrator/contract/derive-task-contract";
import { discoverCandidatePaths } from "@/orchestrator/contract/discover-candidate-paths";
import { classifyRisk } from "@/orchestrator/policy/evaluator";
import {
  MAX_CONTRACTS_PER_GOAL,
  type PlannerInput,
  type PlannerOutput,
  type WorkContract,
  type WorkPlan,
} from "./types";

const AUTH_DECOMPOSITION: Array<{ suffix: string; goal: string; criteria: string[] }> = [
  {
    suffix: "01",
    goal: "Sign up flow",
    criteria: ["Sign up form validates input", "New user can register", "Sign up test passes"],
  },
  {
    suffix: "02",
    goal: "Sign in flow",
    criteria: ["Sign in form validates credentials", "Authenticated session established", "Sign in test passes"],
  },
  {
    suffix: "03",
    goal: "Forgot password flow",
    criteria: ["Password reset request handled", "Reset flow does not enumerate accounts", "Reset test passes"],
  },
  {
    suffix: "04",
    goal: "Authentication integration verification",
    criteria: ["Auth flows integrate correctly", "Relevant auth tests pass", "No protected paths changed"],
  },
];

function isAuthGoal(goal: string): boolean {
  const g = goal.toLowerCase();
  return (
    /\bauth(entication)?\b/.test(g) &&
    (/\bsign[- ]?up\b/.test(g) || /\bsign[- ]?in\b/.test(g) || /\bforgot password\b/.test(g))
  );
}

function extractExplicitScopeFromGoal(goal: string): boolean {
  return deriveTaskContractFields({ goal }).expectedScope.length > 0;
}

function shouldDiscoverRepositoryCandidates(goal: string): boolean {
  if (extractExplicitScopeFromGoal(goal) || isAmbiguousGoal(goal)) {
    return false;
  }
  const normalized = goal.toLowerCase();
  return (
    isAuthGoal(goal) ||
    /\b(forgot password|password reset|reset password|sign[- ]?in|sign[- ]?up|authentication)\b/.test(
      normalized,
    )
  );
}

function isSimpleBoundedTask(goal: string): boolean {
  const g = goal.toLowerCase();
  if (goal.length < 80) return true;
  if (/\b(dan|and|,)\b/.test(g) && g.split(/\b(dan|and|,)\b/).filter((s) => s.trim().length > 10).length >= 3) {
    return false;
  }
  return !/\bauth(entication)?\b/.test(g) || !/\bsign[- ]?up\b/.test(g);
}

function buildSingleContract(
  goal: string,
  taskId: string,
  acceptanceCriteria?: string[],
  repositoryCandidates?: string[],
): WorkContract {
  const risk = classifyRisk(goal);
  const derived = deriveTaskContractFields({
    goal,
    ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
    ...(repositoryCandidates?.length ? { repositoryCandidates } : {}),
  });
  return {
    id: `${taskId.slice(0, 8).toUpperCase()}-01`,
    goal: goal.trim(),
    acceptanceCriteria: derived.acceptanceCriteria,
    expectedScope: derived.expectedScope,
    dependencies: [],
    riskClassification: risk,
    approvalState: "pending",
    status: derived.needsClarification ? ("blocked" as const) : ("pending" as const),
  };
}

function buildAuthContracts(goal: string, taskId: string, repositoryCandidates?: string[]): WorkContract[] {
  const prefix = "AUTH";
  return AUTH_DECOMPOSITION.map((item, index) => {
    const derived = deriveTaskContractFields({
      goal: `${item.goal} ${goal}`,
      acceptanceCriteria: item.criteria,
      ...(repositoryCandidates?.length ? { repositoryCandidates } : {}),
    });
    return {
      id: `${prefix}-${item.suffix}`,
      goal: `${prefix}-${item.suffix} ${item.goal}`,
      acceptanceCriteria: item.criteria,
      expectedScope: derived.expectedScope,
      dependencies: index > 0 ? [`${prefix}-${AUTH_DECOMPOSITION[index - 1]!.suffix}`] : [],
      riskClassification: "security" as const,
      approvalState: "pending" as const,
      status:
        derived.needsClarification || derived.expectedScope.length === 0
          ? ("blocked" as const)
          : ("pending" as const),
    };
  }).slice(0, MAX_CONTRACTS_PER_GOAL);
}

function decomposeByClauses(goal: string, taskId: string): WorkContract[] | null {
  const clauses = goal
    .split(/[,;]|\band\b|\bdan\b/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  if (clauses.length < 2 || clauses.length > MAX_CONTRACTS_PER_GOAL) {
    return null;
  }

  const prefix = taskId.slice(0, 4).toUpperCase();
  return clauses.map((clause, index) => {
    const derived = deriveTaskContractFields({ goal: clause });
    return {
      id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
      goal: clause.charAt(0).toUpperCase() + clause.slice(1),
      acceptanceCriteria: derived.acceptanceCriteria,
      expectedScope: derived.expectedScope.length > 0 ? derived.expectedScope : [],
      dependencies: index > 0 ? [`${prefix}-${String(index).padStart(2, "0")}`] : [],
      riskClassification: classifyRisk(clause),
      approvalState: "pending" as const,
      status:
        derived.needsClarification || derived.expectedScope.length === 0
          ? ("blocked" as const)
          : ("pending" as const),
    };
  });
}

/** Deterministic planner — decomposes large goals, keeps simple tasks as single contract. */
export async function planWork(input: PlannerInput): Promise<PlannerOutput> {
  const goal = input.goal.trim();
  const maxContracts = input.maxContracts ?? MAX_CONTRACTS_PER_GOAL;
  const repositoryCandidates =
    input.workspaceRoot && shouldDiscoverRepositoryCandidates(goal)
      ? (await discoverCandidatePaths(goal, input.workspaceRoot)).candidates
      : undefined;

  if (isAuthGoal(goal)) {
    const contracts = buildAuthContracts(goal, input.taskId, repositoryCandidates);
    return {
      userGoal: goal,
      contracts: contracts.slice(0, maxContracts),
      decomposed: contracts.length > 1,
      plannerSummary: `Decomposed authentication goal into ${contracts.length} bounded contracts.`,
    };
  }

  if (isSimpleBoundedTask(goal)) {
    const contract = buildSingleContract(
      goal,
      input.taskId,
      input.acceptanceCriteria,
      repositoryCandidates,
    );
    return {
      userGoal: goal,
      contracts: [contract],
      decomposed: false,
      plannerSummary: "Simple bounded task — single contract.",
    };
  }

  const decomposed = decomposeByClauses(goal, input.taskId);
  if (decomposed && decomposed.length >= 2) {
    return {
      userGoal: goal,
      contracts: decomposed.slice(0, maxContracts),
      decomposed: true,
      plannerSummary: `Decomposed goal into ${Math.min(decomposed.length, maxContracts)} bounded contracts.`,
    };
  }

  const contract = buildSingleContract(
    goal,
    input.taskId,
    input.acceptanceCriteria,
    repositoryCandidates,
  );
  return {
    userGoal: goal,
    contracts: [contract],
    decomposed: false,
    plannerSummary: "Single contract — decomposition not required.",
  };
}

export function workPlanToContractFields(plan: WorkPlan) {
  const primary = plan.contracts[0]!;
  const derived = deriveTaskContractFields({
    goal: plan.userGoal,
    acceptanceCriteria: primary.acceptanceCriteria,
  });
  return {
    goal: plan.userGoal,
    inScope: primary.expectedScope,
    acceptanceCriteria: primary.acceptanceCriteria,
    requiredChecks: derived.requiredChecks,
    maxAttempts: MAX_ATTEMPTS,
    workPlan: plan,
  };
}
