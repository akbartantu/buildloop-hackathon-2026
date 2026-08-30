import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export const CLIENT_AUTH_LOOKUP_TIMEOUT_MS = 5_000;

export async function withAuthTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Fast local session read — no Supabase network round-trip. */
export async function readLocalAuthUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.user ?? null;
}

/** Public auth routes: never block on remote validation. */
export async function resolvePublicRouteAuthUser(): Promise<User | null> {
  try {
    return await withAuthTimeout(
      readLocalAuthUser(),
      CLIENT_AUTH_LOOKUP_TIMEOUT_MS,
      "Auth session lookup",
    );
  } catch (error) {
    console.warn("[auth] Public route session lookup failed; continuing unauthenticated.", error);
    return null;
  }
}

/** Protected routes: local session first, optional remote validation with timeout fallback. */
export async function resolveProtectedRouteAuthUser(): Promise<User | null> {
  const localUser = await readLocalAuthUser();
  if (!localUser) return null;

  try {
    const { data, error } = await withAuthTimeout(
      supabase.auth.getUser(),
      CLIENT_AUTH_LOOKUP_TIMEOUT_MS,
      "Auth user validation",
    );
    if (error || !data.user) return null;
    return data.user;
  } catch (error) {
    console.warn("[auth] Protected route user validation timed out; using local session.", error);
    return localUser;
  }
}
