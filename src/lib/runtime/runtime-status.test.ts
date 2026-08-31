import { describe, expect, test } from "bun:test";

import {
  adkIntegrationStatus,
  cloudRunIntegrationStatus,
  firestoreIntegrationStatus,
  geminiIntegrationStatus,
  publicGitHubIntegrationStatus,
  supabaseAuthIntegrationStatus,
  type RuntimeSnapshot,
} from "./runtime-status";

function snapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
    persistence: "local",
    geminiConfigured: false,
    supabaseConfigured: false,
    devAuthBypass: false,
    isProduction: false,
    ...overrides,
  };
}

describe("runtime integration status", () => {
  test("public GitHub is always available", () => {
    expect(publicGitHubIntegrationStatus(false)).toBe("available");
    expect(publicGitHubIntegrationStatus(true)).toBe("available");
  });

  test("Gemini status reflects configuration", () => {
    expect(geminiIntegrationStatus(snapshot())).toBe("not_configured");
    expect(geminiIntegrationStatus(snapshot({ geminiConfigured: true }))).toBe("configured");
  });

  test("ADK is active only when Gemini is configured", () => {
    expect(adkIntegrationStatus(snapshot())).toBe("not_configured");
    expect(adkIntegrationStatus(snapshot({ geminiConfigured: true }))).toBe("active");
  });

  test("Supabase auth is unavailable under dev bypass", () => {
    expect(supabaseAuthIntegrationStatus(snapshot({ devAuthBypass: true }))).toBe("unavailable");
    expect(
      supabaseAuthIntegrationStatus(snapshot({ supabaseConfigured: true, devAuthBypass: false })),
    ).toBe("active");
  });

  test("Firestore is active only when persistence mode is firestore", () => {
    expect(firestoreIntegrationStatus(snapshot())).toBe("local");
    expect(firestoreIntegrationStatus(snapshot({ persistence: "firestore" }))).toBe("active");
    expect(
      firestoreIntegrationStatus(snapshot({ persistence: "local", isProduction: true })),
    ).toBe("unavailable");
  });

  test("Cloud Run shows production only in production runtime", () => {
    expect(cloudRunIntegrationStatus(snapshot())).toBe("local_development");
    expect(cloudRunIntegrationStatus(snapshot({ isProduction: true }))).toBe("production");
  });
});
