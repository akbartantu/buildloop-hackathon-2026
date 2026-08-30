import { describe, expect, test } from "bun:test";
import {
  canChangePassword,
  isValidPhone,
  normalizePhone,
  resolveUserDisplayName,
} from "@/lib/auth/user-display";

const settingsSourcePath = new URL("./settings-pages.tsx", import.meta.url);
const workspaceSessionSourcePath = new URL("../../../hooks/use-workspace-session.ts", import.meta.url);

async function readSettingsSource() {
  return Bun.file(settingsSourcePath).text();
}

describe("settings information architecture", () => {
  test("profile tab does not render environment diagnostics", async () => {
    const source = await readSettingsSource();

    const profileSection = source.slice(
      source.indexOf("function ProfileFormPanel"),
      source.indexOf("export function EnvironmentSettingsSection"),
    );

    expect(profileSection).not.toContain("WORKSPACE_NAME");
    expect(profileSection).not.toContain("DEV AUTH BYPASS");
    expect(profileSection).not.toContain("import.meta.env.DEV");
  });

  test("environment section contains workspace and runtime diagnostics", async () => {
    const source = await readSettingsSource();

    const environmentSection = source.slice(source.indexOf("export function EnvironmentSettingsSection"));

    expect(environmentSection).toContain("WORKSPACE_NAME");
    expect(environmentSection).toContain("isDevAuthBypassEnabled");
    expect(environmentSection).toContain("import.meta.env.DEV");
  });

  test("settings page defaults to profile tab", async () => {
    const source = await readSettingsSource();
    expect(source).toContain('defaultValue="profile"');
    expect(source).toContain('<TabsTrigger value="profile">Profile</TabsTrigger>');
    expect(source).toContain('<TabsTrigger value="environment">Environment</TabsTrigger>');
  });

  test("profile persists full_name and phone via updateUser", async () => {
    const source = await readSettingsSource();
    expect(source).toContain("supabase.auth.updateUser");
    expect(source).toContain("full_name:");
    expect(source).toContain("phone:");
  });

  test("email field remains read-only", async () => {
    const source = await readSettingsSource();
    expect(source).toContain('id="settings-email"');
    expect(source).toContain("readOnly");
    expect(source).toContain("Email is managed by your authentication account.");
  });

  test("password change uses schema validation and updateUser", async () => {
    const source = await readSettingsSource();
    expect(source).toContain("changePasswordSchema");
    expect(source).toContain('updateUser({ password: parsed.data.password })');
    expect(source).toContain("Password updated.");
  });

  test("oauth-only users skip password form via canChangePassword", async () => {
    const source = await readSettingsSource();
    expect(source).toContain("canChangePassword");
    expect(source).toContain(
      "Password changes are not available for accounts that sign in with an external provider.",
    );
  });

  test("account information keeps provider and last sign-in read-only", async () => {
    const source = await readSettingsSource();
    const accountPanel = source.slice(
      source.indexOf("function AccountInformationPanel"),
      source.indexOf("export function ProfileSettingsSection"),
    );

    expect(accountPanel).toContain("resolveAuthProviderLabel");
    expect(accountPanel).toContain("formatLastSignIn");
    expect(accountPanel).not.toContain("<Input");
    expect(accountPanel).not.toContain("<form");
  });

  test("settings pages do not expose secrets or service credentials", async () => {
    const source = await readSettingsSource();
    expect(source).not.toMatch(/service[_-]?role/i);
    expect(source).not.toMatch(/sb_secret/i);
    expect(source).not.toMatch(/GEMINI_API_KEY/);
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe("profile metadata behavior", () => {
  test("full_name loads from metadata for display resolution", () => {
    expect(
      resolveUserDisplayName({
        email: "akbartantu29@gmail.com",
        userMetadata: { full_name: "Akbar Tantu" },
      }),
    ).toBe("Akbar Tantu");
  });

  test("display name falls back to email local-part when full_name is missing", () => {
    expect(
      resolveUserDisplayName({
        email: "akbartantu29@gmail.com",
        userMetadata: {},
      }),
    ).toBe("akbartantu29");
  });

  test("phone metadata normalizes whitespace", () => {
    expect(normalizePhone("  +62 812 3456 7890  ")).toBe("+62 812 3456 7890");
  });

  test("empty phone is allowed", () => {
    expect(normalizePhone("   ")).toBe("");
    expect(isValidPhone("")).toBe(true);
  });

  test("invalid phone values are rejected", () => {
    expect(isValidPhone("not-a-phone")).toBe(false);
    expect(isValidPhone("abc123")).toBe(false);
  });

  test("valid international phone formats are accepted", () => {
    expect(isValidPhone("+1 (555) 123-4567")).toBe(true);
    expect(isValidPhone("+62 812-3456-7890")).toBe(true);
  });
});

describe("password eligibility", () => {
  test("email users can change password", () => {
    expect(canChangePassword({ app_metadata: { provider: "email" } })).toBe(true);
  });

  test("google oauth users cannot change password", () => {
    expect(
      canChangePassword({
        app_metadata: { provider: "google" },
        identities: [{ provider: "google" }],
      }),
    ).toBe(false);
  });
});

describe("sidebar display wiring", () => {
  test("workspace session resolves display name from auth metadata", async () => {
    const source = await Bun.file(workspaceSessionSourcePath).text();
    expect(source).toContain("resolveUserDisplayName");
    expect(source).toContain("user_metadata");
  });
});

describe("password mismatch validation", () => {
  test("changePasswordSchema rejects mismatched passwords", async () => {
    const { changePasswordSchema } = await import("@/lib/auth/auth-schema");
    const parsed = changePasswordSchema.safeParse({
      password: "secret123",
      confirmPassword: "different456",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path[0] === "confirmPassword")).toBe(true);
    }
  });
});
