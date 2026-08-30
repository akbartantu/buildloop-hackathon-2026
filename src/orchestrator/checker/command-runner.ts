import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import { safeLogSummary } from "@/lib/redaction";
import { isCommandAllowed } from "./project-commands";

export type CommandRunResult = {
  command: string;
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
  success: boolean;
  timedOut: boolean;
  stdoutSummary: string;
  stderrSummary: string;
};

export type CommandRunnerOptions = {
  cwd: string;
  timeoutMs?: number;
  contractAllowlist: string[];
};

const DEFAULT_TIMEOUT_MS = 120_000;

export async function runSafeCommand(
  command: string,
  options: CommandRunnerOptions,
): Promise<CommandRunResult> {
  const startedAt = new Date().toISOString();
  if (!isCommandAllowed(command, options.contractAllowlist)) {
    return {
      command,
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: null,
      success: false,
      timedOut: false,
      stdoutSummary: "",
      stderrSummary: safeLogSummary("Command blocked by BuildLoop safety policy."),
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cwd = path.resolve(options.cwd);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child: ChildProcess = spawn(command, {
      cwd,
      shell: true,
      env: {
        ...process.env,
        CI: "1",
        NODE_ENV: process.env["NODE_ENV"] ?? "test",
      },
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      resolve({
        command,
        startedAt,
        finishedAt: new Date().toISOString(),
        exitCode: code,
        success: !timedOut && code === 0,
        timedOut,
        stdoutSummary: safeLogSummary(stdout, 800),
        stderrSummary: safeLogSummary(stderr, 800),
      });
    });

    child.on("error", (error: Error) => {
      clearTimeout(timer);
      resolve({
        command,
        startedAt,
        finishedAt: new Date().toISOString(),
        exitCode: null,
        success: false,
        timedOut,
        stdoutSummary: safeLogSummary(stdout, 800),
        stderrSummary: safeLogSummary(error.message, 800),
      });
    });
  });
}
