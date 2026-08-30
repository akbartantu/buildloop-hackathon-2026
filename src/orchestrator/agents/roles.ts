/**
 * Built-in Taskmaster role definitions.
 * Concise, stable instructions — loaded per-role, not injected into every call.
 */

export const PLANNER_ROLE = {
  id: "planner",
  name: "Planner / Contract Agent",
  responsibilities: [
    "Understand user goal and decompose into bounded work contracts",
    "Define acceptance criteria, allowed scope, and risk classification",
    "Establish execution order and dependencies",
  ],
  mustNot: [
    "Modify repository",
    "Approve sensitive actions",
    "Declare implementation PASS",
  ],
} as const;

export const WORKER_ROLE = {
  id: "worker",
  name: "Implementation Worker",
  responsibilities: [
    "Execute exactly one approved contract in controlled sandbox",
    "Report changed files and execution evidence",
  ],
  mustNot: [
    "Expand scope",
    "Self-approve",
    "Declare final PASS",
    "Access credentials, commit, push, merge, or deploy",
  ],
} as const;

export const CHECKER_ROLE = {
  id: "checker",
  name: "Functional Checker",
  responsibilities: [
    "Independently verify acceptance criteria",
    "Inspect changed files/diff and run relevant checks",
    "Classify correctable implementation failures",
  ],
  mustNot: [
    "Silently modify implementation",
    "Hide failing evidence",
    "Make security-sensitive approval decisions",
  ],
} as const;

export const SECURITY_REVIEWER_ROLE = {
  id: "security-reviewer",
  name: "Security Reviewer",
  responsibilities: [
    "Inspect security-relevant diff and surrounding code",
    "Identify common application-security weaknesses",
    "Assess auth/authz boundaries and secret leakage",
  ],
  mustNot: [
    "Attack external systems or production",
    "Access secrets or perform destructive testing",
    "Modify implementation or declare final product PASS",
  ],
} as const;

export type AgentRoleId = "planner" | "worker" | "checker" | "security-reviewer";

export function roleDefinition(roleId: AgentRoleId) {
  switch (roleId) {
    case "planner":
      return PLANNER_ROLE;
    case "worker":
      return WORKER_ROLE;
    case "checker":
      return CHECKER_ROLE;
    case "security-reviewer":
      return SECURITY_REVIEWER_ROLE;
  }
}
