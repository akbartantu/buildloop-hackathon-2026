import { DemoPassWorker } from "./demo-worker";
import { AdkGeminiWorker } from "../adk/gemini-agent";
import { isPublicGitHubRepoUrl } from "@/lib/repository/public-github-url";
import type { CodingWorker } from "./types";

export type WorkerExecutionMode = "demo" | "real";

export type WorkerSelectionInput = {
  mode: WorkerExecutionMode;
  goal: string;
  explicitWorker?: CodingWorker;
};

export type WorkerSelectionResult = {
  worker: CodingWorker;
  mode: WorkerExecutionMode;
  workerId: string;
};

export function isDemoGoal(goal: string): boolean {
  const lower = goal.trim().toLowerCase();
  return (
    lower.includes("sandbox") &&
    lower.includes("approval") &&
    (lower.includes("workspace") || lower.includes("penjelasan"))
  );
}

export function resolveWorkerExecutionMode(
  goal: string,
  forceMode?: WorkerExecutionMode,
  workspace?: string,
): WorkerExecutionMode {
  if (forceMode) return forceMode;
  if (workspace && isPublicGitHubRepoUrl(workspace)) return "real";
  return isDemoGoal(goal) ? "demo" : "real";
}

export function selectWorker(input: WorkerSelectionInput): WorkerSelectionResult {
  if (input.explicitWorker) {
    return {
      worker: input.explicitWorker,
      mode: input.mode,
      workerId: input.explicitWorker.id,
    };
  }

  if (input.mode === "demo") {
    const worker = new DemoPassWorker();
    return { worker, mode: "demo", workerId: worker.id };
  }

  const worker = new AdkGeminiWorker();
  return { worker, mode: "real", workerId: worker.id };
}

export function realWorkerUnavailableMessage(workerId: string): string {
  if (workerId === "adk-gemini-worker") {
    return "Real AI worker belum dapat dijalankan karena konfigurasi Gemini belum tersedia.";
  }
  return "Real AI worker tidak tersedia.";
}
