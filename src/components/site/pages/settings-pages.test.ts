import { describe, expect, test } from "bun:test";

import { translate } from "@/i18n";
import { buildEnvironmentFields } from "@/components/site/pages/settings-pages";
import type { RuntimeSnapshot } from "@/lib/runtime/runtime-status";

const settingsSourcePath = new URL("./settings-pages.tsx", import.meta.url);

async function readSettingsSource() {
  return Bun.file(settingsSourcePath).text();
}

const tEn = (key: Parameters<typeof translate>[1]) => translate("en", key);

describe("settings information architecture", () => {
  test("profile tab does not render environment diagnostics", async () => {
    const source = await readSettingsSource();
    const profileSection = source.slice(
      source.indexOf("function ProfileFormPanel"),
      source.indexOf("export function EnvironmentSettingsSection"),
    );

    expect(profileSection).not.toContain("connectedSourceCommit");
    expect(profileSection).not.toContain("BUILDLOOP_PERSISTENCE");
  });

  test("settings includes workspace tab", async () => {
    const source = await readSettingsSource();
    expect(source).toContain("settings.tabs.workspace");
    expect(source).toContain("WorkspaceSettingsSection");
    expect(source).toContain("useWorkspaceLabel");
  });

  test("environment section uses shared workspace source of truth", async () => {
    const source = await readSettingsSource();
    const environmentSection = source.slice(source.indexOf("export function EnvironmentSettingsSection"));

    expect(environmentSection).toContain("useWorkspaceLabel");
    expect(environmentSection).toContain("useRuntimeSnapshot");
    expect(environmentSection).toContain("isDemo");
  });

  test("integrations page does not claim GitHub OAuth is connected", async () => {
    const source = await readSettingsSource();
    const integrationsSection = source.slice(source.indexOf("export function IntegrationsPage"));

    expect(integrationsSection).not.toMatch(/GitHub OAuth/i);
    expect(integrationsSection).not.toContain("oauth");
    expect(integrationsSection).toContain("IntegrationStatusRow");
  });

  test("settings and integrations pages do not expose secrets", async () => {
    const source = await readSettingsSource();
    expect(source).not.toMatch(/service[_-]?role/i);
    expect(source).not.toMatch(/sb_secret/i);
    expect(source).not.toMatch(/GEMINI_API_KEY/);
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  test("profile shows language from i18n context", async () => {
    const source = await readSettingsSource();
    expect(source).toContain("settings.profile.language");
    expect(source).toContain("language.indonesian");
    expect(source).toContain("language.english");
  });

  test("profile includes privacy and data links", async () => {
    const source = await readSettingsSource();
    expect(source).toContain("settings.privacy.title");
    expect(source).toContain('to="/privacy"');
    expect(source).toContain('to="/cookies"');
    expect(source).toContain('to="/security"');
  });
});

describe("buildEnvironmentFields", () => {
  const snapshot: RuntimeSnapshot = {
    persistence: "firestore",
    geminiConfigured: true,
    supabaseConfigured: true,
    devAuthBypass: false,
    isProduction: true,
  };

  test("real active project overrides demo fallback", () => {
    const fields = buildEnvironmentFields(tEn, {
      workspaceLabel: "akbartantu/buildloop-hackathon-2026",
      isDemo: false,
      sourceBranch: "main",
      sourceCommit: "e82bb6b0123456789abcdef0123456789abcdef01",
      snapshot,
    });

    expect(fields.activeWorkspace).toBe("akbartantu/buildloop-hackathon-2026");
    expect(fields.activeWorkspace).not.toContain("buildloop-demo");
    expect(fields.source).toBe("Public GitHub");
    expect(fields.branch).toBe("main");
    expect(fields.connectedCommit).toBe("e82bb6b0");
  });

  test("demo fallback appears only without active project", () => {
    const fields = buildEnvironmentFields(tEn, {
      workspaceLabel: "buildloop-demo",
      isDemo: true,
      snapshot,
    });

    expect(fields.activeWorkspace).toContain("buildloop-demo");
    expect(fields.source).toContain("Controlled local demo workspace");
    expect(fields.branch).toBe("Unavailable");
    expect(fields.connectedCommit).toBe("Unavailable");
  });
});

describe("integrations i18n", () => {
  test("English integrations copy contains no Indonesian leak", () => {
    const leaks = ["Integrasi eksternal", "Status integrasi", "hackathon sandbox", "belum terhubung"];
    for (const key of [
      "integrations.description",
      "integrations.panelTitle",
      "integrations.items.publicGithub.description",
    ] as const) {
      const value = translate("en", key);
      for (const leak of leaks) {
        expect(value.toLowerCase()).not.toContain(leak.toLowerCase());
      }
    }
  });

  test("Indonesian integrations copy works", () => {
    expect(translate("id", "integrations.items.gemini.name")).toBe("Gemini");
    expect(translate("id", "integrations.status.available")).toBe("Tersedia");
  });
});
