import { getAppBaseUrl, resolveBrowserAppBaseUrl } from "@/lib/app-base-url";
import { AUTH_CALLBACK_PATH } from "@/lib/auth/signup-flow";

/** Canonical auth callback URL for email confirmation and OAuth. */
export function buildAuthCallbackUrl(baseUrl?: string): string {
  const resolved = baseUrl ?? resolveBrowserAppBaseUrl();
  return `${resolved}${AUTH_CALLBACK_PATH}`;
}

/** Server-side auth callback URL using APP_BASE_URL. */
export function buildServerAuthCallbackUrl(baseUrl: string = getAppBaseUrl()): string {
  return `${baseUrl}${AUTH_CALLBACK_PATH}`;
}

export const GOOGLE_OAUTH_PROVIDER = "google" as const;

export function buildGoogleOAuthRequest(redirectTo: string = buildAuthCallbackUrl()) {
  return {
    provider: GOOGLE_OAUTH_PROVIDER,
    options: {
      redirectTo,
    },
  } as const;
}
