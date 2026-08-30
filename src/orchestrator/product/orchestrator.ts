import path from "node:path";
import { fileURLToPath } from "node:url";

import { BootstrapOrchestrator } from "../bootstrap/orchestrator";
import { createDraftContract, lockContract } from "../contract/schema";
import { planWork } from "../agents/planner/planner";
import { loadProjectGovernance } from "../policy/project-policy";
import { PASS_DEMO_GOAL } from "../scenarios/pass";
import { detectSensitiveIntent } from "@/lib/sensitive-intent";
import { resolveWorkspacePathAsync } from "../workspace/git-workspace";
import {
  isDemoGoal,
  resolveWorkerExecutionMode,
  selectWorker,
  type WorkerExecutionMode,
} from "../worker/worker-selection";
import { createRuntimeRunStore } from "../persistence/store-factory";
import type { RuntimeRunStore } from "../persistence/store-factory";

export type ProductRunRequest = {
  goal: string;
  taskId: string;
  contractId: string;
  workspace?: string;
  allowDirtyWorkspace?: boolean;
  executionMode?: WorkerExecutionMode;
  sourceCommitSha?: string;
  runSandboxId?: string;
};

export class ProductOrchestrator {
  private readonly workspaceRoot: string;
  private readonly store: RuntimeRunStore;

  constructor(workspaceRoot: string, store?: RuntimeRunStore) {
    this.workspaceRoot = workspaceRoot;
    this.store = store ?? createRuntimeRunStore(workspaceRoot);
  }

  async execute(request: ProductRunRequest) {
    const normalizedGoal = request.goal.trim();
    const workspaceName = request.workspace ?? "buildloop-demo";
    const mode = resolveWorkerExecutionMode(normalizedGoal, request.executionMode, workspaceName);
    const workerSelection = selectWorker({ mode, goal: normalizedGoal });

    const bootstrap = new BootstrapOrchestrator({
      workspaceRoot: this.workspaceRoot,
      workspaceName,
      allowDirtyWorkspace: request.allowDirtyWorkspace ?? false,
      worker: workerSelection.worker,
      store: this.store,
      ...(request.sourceCommitSha ? { sourceCommitSha: request.sourceCommitSha } : {}),
      ...(request.runSandboxId ? { runSandboxId: request.runSandboxId } : {}),
    });

    let result;
    const workPlan = planWork({ goal: normalizedGoal, taskId: request.taskId });
    if (isDemoGoal(normalizedGoal) && mode === "demo") {
      result = await bootstrap.runPassDemo();
    } else if (detectSensitiveIntent(normalizedGoal).length > 0) {
      result = await bootstrap.runBlockedDemoForGoal(normalizedGoal);
    } else {
      const primary = workPlan.contracts[0]!;
      const contract = lockContract(
        createDraftContract({
          id: request.contractId,
          taskId: request.taskId,
          version: 1,
          goal: normalizedGoal,
          objective: workPlan.plannerSummary,
          inScope: primary.expectedScope,
          outOfScope: [
            "Deployment dan infrastruktur",
            "Credential dan secret",
            "Dependency dan lockfile",
            "Database dan migration",
          ],
          acceptanceCriteria: primary.acceptanceCriteria,
          allowedPaths: primary.expectedScope,
          maximumCorrections: (await loadProjectGovernance(this.workspaceRoot)).execution.max_corrections,
        }),
      );
      result = await bootstrap.executeContractRun(contract);
    }

    const stored = {
      ...result,
      storedAt: new Date().toISOString(),
      taskGoal: normalizedGoal,
      workspace: await resolveWorkspacePathAsync(workspaceName, this.workspaceRoot),
      workerMode: mode,
      workerId: workerSelection.workerId,
      plannerSummary: workPlan.plannerSummary,
    };
    await this.store.saveRun(stored);
    return stored;
  }

  getStore() {
    return this.store;
  }
}

export function getWorkspaceRoot(): string {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

export { isDemoGoal, resolveWorkerExecutionMode, selectWorker };
