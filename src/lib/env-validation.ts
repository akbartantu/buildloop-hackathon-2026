import { isDevAuthBypassEnabled, isDevelopmentRuntime } from "@/lib/dev-auth-bypass";
import { resolvePersistenceMode } from "@/orchestrator/persistence/store-factory";

export type EnvValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function validateProductionEnvironment(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = process.env["NODE_ENV"] === "production";

  if (isProd && isDevAuthBypassEnabled()) {
    errors.push("DEV_AUTH_BYPASS must not be active in production.");
  }

  if (isProd && !process.env["SUPABASE_URL"]) {
    errors.push("SUPABASE_URL is required in production.");
  }

  if (isProd && !process.env["APP_BASE_URL"]) {
    warnings.push("APP_BASE_URL is unset — OAuth redirects may fail.");
  }

  if (isProd && resolvePersistenceMode() === "firestore") {
    if (!process.env["FIRESTORE_PROJECT_ID"] && !process.env["GOOGLE_CLOUD_PROJECT"]) {
      errors.push("FIRESTORE_PROJECT_ID is required when BUILDLOOP_PERSISTENCE=firestore.");
    }
    if (
      !process.env["FIRESTORE_SERVICE_ACCOUNT_JSON"] &&
      process.env["BUILDLOOP_FIRESTORE_EMULATOR"] !== "1"
    ) {
      errors.push(
        "FIRESTORE_SERVICE_ACCOUNT_JSON or BUILDLOOP_FIRESTORE_EMULATOR=1 required for Firestore persistence.",
      );
    }
  }

  if (isDevelopmentRuntime() && process.env["DEV_AUTH_BYPASS"] === "true") {
    warnings.push("DEV_AUTH_BYPASS is active — local development only.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

if (process.env["NODE_ENV"] === "production") {
  const result = validateProductionEnvironment();
  if (!result.ok) {
    console.error("[buildloop] Production environment validation failed:", result.errors);
  }
}
