import { PROTECTED_PATHS } from "@/lib/task-contract";

/** BuildLoop mandatory protections — repository policy cannot weaken these. */
export const MANDATORY_PROTECTED_PATHS = [...PROTECTED_PATHS] as const;

export const MANDATORY_HUMAN_APPROVAL_ACTIONS = [
  "credential_access",
  "git_push",
  "merge",
  "deploy",
] as const;

export type HumanApprovalAction = (typeof MANDATORY_HUMAN_APPROVAL_ACTIONS)[number];

export const DEFAULT_MAX_CORRECTIONS = 2;

export const DEFAULT_POLICY = {
  version: 1 as const,
  execution: {
    max_corrections: DEFAULT_MAX_CORRECTIONS,
    auto_approve_low_risk: true,
  },
  protected_paths: [...MANDATORY_PROTECTED_PATHS],
  require_human_approval: [
    "dependency_change",
    "database_migration",
    "credential_access",
    "git_push",
    "merge",
    "deploy",
  ] as const,
  validation: {
    require_tests: true,
    require_typecheck: true,
  },
};
