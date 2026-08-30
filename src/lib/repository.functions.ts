import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "@/lib/auth/require-auth";
import type { ConnectedRepositorySource } from "@/lib/repository/repository-source";
import { validatePublicGitHubUrl } from "@/lib/repository/public-github-url";
import {
  classifyRepositoryConnectionError,
  logRepositoryConnectionError,
  repositoryConnectionMessage,
} from "@/lib/repository/repository-connection-errors";
import {
  assertGitAvailable,
  captureGitBaseline,
  ensurePublicGitHubClone,
  probePublicRepositoryRefs,
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
      await assertGitAvailable();
    } catch (error) {
      logRepositoryConnectionError("git availability", error);
      return {
        status: "error",
        message: repositoryConnectionMessage("git_unavailable"),
      };
    }

    try {
      const refs = await probePublicRepositoryRefs(validation.normalizedUrl);
      if (refs.length === 0) {
        return {
          status: "error",
          message: repositoryConnectionMessage("inspection_failed"),
        };
      }
    } catch (error) {
      logRepositoryConnectionError("repository accessibility", error);
      return {
        status: "error",
        message: repositoryConnectionMessage("not_accessible"),
      };
    }

    let repoPath: string;
    try {
      const workspaceRoot = getWorkspaceRoot();
      const sandboxRoot = getSandboxRoot(workspaceRoot);
      repoPath = await ensurePublicGitHubClone(validation.normalizedUrl, workspaceRoot, {
        sandboxRoot,
      });
    } catch (error) {
      logRepositoryConnectionError("clone", error);
      const category = classifyRepositoryConnectionError(error);
      return {
        status: "error",
        message: repositoryConnectionMessage(
          category === "unexpected" ? "clone_failed" : category,
        ),
      };
    }

    const baseline = await captureGitBaseline(repoPath);
    if (!baseline) {
      logRepositoryConnectionError(
        "baseline capture",
        new Error("captureGitBaseline returned null"),
      );
      return {
        status: "error",
        message: repositoryConnectionMessage("inspection_failed"),
      };
    }

    try {
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
    } catch (error) {
      logRepositoryConnectionError("project persistence", error);
      const category = classifyRepositoryConnectionError(error);
      return {
        status: "error",
        message: repositoryConnectionMessage(
          category === "unexpected" ? "persistence_failed" : category,
        ),
      };
    }
  });
