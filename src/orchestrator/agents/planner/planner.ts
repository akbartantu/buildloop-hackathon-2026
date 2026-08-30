import { MAX_ATTEMPTS } from "@/lib/task-contract";
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

function isSimpleBoundedTask(goal: string): boolean {
  const g = goal.toLowerCase();
  if (goal.length < 80) return true;
  if (/\b(dan|and|,)\b/.test(g) && g.split(/\b(dan|and|,)\b/).filter((s) => s.trim().length > 10).length >= 3) {
    return false;
  }
  return !/\bauth(entication)?\b/.test(g) || !/\bsign[- ]?up\b/.test(g);
}

function buildSingleContract(goal: string, taskId: string): WorkContract {
  const risk = classifyRisk(goal);
  return {
    id: `${taskId.slice(0, 8).toUpperCase()}-01`,
    goal: goal.trim(),
    acceptanceCriteria: [
      "Perilaku yang diminta diimplementasikan.",
      "Check yang relevan lolos.",
      "Tidak ada protected path yang berubah.",
    ],
    expectedScope: ["src/**", "docs/**"],
    dependencies: [],
    riskClassification: risk,
    approvalState: "pending",
    status: "pending",
  };
}

function buildAuthContracts(goal: string, taskId: string): WorkContract[] {
  const prefix = "AUTH";
  return AUTH_DECOMPOSITION.map((item, index) => ({
    id: `${prefix}-${item.suffix}`,
    goal: `${prefix}-${item.suffix} ${item.goal}`,
    acceptanceCriteria: item.criteria,
    expectedScope: ["src/**"],
    dependencies: index > 0 ? [`${prefix}-${AUTH_DECOMPOSITION[index - 1]!.suffix}`] : [],
    riskClassification: "security" as const,
    approvalState: "pending" as const,
    status: "pending" as const,
  })).slice(0, MAX_CONTRACTS_PER_GOAL);
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
  return clauses.map((clause, index) => ({
    id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
    goal: clause.charAt(0).toUpperCase() + clause.slice(1),
    acceptanceCriteria: [
      `${clause} implemented.`,
      "Relevant checks pass.",
      "No protected paths changed.",
    ],
    expectedScope: ["src/**"],
    dependencies: index > 0 ? [`${prefix}-${String(index).padStart(2, "0")}`] : [],
    riskClassification: classifyRisk(clause),
    approvalState: "pending" as const,
    status: "pending" as const,
  }));
}

/** Deterministic planner — decomposes large goals, keeps simple tasks as single contract. */
export function planWork(input: PlannerInput): PlannerOutput {
  const goal = input.goal.trim();
  const maxContracts = input.maxContracts ?? MAX_CONTRACTS_PER_GOAL;

  if (isAuthGoal(goal)) {
    const contracts = buildAuthContracts(goal, input.taskId);
    return {
      userGoal: goal,
      contracts: contracts.slice(0, maxContracts),
      decomposed: contracts.length > 1,
      plannerSummary: `Decomposed authentication goal into ${contracts.length} bounded contracts.`,
    };
  }

  if (isSimpleBoundedTask(goal)) {
    const contract = buildSingleContract(goal, input.taskId);
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

  const contract = buildSingleContract(goal, input.taskId);
  return {
    userGoal: goal,
    contracts: [contract],
    decomposed: false,
    plannerSummary: "Single contract — decomposition not required.",
  };
}

export function workPlanToContractFields(plan: WorkPlan) {
  const primary = plan.contracts[0]!;
  return {
    goal: plan.userGoal,
    inScope: primary.expectedScope,
    acceptanceCriteria: primary.acceptanceCriteria,
    maxAttempts: MAX_ATTEMPTS,
    workPlan: plan,
  };
}
