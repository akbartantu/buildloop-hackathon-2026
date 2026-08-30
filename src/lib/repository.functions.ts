import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "@/lib/auth/require-auth";
import type { ConnectedRepositorySource } from "@/lib/repository/repository-source";
import { validatePublicGitHubUrl } from "@/lib/repository/public-github-url";
import {
  captureGitBaseline,
  ensurePublicGitHubClone,
} from "@/orchestrator/workspace/git-workspace";
import { getSandboxRoot } from "@/orchestrator/workspace/sandbox-root";
import { getWorkspaceRoot } from "@/orchestrator/product/orchestrator";
import { z } from "zod";

const connectRepositorySchema = z.object({
  url: z.string().trim().min(1, "Repository URL is required."),
});

export type ConnectRepositoryResult =
  | { status: "ok"; source: ConnectedRepositorySource; projectId: string }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export const connectPublicRepository = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => connectRepositorySchema.parse(input))
  .handler(async ({ data, context }): Promise<ConnectRepositoryResult> => {
    const validation = validatePublicGitHubUrl(data.url);
    if (!validation.ok) {
      return { status: "invalid", message: validation.reason };
    }

    try {
      const workspaceRoot = getWorkspaceRoot();
      const sandboxRoot = getSandboxRoot(workspaceRoot);
      const repoPath = await ensurePublicGitHubClone(validation.normalizedUrl, workspaceRoot, {
        sandboxRoot,
      });
      const baseline = await captureGitBaseline(repoPath);

      if (!baseline) {
        return { status: "error", message: "Repository could not be inspected." };
      }

      const project = await context.projects.upsertPublicGitHubProject({
        userId: context.auth.userId,
        name: validation.repoName,
        repositoryUrl: validation.normalizedUrl,
        repositoryOwner: validation.owner,
        repositoryName: validation.repo,
        defaultBranch: baseline.branch,
        connectedCommitSha: baseline.headSha,
      });

      return {
        status: "ok",
        projectId: project.id,
        source: {
          url: validation.normalizedUrl,
          repoName: validation.repoName,
          branch: baseline.branch,
          commitSha: baseline.headSha,
          sourceType: "public_github",
          projectId: project.id,
        },
      };
    } catch {
      return { status: "error", message: "Repository could not be connected." };
    }
  });
