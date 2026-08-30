import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  isPublicGitHubRepoUrl,
  validatePublicGitHubUrl,
} from "@/lib/repository/public-github-url";
import { getSandboxRoot } from "./sandbox-root";

const execFileAsync = promisify(execFile);

const BLOCKED_GIT_SUBCOMMANDS = new Set(["push"]);

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

export type PublicGitHubCloneOptions = {
  sandboxRoot?: string;
  runId?: string;
  commitSha?: string;
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

export function assertPathWithinRoot(root: string, target: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(rootWithSep)) {
    throw new Error("Path escapes sandbox root.");
  }
}

export async function runGit(cwd: string, args: string[]): Promise<string> {
  const subcommand = args[0];
  if (subcommand && BLOCKED_GIT_SUBCOMMANDS.has(subcommand)) {
    throw new Error("Remote git mutations are not permitted in BuildLoop sandbox execution.");
  }
  if (subcommand === "remote" && args.includes("set-url")) {
    throw new Error("Remote git mutations are not permitted in BuildLoop sandbox execution.");
  }

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

export async function verifyRepositoryHeadSha(repoPath: string, expectedSha: string): Promise<boolean> {
  const baseline = await captureGitBaseline(repoPath);
  return baseline?.headSha === expectedSha;
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

export async function cleanupSandboxDirectory(targetPath: string): Promise<void> {
  await rm(targetPath, { recursive: true, force: true });
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
  if (isPublicGitHubRepoUrl(workspace)) {
    const validated = validatePublicGitHubUrl(workspace);
    if (validated.ok) {
      return publicGitHubCloneCachePath(validated.normalizedUrl, getSandboxRoot(defaultRoot));
    }
  }

  if (path.isAbsolute(workspace) && workspace.length > 1) {
    return path.resolve(workspace);
  }
  if (workspace === "buildloop-demo" || workspace === ".") {
    return defaultRoot;
  }
  const candidate = path.resolve(defaultRoot, workspace);
  return candidate;
}

export function publicGitHubCloneCachePath(normalizedUrl: string, sandboxRoot: string): string {
  const cacheKey = createHash("sha256").update(normalizedUrl).digest("hex").slice(0, 16);
  return path.join(sandboxRoot, "repos", cacheKey);
}

export function publicGitHubRunClonePath(
  normalizedUrl: string,
  sandboxRoot: string,
  runId: string,
): string {
  const cacheKey = createHash("sha256").update(normalizedUrl).digest("hex").slice(0, 16);
  return path.join(sandboxRoot, "runs", runId, cacheKey);
}

export async function ensurePublicGitHubClone(
  repoUrl: string,
  workspaceRoot: string,
  options: PublicGitHubCloneOptions = {},
): Promise<string> {
  const validated = validatePublicGitHubUrl(repoUrl);
  if (!validated.ok) {
    throw new Error(validated.reason);
  }

  const sandboxRoot = options.sandboxRoot ?? getSandboxRoot(workspaceRoot);
  const cloneDir = options.runId
    ? publicGitHubRunClonePath(validated.normalizedUrl, sandboxRoot, options.runId)
    : publicGitHubCloneCachePath(validated.normalizedUrl, sandboxRoot);

  assertPathWithinRoot(sandboxRoot, cloneDir);

  if (options.commitSha) {
    await rm(cloneDir, { recursive: true, force: true });
    await mkdir(path.dirname(cloneDir), { recursive: true });
    await execFileAsync("git", ["clone", "--depth", "1", validated.normalizedUrl, cloneDir], {
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!(await isGitRepository(cloneDir))) {
      throw new Error("Cloned repository is not a valid Git workspace.");
    }

    const headBefore = await runGit(cloneDir, ["rev-parse", "HEAD"]);
    if (headBefore !== options.commitSha) {
      await runGit(cloneDir, ["fetch", "origin", options.commitSha, "--depth", "1"]);
      await runGit(cloneDir, ["checkout", "--force", options.commitSha]);
    }

    const verified = await verifyRepositoryHeadSha(cloneDir, options.commitSha);
    if (!verified) {
      throw new Error("Repository HEAD does not match the captured source commit SHA.");
    }

    return cloneDir;
  }

  if (await isGitRepository(cloneDir)) {
    return cloneDir;
  }

  await rm(cloneDir, { recursive: true, force: true });
  await mkdir(path.dirname(cloneDir), { recursive: true });
  await execFileAsync("git", ["clone", "--depth", "1", validated.normalizedUrl, cloneDir], {
    maxBuffer: 10 * 1024 * 1024,
  });

  if (!(await isGitRepository(cloneDir))) {
    throw new Error("Cloned repository is not a valid Git workspace.");
  }

  return cloneDir;
}

export async function resolveWorkspacePathAsync(
  workspace: string,
  defaultRoot: string,
  options: PublicGitHubCloneOptions = {},
): Promise<string> {
  if (isPublicGitHubRepoUrl(workspace)) {
    return ensurePublicGitHubClone(workspace, defaultRoot, options);
  }

  return resolveWorkspacePath(workspace, defaultRoot);
}

export function createRunSandboxId(taskId?: string): string {
  const suffix = randomUUID().slice(0, 8);
  return taskId ? `${taskId.slice(0, 8)}-${suffix}` : suffix;
}
