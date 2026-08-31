import { isDevAuthBypassEnabled, isDevelopmentRuntime } from "@/lib/dev-auth-bypass";
import { resolvePersistenceMode, type PersistenceMode } from "@/orchestrator/persistence/store-factory";
import { GeminiClient } from "@/orchestrator/gemini/client";

export type IntegrationStatusKey =
  | "available"
  | "configured"
  | "active"
  | "not_connected"
  | "not_configured"
  | "unavailable"
  | "production"
  | "local"
  | "local_development"
  | "disabled";

export type RuntimeSnapshot = {
  persistence: PersistenceMode;
  geminiConfigured: boolean;
  supabaseConfigured: boolean;
  devAuthBypass: boolean;
  isProduction: boolean;
};

export function isSupabaseConfigured(): boolean {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  return Boolean(url && key);
}

export function isProductionRuntime(): boolean {
  if (typeof import.meta !== "undefined" && typeof import.meta.env?.PROD === "boolean") {
    return import.meta.env.PROD;
  }
  return process.env["NODE_ENV"] === "production";
}

export function buildRuntimeSnapshot(): RuntimeSnapshot {
  const gemini = new GeminiClient();
  return {
    persistence: resolvePersistenceMode(),
    geminiConfigured: gemini.isConfigured(),
    supabaseConfigured: isSupabaseConfigured(),
    devAuthBypass: isDevAuthBypassEnabled(),
    isProduction: isProductionRuntime(),
  };
}

export function geminiIntegrationStatus(snapshot: RuntimeSnapshot): IntegrationStatusKey {
  return snapshot.geminiConfigured ? "configured" : "not_configured";
}

export function adkIntegrationStatus(snapshot: RuntimeSnapshot): IntegrationStatusKey {
  return snapshot.geminiConfigured ? "active" : "not_configured";
}

export function supabaseAuthIntegrationStatus(snapshot: RuntimeSnapshot): IntegrationStatusKey {
  if (snapshot.devAuthBypass) {
    return "unavailable";
  }
  return snapshot.supabaseConfigured ? "active" : "not_configured";
}

export function firestoreIntegrationStatus(snapshot: RuntimeSnapshot): IntegrationStatusKey {
  if (snapshot.persistence === "firestore") {
    return "active";
  }
  return snapshot.isProduction ? "unavailable" : "local";
}

export function cloudRunIntegrationStatus(snapshot: RuntimeSnapshot): IntegrationStatusKey {
  return snapshot.isProduction ? "production" : "local_development";
}

export function publicGitHubIntegrationStatus(_hasActiveRepository: boolean): IntegrationStatusKey {
  return "available";
}

export function environmentRuntimeLabel(snapshot: RuntimeSnapshot): IntegrationStatusKey {
  return cloudRunIntegrationStatus(snapshot);
}

export function environmentPersistenceLabel(snapshot: RuntimeSnapshot): IntegrationStatusKey {
  return firestoreIntegrationStatus(snapshot);
}

export function environmentDevBypassLabel(snapshot: RuntimeSnapshot): IntegrationStatusKey {
  return snapshot.devAuthBypass ? "active" : "disabled";
}

export function environmentModeLabel(snapshot: RuntimeSnapshot): "production" | "local_development" {
  return snapshot.isProduction && !isDevelopmentRuntime()
    ? "production"
    : "local_development";
}
