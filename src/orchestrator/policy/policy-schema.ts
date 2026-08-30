import { z } from "zod";

import {
  DEFAULT_POLICY,
  MANDATORY_HUMAN_APPROVAL_ACTIONS,
  MANDATORY_PROTECTED_PATHS,
} from "./mandatory-protections";

export const projectPolicySchema = z.object({
  version: z.literal(1).default(1),
  execution: z
    .object({
      max_corrections: z.number().int().min(0).max(10).default(2),
      auto_approve_low_risk: z.boolean().default(true),
    })
    .default({}),
  protected_paths: z.array(z.string().min(1)).default([]),
  require_human_approval: z.array(z.string().min(1)).default([]),
  validation: z
    .object({
      require_tests: z.boolean().default(true),
      require_typecheck: z.boolean().default(true),
    })
    .default({}),
});

export type RawProjectPolicy = z.input<typeof projectPolicySchema>;
export type ProjectPolicy = z.infer<typeof projectPolicySchema>;

export type ResolvedProjectPolicy = ProjectPolicy & {
  protected_paths: string[];
  require_human_approval: string[];
  instructionsSummary: string | null;
  policySource: "defaults" | "repository" | "invalid_fallback";
};

function mergeProtectedPaths(repoPaths: string[]): string[] {
  const merged = new Set<string>(MANDATORY_PROTECTED_PATHS);
  for (const path of repoPaths) {
    merged.add(path);
  }
  return [...merged];
}

function mergeHumanApproval(repoActions: string[]): string[] {
  const merged = new Set<string>([...DEFAULT_POLICY.require_human_approval, ...MANDATORY_HUMAN_APPROVAL_ACTIONS]);
  for (const action of repoActions) {
    merged.add(action);
  }
  return [...merged];
}

/** Parse and merge repository policy with mandatory BuildLoop protections. */
export function resolveProjectPolicy(
  raw: unknown,
  instructionsSummary: string | null = null,
): ResolvedProjectPolicy {
  if (raw === null || raw === undefined) {
    return {
      ...DEFAULT_POLICY,
      protected_paths: mergeProtectedPaths([]),
      require_human_approval: mergeHumanApproval([]),
      instructionsSummary,
      policySource: "defaults",
    };
  }

  const parsed = projectPolicySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ...DEFAULT_POLICY,
      protected_paths: mergeProtectedPaths([]),
      require_human_approval: mergeHumanApproval([]),
      instructionsSummary,
      policySource: "invalid_fallback",
    };
  }

  const policy = parsed.data;
  return {
    ...policy,
    protected_paths: mergeProtectedPaths(policy.protected_paths),
    require_human_approval: mergeHumanApproval(policy.require_human_approval),
    instructionsSummary,
    policySource: "repository",
  };
}

/** Repository policy cannot remove mandatory protected paths. */
export function repositoryPolicyWeakensMandatoryProtections(raw: RawProjectPolicy): boolean {
  const repoPaths = new Set(raw.protected_paths ?? []);
  for (const mandatory of MANDATORY_PROTECTED_PATHS) {
    if (!repoPaths.has(mandatory) && (raw.protected_paths?.length ?? 0) > 0) {
      // User tried to define paths but omitted mandatory — we still merge, not weaken runtime.
      // This detects explicit attempts to override via empty protected_paths only.
    }
  }
  const repoApproval = new Set(raw.require_human_approval ?? []);
  for (const mandatory of MANDATORY_HUMAN_APPROVAL_ACTIONS) {
    if (raw.require_human_approval && !repoApproval.has(mandatory)) {
      // Cannot remove mandatory human approval requirements from effective policy.
      return true;
    }
  }
  return false;
}
