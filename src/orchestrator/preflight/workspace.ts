import path from "node:path";

import type { CheckerEvidence } from "../types";
import type { LockedContract } from "../contract/schema";
import { isPublicGitHubRepoUrl } from "@/lib/repository/public-github-url";
import { getSandboxRoot } from "../workspace/sandbox-root";
import {
  captureGitBaseline,
  pathExists,
  resolveWorkspacePathAsync,
  type GitBaseline,
  type PublicGitHubCloneOptions,
} from "../workspace/git-workspace";

export type WorkspacePreflightResult = {
  safe: boolean;
  baseline: GitBaseline | null;
  blockedReasons: Array<{ rule: string; explanation: string }>;
  evidence: CheckerEvidence[];
};

export async function runWorkspacePreflight(input: {
  runId: string;
  contract: LockedContract;
  workspaceRoot: string;
  workspaceName: string;
  allowDirty?: boolean;
  cloneOptions?: PublicGitHubCloneOptions;
}): Promise<WorkspacePreflightResult> {
  const repoPath = await resolveWorkspacePathAsync(
    input.workspaceName,
    input.workspaceRoot,
    input.cloneOptions ?? {},
  );
  const now = new Date().toISOString();
  const evidence: CheckerEvidence[] = [];
  const blockedReasons: Array<{ rule: string; explanation: string }> = [];

  if (!(await pathExists(repoPath))) {
    blockedReasons.push({
      rule: "workspace_path_missing",
      explanation: `Path workspace tidak ditemukan: ${repoPath}`,
    });
  }

  const baseline = await captureGitBaseline(repoPath);
  if (baseline) {
    evidence.push({
      id: crypto.randomUUID(),
      runId: input.runId,
      attemptNumber: 0,
      category: "preflight",
      name: "git_baseline",
      status: "pass",
      summary: `Baseline Git: ${baseline.branch} @ ${baseline.headSha.slice(0, 8)}`,
      details: JSON.stringify({
        branch: baseline.branch,
        headSha: baseline.headSha,
        dirty: baseline.dirty,
      }),
      affectedFiles: [],
      severity: "info",
      createdAt: now,
    });

    if (baseline.dirty && !input.allowDirty) {
      blockedReasons.push({
        rule: "dirty_working_tree",
        explanation:
          "Working tree repository tidak bersih. BuildLoop tidak akan menimpa perubahan existing tanpa acknowledgement eksplisit.",
      });
      evidence.push({
        id: crypto.randomUUID(),
        runId: input.runId,
        attemptNumber: 0,
        category: "preflight",
        name: "dirty_working_tree",
        status: "blocked",
        summary: "Working tree tidak bersih.",
        details: `repo=${baseline.repoPath}`,
        affectedFiles: [],
        severity: "critical",
        createdAt: now,
      });
    }
  } else if (await pathExists(repoPath)) {
    evidence.push({
      id: crypto.randomUUID(),
      runId: input.runId,
      attemptNumber: 0,
      category: "preflight",
      name: "non_git_workspace",
      status: "skipped",
      summary: "Workspace bukan Git repository — menggunakan sandbox manifest.",
      details: path.relative(input.workspaceRoot, repoPath) || repoPath,
      affectedFiles: [],
      severity: "info",
      createdAt: now,
    });
  }

  return {
    safe: blockedReasons.length === 0,
    baseline,
    blockedReasons,
    evidence,
  };
}

export function defaultWorktreePath(
  workspaceRoot: string,
  runId: string,
  workspaceName?: string,
): string {
  const root =
    workspaceName && isPublicGitHubRepoUrl(workspaceName)
      ? getSandboxRoot(workspaceRoot)
      : workspaceRoot;
  return path.join(root, ".buildloop", "worktrees", runId);
}
