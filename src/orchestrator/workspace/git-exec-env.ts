import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export const GIT_HOME_DIR = path.join(os.tmpdir(), "buildloop-git-home");
export const GIT_REMOTE_TIMEOUT_MS = 60_000;

let gitHomeReady: Promise<void> | null = null;

export async function ensureGitRuntimeReady(): Promise<void> {
  if (!gitHomeReady) {
    gitHomeReady = mkdir(GIT_HOME_DIR, { recursive: true }).then(() => undefined);
  }
  await gitHomeReady;
}

export function buildGitExecOptions(maxBuffer: number): {
  maxBuffer: number;
  timeout: number;
  env: NodeJS.ProcessEnv;
} {
  return {
    maxBuffer,
    timeout: GIT_REMOTE_TIMEOUT_MS,
    env: {
      ...process.env,
      HOME: GIT_HOME_DIR,
      GIT_TERMINAL_PROMPT: "0",
    },
  };
}
