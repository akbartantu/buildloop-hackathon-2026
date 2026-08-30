import type { User } from "@supabase/supabase-js";

/** Stable fake UUID for the local demo principal — never written to Supabase. */
export const DEV_AUTH_BYPASS_USER_ID = "00000000-0000-4000-8000-000000000001";

export const DEV_AUTH_BYPASS_EMAIL = "dev@buildloop.local";
export const DEV_AUTH_BYPASS_NAME = "BuildLoop Dev User";

type DevAuthBypassInputs = {
  isDevelopment: boolean;
  bypassFlag: string | undefined | null;
};

function readDevAuthBypassFlag(): string | undefined {
  if (typeof import.meta !== "undefined" && import.meta.env?.["DEV_AUTH_BYPASS"] !== undefined) {
    const value = import.meta.env["DEV_AUTH_BYPASS"];
    return typeof value === "string" ? value : undefined;
  }

  return process.env["DEV_AUTH_BYPASS"];
}

export function isDevelopmentRuntime(): boolean {
  if (typeof import.meta !== "undefined" && typeof import.meta.env?.DEV === "boolean") {
    return import.meta.env.DEV;
  }

  return process.env["NODE_ENV"] === "development";
}

/** Pure evaluator used by runtime checks and unit tests. */
export function evaluateDevAuthBypass({
  isDevelopment,
  bypassFlag,
}: DevAuthBypassInputs): boolean {
  return isDevelopment && bypassFlag === "true";
}

export function isDevAuthBypassEnabled(): boolean {
  return evaluateDevAuthBypass({
    isDevelopment: isDevelopmentRuntime(),
    bypassFlag: readDevAuthBypassFlag(),
  });
}

export function createDevAuthBypassUser(): User {
  const timestamp = "1970-01-01T00:00:00.000Z";

  return {
    id: DEV_AUTH_BYPASS_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: DEV_AUTH_BYPASS_EMAIL,
    phone: "",
    app_metadata: { provider: "dev-bypass" },
    user_metadata: {
      full_name: DEV_AUTH_BYPASS_NAME,
      name: DEV_AUTH_BYPASS_NAME,
    },
    created_at: timestamp,
    updated_at: timestamp,
  };
}
