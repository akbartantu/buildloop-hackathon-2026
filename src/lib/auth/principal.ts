import {
  createDevAuthBypassUser,
  DEV_AUTH_BYPASS_EMAIL,
  DEV_AUTH_BYPASS_NAME,
  DEV_AUTH_BYPASS_USER_ID,
  isDevAuthBypassEnabled,
} from "@/lib/dev-auth-bypass";

export type AuthMode = "supabase" | "dev-bypass";

/** Resolved authenticated principal — downstream code consumes this, not auth mechanism. */
export type AuthPrincipal = {
  mode: AuthMode;
  userId: string;
  email: string;
  displayName: string;
};

export function resolveDevBypassPrincipal(): AuthPrincipal | null {
  if (!isDevAuthBypassEnabled()) {
    return null;
  }

  return {
    mode: "dev-bypass",
    userId: DEV_AUTH_BYPASS_USER_ID,
    email: DEV_AUTH_BYPASS_EMAIL,
    displayName: DEV_AUTH_BYPASS_NAME,
  };
}

export function principalFromDevBypassUser(): AuthPrincipal {
  const user = createDevAuthBypassUser();
  return {
    mode: "dev-bypass",
    userId: user.id,
    email: user.email ?? DEV_AUTH_BYPASS_EMAIL,
    displayName: DEV_AUTH_BYPASS_NAME,
  };
}
