import { getRequest } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { AuthPrincipal } from "./principal";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export type SupabaseAuthContext = {
  principal: AuthPrincipal;
  supabase: SupabaseClient<Database>;
  claims: Record<string, unknown>;
};

export async function resolveSupabaseAuthFromRequest(): Promise<SupabaseAuthContext> {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Konfigurasi autentikasi BuildLoop belum tersedia.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  const request = getRequest();

  if (!request?.headers) {
    throw new Error("Unauthorized: No request headers available");
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    throw new Error("Unauthorized: No authorization header provided");
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Only Bearer tokens are supported");
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    throw new Error("Unauthorized: No token provided");
  }

  if (token.split(".").length !== 3) {
    throw new Error("Unauthorized: Invalid token");
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    throw new Error("Unauthorized: Invalid token");
  }

  if (!data.claims.sub) {
    throw new Error("Unauthorized: No user ID found in token");
  }

  const email =
    typeof data.claims.email === "string" ? data.claims.email : "authenticated@buildloop.local";
  const displayName =
    typeof data.claims.user_metadata === "object" &&
    data.claims.user_metadata !== null &&
    "full_name" in data.claims.user_metadata &&
    typeof (data.claims.user_metadata as { full_name?: unknown }).full_name === "string"
      ? (data.claims.user_metadata as { full_name: string }).full_name
      : email.split("@")[0] ?? "Pengguna";

  return {
    principal: {
      mode: "supabase",
      userId: data.claims.sub,
      email,
      displayName,
    },
    supabase,
    claims: data.claims as Record<string, unknown>,
  };
}
