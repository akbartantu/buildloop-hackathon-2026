import { z } from "zod";
import { MAX_ATTEMPTS, PROTECTED_PATHS } from "@/lib/task-contract";

export const contractObjectiveSchema = z.object({
  goal: z.string().trim().min(10),
  objective: z.string().trim().min(10),
});

export const contractScopeSchema = z.object({
  inScope: z.array(z.string().min(1)).min(1),
  outOfScope: z.array(z.string().min(1)).min(1),
  allowedCommands: z.array(z.string().min(1)).default([]),
  allowedPaths: z.array(z.string().min(1)).default([]),
});

export const contractSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  version: z.number().int().positive(),
  objective: z.string().min(10),
  goal: z.string().min(10),
  inScope: z.array(z.string().min(1)),
  outOfScope: z.array(z.string().min(1)),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  protectedAreas: z.array(z.string().min(1)).min(1),
  allowedCommands: z.array(z.string()),
  allowedPaths: z.array(z.string()),
  maximumCorrections: z.number().int().min(0).max(10).default(MAX_ATTEMPTS),
  lockedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type Contract = z.infer<typeof contractSchema>;

export type LockedContract = Contract & { lockedAt: string };

export function isLockedContract(contract: Contract): contract is LockedContract {
  return contract.lockedAt !== null;
}

export function createDraftContract(input: {
  id: string;
  taskId: string;
  version: number;
  goal: string;
  objective?: string;
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  allowedCommands?: string[];
  allowedPaths?: string[];
  maximumCorrections?: number;
}): Contract {
  const now = new Date().toISOString();
  return contractSchema.parse({
    id: input.id,
    taskId: input.taskId,
    version: input.version,
    goal: input.goal.trim(),
    objective: (input.objective ?? input.goal).trim(),
    inScope: input.inScope,
    outOfScope: input.outOfScope,
    acceptanceCriteria: input.acceptanceCriteria,
    protectedAreas: [...PROTECTED_PATHS],
    allowedCommands: input.allowedCommands ?? ["bun run typecheck", "bun test", "bun run lint"],
    allowedPaths: input.allowedPaths ?? ["src/**", "docs/**"],
    maximumCorrections: input.maximumCorrections ?? MAX_ATTEMPTS,
    lockedAt: null,
    createdAt: now,
  });
}

export function lockContract(contract: Contract): LockedContract {
  if (contract.lockedAt) {
    throw new Error("Contract is already locked.");
  }
  return { ...contract, lockedAt: new Date().toISOString() };
}

export function reviseContract(contract: LockedContract, changes: Partial<Pick<Contract, "goal" | "objective" | "acceptanceCriteria" | "inScope" | "outOfScope">>): Contract {
  return createDraftContract({
    id: crypto.randomUUID(),
    taskId: contract.taskId,
    version: contract.version + 1,
    goal: changes.goal ?? contract.goal,
    objective: changes.objective ?? contract.objective,
    inScope: changes.inScope ?? contract.inScope,
    outOfScope: changes.outOfScope ?? contract.outOfScope,
    acceptanceCriteria: changes.acceptanceCriteria ?? contract.acceptanceCriteria,
    allowedCommands: contract.allowedCommands,
    allowedPaths: contract.allowedPaths,
    maximumCorrections: contract.maximumCorrections,
  });
}
