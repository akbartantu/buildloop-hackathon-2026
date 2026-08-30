import { execFile } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitBaseline = {
  repoPath: string;
  branch: string;
  headSha: string;
  dirty: boolean;
  worktreePath?: string;
};

export type GitDiffSummary = {
  baselineSha: string;
  changedFiles: string[];
  addedFiles: string[];
  deletedFiles: string[];
  modifiedFiles: string[];
};

const DEPENDENCY_MANIFESTS = new Set([
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "Pipfile.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
]);

export async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function isGitRepository(repoPath: string): Promise<boolean> {
  try {
    await runGit(repoPath, ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

export async function captureGitBaseline(repoPath: string): Promise<GitBaseline | null> {
  const resolved = path.resolve(repoPath);
  if (!(await pathExists(resolved))) {
    return null;
  }
  if (!(await isGitRepository(resolved))) {
    return null;
  }

  try {
    const branch = await runGit(resolved, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const headSha = await runGit(resolved, ["rev-parse", "HEAD"]);
    const status = await runGit(resolved, ["status", "--porcelain"]);

    return {
      repoPath: resolved,
      branch,
      headSha,
      dirty: status.length > 0,
    };
  } catch {
    return null;
  }
}

export async function createIsolatedWorktree(
  repoPath: string,
  worktreePath: string,
  runId: string,
): Promise<string> {
  await rm(worktreePath, { recursive: true, force: true });
  await mkdir(path.dirname(worktreePath), { recursive: true });
  const branchName = `buildloop/run-${runId.slice(0, 8)}`;
  await runGit(repoPath, ["worktree", "add", "-B", branchName, worktreePath, "HEAD"]);
  await linkWorktreeDependencies(repoPath, worktreePath);
  return worktreePath;
}

/** Symlink node_modules from main repo into worktree so typecheck/test can run. */
export async function linkWorktreeDependencies(repoPath: string, worktreePath: string): Promise<void> {
  const sourceModules = path.join(repoPath, "node_modules");
  const targetModules = path.join(worktreePath, "node_modules");
  if (!(await pathExists(sourceModules)) || (await pathExists(targetModules))) {
    return;
  }
  try {
    await symlink(sourceModules, targetModules, "junction");
  } catch {
    // Non-fatal — checker may skip or fail commands if dependencies unavailable.
  }
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  try {
    await runGit(repoPath, ["worktree", "remove", "--force", worktreePath]);
  } catch {
    await rm(worktreePath, { recursive: true, force: true });
  }
}

export async function summarizeGitDiff(
  repoPath: string,
  baselineSha: string,
  worktreePath: string,
): Promise<GitDiffSummary> {
  const raw = await runGit(worktreePath, ["diff", "--name-status", baselineSha]);
  const changedFiles: string[] = [];
  const addedFiles: string[] = [];
  const deletedFiles: string[] = [];
  const modifiedFiles: string[] = [];

  for (const line of raw.split("\n").filter(Boolean)) {
    const [status, ...rest] = line.split("\t");
    const file = rest.join("\t").replace(/\\/g, "/");
    if (!file) continue;
    changedFiles.push(file);
    if (status === "A" || status?.startsWith("A")) addedFiles.push(file);
    else if (status === "D" || status?.startsWith("D")) deletedFiles.push(file);
    else modifiedFiles.push(file);
  }

  return {
    baselineSha,
    changedFiles,
    addedFiles,
    deletedFiles,
    modifiedFiles,
  };
}

export function isDependencyManifest(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const base = path.basename(normalized);
  return DEPENDENCY_MANIFESTS.has(base);
}

export function resolveWorkspacePath(workspace: string, defaultRoot: string): string {
  if (path.isAbsolute(workspace) && workspace.length > 1) {
    return path.resolve(workspace);
  }
  if (workspace === "buildloop-demo" || workspace === ".") {
    return defaultRoot;
  }
  const candidate = path.resolve(defaultRoot, workspace);
  return candidate;
}
