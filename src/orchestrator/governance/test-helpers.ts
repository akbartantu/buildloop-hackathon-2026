import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { createDraftContract, lockContract, type LockedContract } from "../contract/schema";
import type { CodingWorker, WorkerInput } from "../worker/types";
import type { WorkerReport } from "../types";

export function testContract(overrides?: {
  goal?: string;
  allowedPaths?: string[];
  acceptanceCriteria?: string[];
}): LockedContract {
  return lockContract(
    createDraftContract({
      id: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      version: 1,
      goal: overrides?.goal ?? "Safe bounded task for governance testing in sandbox.",
      inScope: ["src/components/**"],
      outOfScope: ["Deployment", "Credential", "Database migration"],
      acceptanceCriteria: overrides?.acceptanceCriteria ?? [
        "No protected path changed.",
        "Required checks pass.",
      ],
      allowedPaths: overrides?.allowedPaths ?? ["src/components/**"],
    }),
  );
}

export async function createTempSandbox(prefix = "buildloop-gov"): Promise<string> {
  const dir = path.join(tmpdir(), `${prefix}-${crypto.randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanupTempSandbox(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function writeSandboxFile(
  sandboxRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const absolute = path.join(sandboxRoot, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

export function stubWorker(
  id: string,
  handler: (input: WorkerInput) => Promise<WorkerReport> | WorkerReport,
): CodingWorker {
  return {
    id,
    execute: (input) => Promise.resolve(handler(input)),
  };
}

export function crashingWorker(id = "crash-worker"): CodingWorker {
  return {
    id,
    execute: async () => {
      throw new Error("Simulated worker crash");
    },
  };
}
