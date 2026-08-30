/**
 * Google ADK orchestration entrypoint.
 * BuildLoop orchestrator retains lifecycle authority; official @google/adk hosts Gemini execution.
 */
import { BootstrapOrchestrator } from "../bootstrap/orchestrator";
import type { BootstrapRunResult } from "../bootstrap/orchestrator";
import { AdkGeminiWorker } from "./gemini-agent";
import { getBuildLoopAdkRunner } from "./runner";
import { selectWorker } from "../worker/worker-selection";

export type AdkOrchestratorMode = "official-adk";

export class AdkOrchestratorShell {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  get mode(): AdkOrchestratorMode {
    return "official-adk";
  }

  async runPassDemo(): Promise<BootstrapRunResult> {
    const bootstrap = new BootstrapOrchestrator({
      workspaceRoot: this.workspaceRoot,
      worker: selectWorker({ mode: "demo", goal: "demo" }).worker,
    });
    return bootstrap.runPassDemo();
  }

  createRealWorker(): AdkGeminiWorker {
    return new AdkGeminiWorker(getBuildLoopAdkRunner());
  }
}
