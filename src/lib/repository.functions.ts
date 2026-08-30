import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "@/lib/auth/require-auth";
import type { ConnectedRepositorySource } from "@/lib/repository/repository-source";
import { validatePublicGitHubUrl } from "@/lib/repository/public-github-url";
import {
  captureGitBaseline,
  ensurePublicGitHubClone,
} from "@/orchestrator/workspace/git-workspace";
import { getWorkspaceRoot } from "@/orchestrator/product/orchestrator";
import { z } from "zod";

const connectRepositorySchema = z.object({
  url: z.string().trim().min(1, "Repository URL is required."),
});

export type ConnectRepositoryResult =
  | { status: "ok"; source: ConnectedRepositorySource }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export const connectPublicRepository = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => connectRepositorySchema.parse(input))
  .handler(async ({ data }): Promise<ConnectRepositoryResult> => {
    const validation = validatePublicGitHubUrl(data.url);
    if (!validation.ok) {
      return { status: "invalid", message: validation.reason };
    }

    try {
      const workspaceRoot = getWorkspaceRoot();
      const repoPath = await ensurePublicGitHubClone(validation.normalizedUrl, workspaceRoot);
      const baseline = await captureGitBaseline(repoPath);

      if (!baseline) {
        return { status: "error", message: "Repository could not be inspected." };
      }

      return {
        status: "ok",
        source: {
          url: validation.normalizedUrl,
          repoName: validation.repoName,
          branch: baseline.branch,
          commitSha: baseline.headSha,
          sourceType: "public_github",
        },
      };
    } catch {
      return { status: "error", message: "Repository could not be connected." };
    }
  });
