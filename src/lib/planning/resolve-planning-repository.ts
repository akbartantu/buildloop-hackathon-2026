import path from "node:path";

import { isPublicGitHubRepoUrl } from "@/lib/repository/public-github-url";
import {
  ensurePublicGitHubClone,
  pathExists,
  verifyRepositoryHeadSha,
} from "@/orchestrator/workspace/git-workspace";
import { getSandboxRoot } from "@/orchestrator/workspace/sandbox-root";
import { invalidateDiscoverCandidatePathsCache } from "@/orchestrator/contract/discover-candidate-paths";

export type PlanningRepositoryResolution = {
  repositoryRoot: string | null;
  repositoryUrl: string | null;
  sourceCommitSha: string | null;
  provenanceVerified: boolean;
};

const UNVERIFIED: PlanningRepositoryResolution = {
  repositoryRoot: null,
  repositoryUrl: null,
  sourceCommitSha: null,
  provenanceVerified: false,
};

export async function resolvePlanningRepositoryRoot(input: {
  appWorkspaceRoot: string;
  repositoryUrl?: string | null;
  sourceCommitSha?: string | null;
}): Promise<PlanningRepositoryResolution> {
  const repositoryUrl = input.repositoryUrl?.trim() || null;
  const sourceCommitSha = input.sourceCommitSha?.trim() || null;

  if (!repositoryUrl || !sourceCommitSha) {
    return UNVERIFIED;
  }

  if (!isPublicGitHubRepoUrl(repositoryUrl)) {
    return UNVERIFIED;
  }

  try {
    const repositoryRoot = await ensurePublicGitHubClone(repositoryUrl, input.appWorkspaceRoot, {
      sandboxRoot: getSandboxRoot(input.appWorkspaceRoot),
      commitSha: sourceCommitSha,
    });

    const provenanceVerified = await verifyRepositoryHeadSha(repositoryRoot, sourceCommitSha);
    if (!provenanceVerified) {
      return UNVERIFIED;
    }

    invalidateDiscoverCandidatePathsCache(repositoryRoot);

    return {
      repositoryRoot,
      repositoryUrl,
      sourceCommitSha,
      provenanceVerified: true,
    };
  } catch {
    return UNVERIFIED;
  }
}

export function formatRepositorySourceLabel(
  filePath: string,
  repositoryUrl: string | null | undefined,
  sourceCommitSha: string | null | undefined,
): string {
  const repoLabel = repositoryUrl ? extractRepositoryLabel(repositoryUrl) : null;
  const shortSha = sourceCommitSha ? `@${sourceCommitSha.slice(0, 7)}` : "";
  if (repoLabel) {
    return `${repoLabel}:${filePath}${shortSha}`;
  }
  return `${filePath}${shortSha}`;
}

export function extractRepositoryLabel(repositoryUrl: string): string {
  const normalized = repositoryUrl.replace(/\.git$/i, "").replace(/\/+$/, "");
  const match = normalized.match(/github\.com\/([^/]+\/[^/]+)/i);
  return match?.[1] ?? normalized;
}

export async function filterRepositoryPathsAtRoot(
  repositoryRoot: string,
  candidatePaths: string[],
): Promise<string[]> {
  const proven: string[] = [];
  for (const candidatePath of candidatePaths) {
    const normalized = candidatePath.replace(/\\/g, "/");
    const absolute = path.join(repositoryRoot, normalized);
    if (await pathExists(absolute)) {
      proven.push(normalized);
    }
  }
  return proven;
}
