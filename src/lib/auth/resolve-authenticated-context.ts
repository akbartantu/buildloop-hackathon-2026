import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AuthPrincipal } from "./principal";
import { resolveDevBypassPrincipal } from "./principal";
import { resolveSupabaseAuthFromRequest } from "./resolve-supabase-auth";
import type { DevTaskRepository } from "@/lib/tasks/dev-task-repository";
import type { SupabaseTaskRepository } from "@/lib/tasks/supabase-task-repository";
import { toTaskRecord, type TaskRowShape } from "@/lib/tasks/task-record";

export type TaskRepository = DevTaskRepository | SupabaseTaskRepository;

export type AuthenticatedRequestContext = {
  auth: AuthPrincipal;
  tasks: TaskRepository;
  supabase?: SupabaseClient<Database>;
  claims?: Record<string, unknown>;
};

/** Single server-side auth boundary for authenticated server functions. */
export async function resolveAuthenticatedRequestContext(): Promise<AuthenticatedRequestContext> {
  const devPrincipal = resolveDevBypassPrincipal();
  if (devPrincipal) {
    const { createDevTaskRepository } = await import("@/lib/tasks/dev-task-repository");
    return {
      auth: devPrincipal,
      tasks: createDevTaskRepository(),
    };
  }

  const supabaseAuth = await resolveSupabaseAuthFromRequest();
  const { createSupabaseTaskRepository } = await import("@/lib/tasks/supabase-task-repository");
  return {
    auth: supabaseAuth.principal,
    tasks: createSupabaseTaskRepository(supabaseAuth.supabase),
    supabase: supabaseAuth.supabase,
    claims: supabaseAuth.claims,
  };
}

export { toTaskRecord, type TaskRowShape };
