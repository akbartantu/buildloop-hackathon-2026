import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_LOCALE, resolveInitialLocale, translate, persistLocale } from "@/i18n";
import { translatePublic, publicEn, publicId } from "@/i18n/public-pages";
import { flattenPublicKeys } from "@/i18n/public-pages.test-helpers";

const ROOT = join(import.meta.dir, "..");

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const ID_LEAKS_IN_EN_PUBLIC = [
  "Cara Kerja",
  "Gabung Pilot",
  "Masuk",
  "Daftar",
  "Contoh ilustratif",
  "Batas yang disetujui",
  "Pertanyaan yang sering muncul",
];

const EN_LEAKS_IN_ID_PUBLIC = [
  "How it works",
  "Join the BuildLoop pilot",
  "Sign in",
  "Sign up",
  "Illustrative example",
  "Approved boundary",
  "Common questions",
];

describe("bilingual audit", () => {
  test("English is the default locale", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(translate("en", "home.title")).not.toBe(translate("id", "home.title"));
  });

  test("locale persistence uses buildloop.locale", () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
        },
      },
    });

    persistLocale("id");
    expect(resolveInitialLocale()).toBe("id");
    persistLocale("en");
    expect(resolveInitialLocale()).toBe("en");

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  test("landing page public copy has EN and ID coverage", () => {
    const enKeys = flattenPublicKeys(publicEn);
    const idKeys = flattenPublicKeys(publicId);
    expect(enKeys.sort()).toEqual(idKeys.sort());

    for (const key of enKeys) {
      expect(translatePublic("en", key).length).toBeGreaterThan(0);
      expect(translatePublic("id", key).length).toBeGreaterThan(0);
      expect(translatePublic("en", key)).not.toBe(key);
    }
  });

  test("landing page exposes language switcher in site header", () => {
    const header = readSource("components/site/site-header.tsx");
    expect(header).toContain("LanguageSwitcher");
  });

  test("authenticated shell exposes language switcher", () => {
    const layout = readSource("components/site/app-layout.tsx");
    expect(layout).toContain("LanguageSwitcher");
  });

  test("auth sign-in and sign-up expose language switcher", () => {
    expect(readSource("routes/auth/index.tsx")).toContain("LanguageSwitcher");
    expect(readSource("routes/auth/sign-up.tsx")).toContain("LanguageSwitcher");
  });

  test("English public hero has no known Indonesian leaks", () => {
    for (const leak of ID_LEAKS_IN_EN_PUBLIC) {
      expect(translatePublic("en", "hero.titleLine1")).not.toContain(leak);
      expect(translatePublic("en", "header.signIn")).not.toBe("Masuk");
      expect(translatePublic("en", "pilot.submit")).not.toBe("Gabung Pilot");
    }
    expect(translatePublic("en", "hero.titleLine1")).toBe("AI can build.");
  });

  test("Indonesian public hero has no known English-only leaks where translation is expected", () => {
    for (const leak of EN_LEAKS_IN_ID_PUBLIC) {
      expect(translatePublic("id", "hero.titleLine1")).not.toContain(leak);
    }
    expect(translatePublic("id", "hero.titleLine1")).toBe("AI boleh membangun.");
  });

  test("raw internal task statuses are not shown as normal user labels", () => {
    expect(translate("en", "status.task.APPROVED_FOR_EXECUTION")).not.toBe("APPROVED_FOR_EXECUTION");
    expect(translate("en", "status.task.AWAITING_APPROVAL")).not.toBe("AWAITING_APPROVAL");
    expect(translate("id", "status.task.APPROVED_FOR_EXECUTION")).not.toBe("APPROVED_FOR_EXECUTION");
  });

  test("legal pages resolve in EN and ID", () => {
    expect(translate("en", "legal.privacy.title")).toBe("Privacy Policy");
    expect(translate("id", "legal.privacy.title")).toBe("Kebijakan Privasi");
    expect(translate("en", "legal.cookies.title")).toContain("Cookie");
    expect(translate("id", "legal.cookies.title")).toContain("Cookie");
    expect(translate("en", "legal.security.title")).toContain("Security");
    expect(translate("id", "legal.security.title").length).toBeGreaterThan(0);
  });

  test("product tour resolves in EN and ID", () => {
    expect(translate("en", "productTour.replay")).toBe("Replay product tour");
    expect(translate("id", "productTour.replay")).toBe("Putar ulang product tour");
    expect(translate("en", "productTour.skip")).toBe("Skip tour");
    expect(translate("id", "productTour.skip")).toBe("Lewati tour");
  });

  test("public marketing components use locale hooks instead of hardcoded Indonesian nav", () => {
    const landing = readSource("components/site/pages/landing-page.tsx");
    expect(landing).toContain("usePublicI18n");
    expect(landing).not.toContain("Cara Kerja");

    const header = readSource("components/site/site-header.tsx");
    expect(header).toContain("usePublicI18n");
    expect(header).not.toContain('"Cara Kerja"');
    expect(header).toContain('hash: "how-it-works"');
  });

  test("static scan: key public routes avoid hardcoded Indonesian prose", () => {
    const docs = readSource("routes/docs.tsx");
    const terms = readSource("routes/terms.tsx");
    const index = readSource("routes/index.tsx");

    expect(docs).toContain("usePublicI18n");
    expect(terms).toContain("usePublicI18n");
    expect(index).toContain("LandingPage");
    expect(docs).not.toContain("Dokumentasi BuildLoop");
    expect(terms).not.toContain("Status layanan");
  });
});
