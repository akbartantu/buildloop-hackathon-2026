import type { WorkerReport } from "../types";
import type { LockedContract } from "../contract/schema";

export type WorkerInput = {
  contract: LockedContract;
  sandboxRoot: string;
  workspaceRoot: string;
  sourceRevision: string;
  attemptNumber: number;
  correctionInstruction?: string;
  priorEvidenceSummary?: string;
};

export interface CodingWorker {
  readonly id: string;
  execute(input: WorkerInput): Promise<WorkerReport>;
}

export function emptyWorkerReport(workerId: string, attemptNumber: number, summary: string): WorkerReport {
  return {
    workerId,
    attemptNumber,
    filesChanged: [],
    commandsRequested: [],
    commandsExecuted: [],
    summary,
    patchSummary: summary,
  };
}
