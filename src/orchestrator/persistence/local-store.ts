import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BootstrapRunResult } from "../bootstrap/orchestrator";
import type { CheckerEvidence } from "../types";

export type StoredRun = BootstrapRunResult & {
  storedAt: string;
  taskGoal: string;
  workspace?: string;
  workerMode?: string;
  workerId?: string;
  plannerSummary?: string;
};

export class LocalRunStore {
  constructor(private readonly root: string) {}

  private runPath(runId: string): string {
    return path.join(this.root, ".buildloop", "runs", `${runId}.json`);
  }

  async save(run: StoredRun): Promise<void> {
    const filePath = this.runPath(run.run.id);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(run, null, 2), "utf8");
  }

  async get(runId: string): Promise<StoredRun | null> {
    try {
      const raw = await readFile(this.runPath(runId), "utf8");
      return JSON.parse(raw) as StoredRun;
    } catch {
      return null;
    }
  }

  async latestForGoal(goal: string): Promise<StoredRun | null> {
    // Lightweight lookup for demo wiring; Firestore adapter replaces this later.
    const { readdir } = await import("node:fs/promises");
    const dir = path.join(this.root, ".buildloop", "runs");
    try {
      const files = await readdir(dir);
      let latest: StoredRun | null = null;
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const raw = await readFile(path.join(dir, file), "utf8");
        const parsed = JSON.parse(raw) as StoredRun;
        if (parsed.taskGoal !== goal) continue;
        if (!latest || parsed.storedAt > latest.storedAt) latest = parsed;
      }
      return latest;
    } catch {
      return null;
    }
  }
}

export function summarizeEvidence(evidence: CheckerEvidence[]) {
  return evidence.map((item) => ({
    category: item.category,
    name: item.name,
    status: item.status,
    summary: item.summary,
    attemptNumber: item.attemptNumber,
  }));
}
