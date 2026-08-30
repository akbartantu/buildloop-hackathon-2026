import { describe, expect, test } from "bun:test";
import {
  canChangePassword,
  formatLastSignIn,
  isValidPhone,
  normalizeFullName,
  normalizePhone,
  resolveAuthProviderLabel,
  resolveProfileFullName,
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

describe("resolveProfileFullName", () => {
  test("prefers user-edited full_name over OAuth name", () => {
    expect(
      resolveProfileFullName({
        full_name: "Saved Name",
        name: "Google Name",
      }),
    ).toBe("Saved Name");
  });

  test("prefills from OAuth name when full_name is missing", () => {
    expect(resolveProfileFullName({ name: "Akbar From Google" })).toBe("Akbar From Google");
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

describe("normalizePhone", () => {
  test("trims surrounding whitespace", () => {
    expect(normalizePhone("  +62 812 3456 7890  ")).toBe("+62 812 3456 7890");
  });
});

describe("isValidPhone", () => {
  test("allows empty phone", () => {
    expect(isValidPhone("")).toBe(true);
  });

  test("rejects invalid characters", () => {
    expect(isValidPhone("phone#123")).toBe(false);
  });
});

describe("canChangePassword", () => {
  test("returns true for email provider accounts", () => {
    expect(canChangePassword({ app_metadata: { provider: "email" } })).toBe(true);
  });

  test("returns false for google-only accounts", () => {
    expect(canChangePassword({ identities: [{ provider: "google" }] })).toBe(false);
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
    expect(source).toContain("resolveProfileFullName");
    expect(source).toContain("full_name:");
    expect(source).toContain("phone:");
    expect(source).toContain("readOnly");
  });
});
