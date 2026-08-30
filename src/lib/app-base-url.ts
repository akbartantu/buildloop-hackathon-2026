const DEFAULT_DEV_BASE_URL = "http://localhost:5173";

/** Normalize a configured base URL to origin (+ optional path prefix). */
export function normalizeAppBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("APP_BASE_URL is not a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use http: or https:.");
  }

  const path = parsed.pathname.replace(/\/$/, "");
  return path.length > 0 ? `${parsed.origin}${path}` : parsed.origin;
}

/**
 * Canonical application base URL for absolute links (sitemap, OG, etc.).
 * Set APP_BASE_URL in deployment; falls back to local dev origin.
 */
export function getAppBaseUrl(): string {
  const raw = process.env["APP_BASE_URL"]?.trim();
  if (!raw) {
    return DEFAULT_DEV_BASE_URL;
  }

  return normalizeAppBaseUrl(raw);
}

/**
 * Base URL for browser-initiated auth redirects (OAuth, password reset).
 * Prefers VITE_APP_BASE_URL when set at build time, otherwise the current origin.
 */
export function resolveBrowserAppBaseUrl(): string {
  const viteBase = import.meta.env["VITE_APP_BASE_URL"]?.trim();
  if (viteBase) {
    return normalizeAppBaseUrl(viteBase);
  }

  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }

  return getAppBaseUrl();
}
