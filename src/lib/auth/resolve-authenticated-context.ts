import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { AuthPrincipal } from "./principal";
import { resolveDevBypassPrincipal } from "./principal";
import { resolveSupabaseAuthFromRequest } from "./resolve-supabase-auth";
import type { DevTaskRepository } from "@/lib/tasks/dev-task-repository";
import type { SupabaseTaskRepository } from "@/lib/tasks/supabase-task-repository";
import type { DevProjectRepository } from "@/lib/projects/dev-project-repository";
import type { SupabaseProjectRepository } from "@/lib/projects/supabase-project-repository";
import { toTaskRecord, type TaskRowShape } from "@/lib/tasks/task-record";

export type TaskRepository = DevTaskRepository | SupabaseTaskRepository;
export type ProjectRepository = DevProjectRepository | SupabaseProjectRepository;

export type AuthenticatedRequestContext = {
  auth: AuthPrincipal;
  tasks: TaskRepository;
  projects: ProjectRepository;
  supabase?: SupabaseClient<Database>;
  claims?: Record<string, unknown>;
};

/** Single server-side auth boundary for authenticated server functions. */
export async function resolveAuthenticatedRequestContext(): Promise<AuthenticatedRequestContext> {
  const devPrincipal = resolveDevBypassPrincipal();
  if (devPrincipal) {
    const { createDevTaskRepository } = await import("@/lib/tasks/dev-task-repository");
    const { createDevProjectRepository } = await import("@/lib/projects/dev-project-repository");
    const projects = createDevProjectRepository();
    return {
      auth: devPrincipal,
      projects,
      tasks: createDevTaskRepository({
        getProject: async (id, userId) => {
          const project = await projects.getProject(id, userId);
          if (!project) return null;
          return {
            repositoryUrl: project.repositoryUrl,
            connectedCommitSha: project.connectedCommitSha,
          };
        },
      }),
    };
  }

  const supabaseAuth = await resolveSupabaseAuthFromRequest();
  const { createSupabaseTaskRepository } = await import("@/lib/tasks/supabase-task-repository");
  const { createSupabaseProjectRepository } = await import("@/lib/projects/supabase-project-repository");
  const projects = createSupabaseProjectRepository(supabaseAuth.supabase);
  return {
    auth: supabaseAuth.principal,
    projects,
    tasks: createSupabaseTaskRepository(supabaseAuth.supabase, {
      getProject: async (id, userId) => {
        const project = await projects.getProject(id, userId);
        if (!project) return null;
        return {
          repositoryUrl: project.repositoryUrl,
          connectedCommitSha: project.connectedCommitSha,
        };
      },
    }),
    supabase: supabaseAuth.supabase,
    claims: supabaseAuth.claims,
  };
}

export { toTaskRecord, type TaskRowShape };
