import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { LocalRunStore } from "./local-store";
import { FirestoreRunStore } from "./firestore-store";
import type { StoredRun } from "./local-store";
import type { DecisionLogEntry } from "../types";

export type RunCheckpoint = {
  runId: string;
  taskId: string;
  status: string;
  attemptNumber: number;
  phase: string;
  evidenceCount: number;
  workerCalls: number;
  checkerCalls: number;
  correctionCount: number;
  updatedAt: string;
  payload?: Record<string, unknown>;
};

export class CheckpointStore {
  constructor(private readonly root: string) {}

  private checkpointPath(runId: string): string {
    return path.join(this.root, ".buildloop", "checkpoints", `${runId}.json`);
  }

  async save(checkpoint: RunCheckpoint): Promise<void> {
    const filePath = this.checkpointPath(checkpoint.runId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(checkpoint, null, 2), "utf8");
  }

  async get(runId: string): Promise<RunCheckpoint | null> {
    try {
      const raw = await readFile(this.checkpointPath(runId), "utf8");
      return JSON.parse(raw) as RunCheckpoint;
    } catch {
      return null;
    }
  }
}

export type RuntimeRunStore = {
  saveRun(run: StoredRun): Promise<void>;
  getRun(runId: string): Promise<StoredRun | null>;
  appendDecision?(runId: string, entry: DecisionLogEntry): Promise<void>;
};

export type PersistenceMode = "local" | "firestore";

export function resolvePersistenceMode(): PersistenceMode {
  const mode = process.env["BUILDLOOP_PERSISTENCE"] ?? "local";
  return mode === "firestore" ? "firestore" : "local";
}

export function createRuntimeRunStore(root: string): RuntimeRunStore {
  if (resolvePersistenceMode() === "firestore") {
    return new FirestoreRunStore(root);
  }
  const local = new LocalRunStore(root);
  return {
    saveRun: (run) => local.save(run),
    getRun: (runId) => local.get(runId),
  };
}

export function createRuntimeRunStoreForMode(root: string, mode: PersistenceMode): RuntimeRunStore {
  if (mode === "firestore") {
    return new FirestoreRunStore(root);
  }
  const local = new LocalRunStore(root);
  return {
    saveRun: (run) => local.save(run),
    getRun: (runId) => local.get(runId),
  };
}
