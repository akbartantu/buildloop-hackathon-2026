import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/require-auth";
import { isProjectRepositoryConnected, projectDisplayName } from "@/lib/projects/project-record";
import type { ConnectedRepositorySource } from "@/lib/repository/repository-source";
import { validatePublicGitHubUrl } from "@/lib/repository/public-github-url";
import {
  classifyRepositoryConnectionError,
  logRepositoryConnectionError,
  RepositoryProbeError,
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

const connectRepositorySchema = z.object({
  url: z.string().trim().min(1, "Repository URL is required."),
  intent: z.enum(["connect", "create_workspace", "reconnect"]).optional(),
  projectId: z.string().uuid().optional(),
});

const projectIdSchema = z.object({
  projectId: z.string().uuid(),
});

export type ConnectRepositoryResult =
  | { status: "ok"; source: ConnectedRepositorySource; projectId: string }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export type RepositoryMutationResult =
  | { status: "ok"; source: ConnectedRepositorySource; projectId: string }
  | { status: "error"; message: string };

type GitBaseline = NonNullable<Awaited<ReturnType<typeof captureGitBaseline>>>;

async function inspectPublicGitHubRepository(normalizedUrl: string): Promise<
  | { ok: true; baseline: GitBaseline }
  | { ok: false; message: string }
> {
  try {
    await assertGitAvailable();
  } catch (error) {
    logRepositoryConnectionError("git availability", error);
    return {
      ok: false,
      message: repositoryConnectionMessage("git_unavailable"),
    };
  }

  try {
    const refs = await probePublicRepositoryRefs(normalizedUrl);
    if (refs.length === 0) {
      return {
        ok: false,
        message: repositoryConnectionMessage("inspection_failed"),
      };
    }
  } catch (error) {
    logRepositoryConnectionError("repository accessibility", error);
    const category =
      error instanceof RepositoryProbeError
        ? error.category
        : classifyRepositoryConnectionError(error);
    return {
      ok: false,
      message: repositoryConnectionMessage(category),
    };
  }

  let repoPath: string;
  try {
    const workspaceRoot = getWorkspaceRoot();
    const sandboxRoot = getSandboxRoot(workspaceRoot);
    repoPath = await ensurePublicGitHubClone(normalizedUrl, workspaceRoot, {
      sandboxRoot,
    });
  } catch (error) {
    logRepositoryConnectionError("clone", error);
    const category = classifyRepositoryConnectionError(error);
    return {
      ok: false,
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
      ok: false,
      message: repositoryConnectionMessage("inspection_failed"),
    };
  }

  return { ok: true, baseline };
}

function toConnectedSource(project: {
  id: string;
  repositoryUrl: string;
  repositoryOwner: string;
  repositoryName: string;
  defaultBranch: string | null;
  connectedCommitSha: string | null;
}): ConnectedRepositorySource {
  return {
    url: project.repositoryUrl,
    repoName: projectDisplayName(project),
    branch: project.defaultBranch ?? "main",
    commitSha: project.connectedCommitSha ?? "",
    sourceType: "public_github",
    projectId: project.id,
  };
}

export const connectPublicRepository = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => connectRepositorySchema.parse(input))
  .handler(async ({ data, context }): Promise<ConnectRepositoryResult> => {
    const validation = validatePublicGitHubUrl(data.url);
    if (!validation.ok) {
      return { status: "invalid", message: validation.reason };
    }

    const intent = data.intent ?? "connect";

    if (intent === "reconnect" && data.projectId) {
      const existing = await context.projects.getProject(data.projectId, context.auth.userId);
      if (!existing) {
        return { status: "error", message: repositoryConnectionMessage("persistence_failed") };
      }
      if (existing.repositoryUrl !== validation.normalizedUrl) {
        return {
          status: "error",
          message: repositoryConnectionMessage("different_repository_requires_new_workspace"),
        };
      }
    }

    if (data.projectId && intent !== "create_workspace") {
      const existing = await context.projects.getProject(data.projectId, context.auth.userId);
      if (
        existing &&
        isProjectRepositoryConnected(existing) &&
        existing.repositoryUrl !== validation.normalizedUrl
      ) {
        return {
          status: "error",
          message: repositoryConnectionMessage("different_repository_requires_new_workspace"),
        };
      }
    }

    const inspected = await inspectPublicGitHubRepository(validation.normalizedUrl);
    if (!inspected.ok) {
      return { status: "error", message: inspected.message };
    }

    try {
      const project = await context.projects.upsertPublicGitHubProject({
        userId: context.auth.userId,
        name: validation.repoName,
        repositoryUrl: validation.normalizedUrl,
        repositoryOwner: validation.owner,
        repositoryName: validation.repo,
        defaultBranch: inspected.baseline.branch,
        connectedCommitSha: inspected.baseline.headSha,
      });

      return {
        status: "ok",
        projectId: project.id,
        source: toConnectedSource(project),
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

export const refreshPublicGitHubProject = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => projectIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<RepositoryMutationResult> => {
    const project = await context.projects.getProject(data.projectId, context.auth.userId);
    if (!project) {
      return { status: "error", message: repositoryConnectionMessage("persistence_failed") };
    }

    const inspected = await inspectPublicGitHubRepository(project.repositoryUrl);
    if (!inspected.ok) {
      return { status: "error", message: inspected.message };
    }

    try {
      const refreshed = await context.projects.refreshPublicGitHubProject({
        userId: context.auth.userId,
        projectId: project.id,
        defaultBranch: inspected.baseline.branch,
        connectedCommitSha: inspected.baseline.headSha,
      });

      return {
        status: "ok",
        projectId: refreshed.id,
        source: toConnectedSource(refreshed),
      };
    } catch (error) {
      logRepositoryConnectionError("project refresh", error);
      return {
        status: "error",
        message: repositoryConnectionMessage("persistence_failed"),
      };
    }
  });

export const disconnectPublicGitHubProject = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => projectIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<RepositoryMutationResult> => {
    const project = await context.projects.getProject(data.projectId, context.auth.userId);
    if (!project) {
      return { status: "error", message: repositoryConnectionMessage("persistence_failed") };
    }

    if (!isProjectRepositoryConnected(project)) {
      return {
        status: "ok",
        projectId: project.id,
        source: toConnectedSource(project),
      };
    }

    try {
      const disconnected = await context.projects.disconnectPublicGitHubProject({
        userId: context.auth.userId,
        projectId: project.id,
      });

      return {
        status: "ok",
        projectId: disconnected.id,
        source: toConnectedSource(disconnected),
      };
    } catch (error) {
      logRepositoryConnectionError("project disconnect", error);
      return {
        status: "error",
        message: repositoryConnectionMessage("persistence_failed"),
      };
    }
  });
