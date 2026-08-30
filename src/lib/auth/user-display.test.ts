import { describe, expect, test } from "bun:test";
import {
  formatLastSignIn,
  normalizeFullName,
  resolveAuthProviderLabel,
  resolveUserDisplayName,
} from "@/lib/auth/user-display";

describe("resolveUserDisplayName", () => {
  test("prefers full_name when available", () => {
    expect(
      resolveUserDisplayName({
        email: "akbartantu29@gmail.com",
        userMetadata: { full_name: "Akbar Tantu" },
      }),
    ).toBe("Akbar Tantu");
  });

  test("falls back to email local-part when full_name is missing", () => {
    expect(
      resolveUserDisplayName({
        email: "akbartantu29@gmail.com",
        userMetadata: {},
      }),
    ).toBe("akbartantu29");
  });

  test("uses OAuth name before email local-part", () => {
    expect(
      resolveUserDisplayName({
        email: "akbartantu29@gmail.com",
        userMetadata: { name: "Akbar From Google" },
      }),
    ).toBe("Akbar From Google");
  });
});

describe("resolveAuthProviderLabel", () => {
  test("labels email provider", () => {
    expect(resolveAuthProviderLabel({ app_metadata: { provider: "email" } })).toBe("Email");
  });

  test("labels google provider", () => {
    expect(resolveAuthProviderLabel({ identities: [{ provider: "google" }] })).toBe("Google");
  });
});

describe("formatLastSignIn", () => {
  test("returns dash for missing values", () => {
    expect(formatLastSignIn(undefined)).toBe("—");
  });
});

describe("normalizeFullName", () => {
  test("trims and collapses whitespace", () => {
    expect(normalizeFullName("  Akbar   Tantu  ")).toBe("Akbar Tantu");
  });
});

describe("signup metadata wiring", () => {
  test("sign-up route stores full_name in auth.signUp metadata", async () => {
    const source = await Bun.file(new URL("../../routes/auth/sign-up.tsx", import.meta.url)).text();
    expect(source).toContain("full_name:");
    expect(source).toContain("normalizeFullName(parsed.data.fullName)");
  });
});

describe("settings profile wiring", () => {
  test("settings page updates auth metadata via updateUser", async () => {
    const source = await Bun.file(
      new URL("../../components/site/pages/settings-pages.tsx", import.meta.url),
    ).text();

    expect(source).toContain("supabase.auth.updateUser");
    expect(source).toContain("full_name:");
    expect(source).toContain("readOnly");
  });
});
