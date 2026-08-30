import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "@/lib/auth/require-auth";
import type { ProjectRecord } from "@/lib/projects/project-record";

export const listProjects = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<ProjectRecord[]> => {
    return context.projects.listProjects(context.auth.userId);
  });

export const getProject = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => {
    if (typeof input !== "object" || input === null || !("id" in input)) {
      throw new Error("Project id is required.");
    }
    const id = (input as { id: unknown }).id;
    if (typeof id !== "string") {
      throw new Error("Project id is required.");
    }
    return { id };
  })
  .handler(async ({ data, context }): Promise<ProjectRecord | null> => {
    return context.projects.getProject(data.id, context.auth.userId);
  });
