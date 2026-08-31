import { describe, expect, test } from "bun:test";

import { translate } from "@/i18n";
import {
  DOCUMENTED_BROWSER_STORAGE_KEYS,
  LEGAL_PAGE_SECTIONS,
  legalSectionHeadingKey,
  legalSectionParagraphKey,
} from "@/lib/legal/legal-page-config";
import { SECURITY_HEADERS } from "@/lib/http-security-headers";

const SECRET_PATTERNS = [
  /sb_secret/i,
  /GEMINI_API_KEY=/,
  /SUPABASE_SERVICE_ROLE_KEY=/,
  /sk-[a-zA-Z0-9]{10,}/,
];

const EN_LEAKS_IN_ID = [
  "Information we may process",
  "Why we use this information",
  "Choose your workspace",
];

const ID_LEAKS_IN_EN = [
  "Informasi yang mungkin kami proses",
  "Tujuan pemrosesan",
  "Pilih workspace Anda",
];

describe("legal content EN", () => {
  test("privacy policy includes core disclosures", () => {
    expect(translate("en", "legal.privacy.title")).toBe("Privacy Policy");
    expect(translate("en", "legal.privacy.sections.ai.heading")).toContain("Gemini");
    expect(translate("en", "legal.privacy.sections.github.p1")).toContain("public GitHub");
    expect(translate("en", "legal.privacy.sections.specifications.p2")).toContain("credentials");
    expect(translate("en", "legal.privacy.sections.international.p1")).not.toMatch(/certified compliant/i);
  });

  test("cookie policy states no advertising tracking", () => {
    expect(translate("en", "legal.cookies.sections.noTracking.p1")).toContain(
      "does not load third-party advertising",
    );
    expect(translate("en", "legal.cookies.sections.overview.p2")).toContain(
      "does not show a blocking cookie-consent banner",
    );
  });

  test("security overview avoids certification claims", () => {
    expect(translate("en", "legal.security.sections.limitations.p1")).toContain("public GitHub");
    expect(translate("en", "legal.security.sections.overview.p2")).not.toMatch(/SOC 2 certified/i);
    expect(translate("en", "legal.security.sections.governance.p1")).toContain("least privilege");
  });
});

describe("legal content ID", () => {
  test("privacy policy is translated naturally", () => {
    expect(translate("id", "legal.privacy.title")).toBe("Kebijakan Privasi");
    expect(translate("id", "legal.privacy.sections.collected.heading")).toContain("Informasi");
    expect(translate("id", "legal.privacy.sections.international.p1")).toContain("UU PDP");
    expect(translate("id", "legal.privacy.sections.international.p1")).not.toMatch(/certified/i);
  });

  test("cookie and security pages exist in Indonesian", () => {
    expect(translate("id", "legal.cookies.title")).toContain("Cookie");
    expect(translate("id", "legal.security.sections.reporting.heading")).toContain("keamanan");
  });
});

describe("legal content hygiene", () => {
  for (const pageId of ["privacy", "cookies", "security"] as const) {
    test(`${pageId} sections resolve in EN and ID without secret leaks`, () => {
      for (const section of LEGAL_PAGE_SECTIONS[pageId]) {
        const headingEn = translate("en", legalSectionHeadingKey(pageId, section.id));
        const headingId = translate("id", legalSectionHeadingKey(pageId, section.id));
        for (const pattern of SECRET_PATTERNS) {
          expect(headingEn).not.toMatch(pattern);
          expect(headingId).not.toMatch(pattern);
        }

        for (let index = 1; index <= section.paragraphCount; index += 1) {
          const key = legalSectionParagraphKey(pageId, section.id, index);
          const en = translate("en", key);
          const id = translate("id", key);
          expect(en.length).toBeGreaterThan(20);
          expect(id.length).toBeGreaterThan(20);
          for (const pattern of SECRET_PATTERNS) {
            expect(en).not.toMatch(pattern);
            expect(id).not.toMatch(pattern);
          }
          for (const leak of ID_LEAKS_IN_EN) {
            expect(en).not.toContain(leak);
          }
          for (const leak of EN_LEAKS_IN_ID) {
            expect(id).not.toContain(leak);
          }
        }
      }
    });
  }

  test("documented browser storage keys match policy references", () => {
    const cookiesText = translate("en", "legal.cookies.sections.preferences.p1");
    expect(cookiesText).toContain("buildloop.locale");
    expect(cookiesText).toContain("buildloop.activeProjectId");
    expect(DOCUMENTED_BROWSER_STORAGE_KEYS.length).toBeGreaterThanOrEqual(4);
  });
});

describe("security headers", () => {
  test("defines safe baseline headers", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
  });
});

describe("footer and settings privacy links", () => {
  test("footer labels are localized", () => {
    expect(translate("en", "footer.cookies")).toBe("Cookies");
    expect(translate("id", "footer.cookies")).toBe("Cookie");
    expect(translate("en", "footer.security")).toBe("Security");
    expect(translate("id", "footer.security")).toBe("Keamanan");
  });

  test("settings privacy section links to legal pages", async () => {
    const source = await Bun.file(
      new URL("../../components/site/pages/settings-pages.tsx", import.meta.url),
    ).text();
    expect(source).toContain('to="/privacy"');
    expect(source).toContain('to="/cookies"');
    expect(source).toContain('to="/security"');
    expect(source).toContain("settings.privacy.title");
  });

  test("upload and task notices exist in both languages", () => {
    expect(translate("en", "specifications.uploadPrivacyNotice")).toContain("Do not upload");
    expect(translate("id", "specifications.uploadPrivacyNotice")).toContain("Jangan unggah");
    expect(translate("en", "tasks.goalPrivacyHint")).toContain("secrets");
    expect(translate("id", "tasks.goalPrivacyHint")).toContain("secret");
  });
});
