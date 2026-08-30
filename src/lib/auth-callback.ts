import { supabase } from "@/integrations/supabase/client";
import { mapOAuthCallbackError } from "@/lib/auth/auth-errors";

export type AuthCallbackResult =
  | { status: "session" }
  | { status: "error"; message: string }
  | { status: "pending" };

export type AuthCallbackParamsResult =
  | { status: "tokens"; accessToken: string; refreshToken: string }
  | { status: "code"; code: string }
  | { status: "error"; message: string }
  | { status: "pending" };

export function parseHashParamsForTest(hash: string): URLSearchParams {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(trimmed);
}

export function resolveAuthCallbackFromParams(
  queryParams: URLSearchParams,
  hashParams: URLSearchParams,
): AuthCallbackParamsResult {
  const oauthError = hashParams.get("error") ?? queryParams.get("error");
  if (oauthError) {
    const description =
      hashParams.get("error_description") ?? queryParams.get("error_description");
    return {
      status: "error",
      message: mapOAuthCallbackError({
        error: oauthError,
        errorDescription: description,
        fallback: "Masuk dibatalkan atau gagal. Silakan coba lagi.",
      }),
    };
  }

  const accessToken = hashParams.get("access_token") ?? queryParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token") ?? queryParams.get("refresh_token");
  if (accessToken && refreshToken) {
    return { status: "tokens", accessToken, refreshToken };
  }

  const code = queryParams.get("code");
  if (code) {
    return { status: "code", code };
  }

  return { status: "pending" };
}

function stripSensitiveParams(pathname: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.history.replaceState({}, document.title, pathname);
}

export async function establishSessionFromCallbackUrl(
  url: URL = new URL(window.location.href),
): Promise<AuthCallbackResult> {
  const parsed = resolveAuthCallbackFromParams(url.searchParams, parseHashParamsForTest(url.hash));

  if (parsed.status === "error") {
    return parsed;
  }

  if (parsed.status === "tokens") {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: parsed.accessToken,
      refresh_token: parsed.refreshToken,
    });
    if (sessionError) {
      return { status: "error", message: "Sesi tidak dapat disiapkan. Silakan coba masuk lagi." };
    }
    stripSensitiveParams(url.pathname);
    return { status: "session" };
  }

  if (parsed.status === "code") {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(parsed.code);
    if (exchangeError) {
      return { status: "error", message: "Sesi tidak dapat disiapkan. Silakan coba masuk lagi." };
    }
    stripSensitiveParams(url.pathname);
    return { status: "session" };
  }

  const { data, error: getError } = await supabase.auth.getSession();
  if (getError) {
    return { status: "error", message: "Sesi tidak dapat disiapkan. Silakan coba masuk lagi." };
  }
  if (data.session?.user) {
    return { status: "session" };
  }

  return { status: "pending" };
}
