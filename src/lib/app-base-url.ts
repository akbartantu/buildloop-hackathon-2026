const DEFAULT_DEV_BASE_URL = "http://localhost:5173";

/**
 * Canonical application base URL for absolute links (sitemap, OG, etc.).
 * Set APP_BASE_URL in deployment; falls back to local dev origin.
 */
export function getAppBaseUrl(): string {
  const raw = process.env["APP_BASE_URL"]?.trim();
  if (!raw) {
    return DEFAULT_DEV_BASE_URL;
  }

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
