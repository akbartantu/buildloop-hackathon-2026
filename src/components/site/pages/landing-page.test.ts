import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { translatePublic, publicEn, publicId } from "@/i18n/public-pages";
import { PRICING_PLANS } from "@/lib/pricing-plans";
import { flattenPublicKeys } from "@/i18n/public-pages.test-helpers";

const ROOT = join(import.meta.dir, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("landing page redesign", () => {
  test("landing page renders all major sections", () => {
    const source = readSource("components/site/pages/landing-page.tsx");
    expect(source).toContain("LandingHeroPreview");
    expect(source).toContain("LandingTrustRow");
    expect(source).toContain("LandingLifecycleSteps");
    expect(source).toContain("LandingOutcomeCards");
    expect(source).toContain("LandingTechnologyRow");
    expect(source).toContain("PricingSection");
    expect(source).toContain('id="faq"');
    expect(source).toContain("LandingFinalCta");
  });

  test("primary hero CTA routes to sign-up", () => {
    const source = readSource("components/site/pages/landing-page.tsx");
    expect(source).toContain('to="/auth/sign-up"');
    expect(source).toContain('pt("hero.startFree")');
  });

  test("secondary hero CTA anchors to how-it-works", () => {
    const source = readSource("components/site/pages/landing-page.tsx");
    expect(source).toContain('hash="how-it-works"');
    expect(source).toContain('pt("hero.seeHowItWorks")');
  });

  test("sign in remains available in header and final CTA", () => {
    const header = readSource("components/site/site-header.tsx");
    const landing = readSource("components/site/pages/landing-page.tsx");
    expect(header).toContain('to="/auth"');
    expect(landing).toContain("LandingFinalCta");
  });

  test("language control uses dropdown instead of parallel EN/ID buttons", () => {
    const source = readSource("i18n/language-switcher.tsx");
    expect(source).toContain("DropdownMenu");
    expect(source).toContain("DropdownMenuTrigger");
    expect(source).not.toContain("aria-pressed");
    expect(source).not.toContain("OPTIONS.map((option) => (\n        <button");
  });

  test("language dropdown exposes locale options and current trigger label", () => {
    const source = readSource("i18n/language-switcher.tsx");
    expect(source).toContain("language.english");
    expect(source).toContain("language.indonesian");
    expect(source).toContain("active.shortLabel");
    expect(source).toContain("setLocale(option.locale)");
  });

  test("pricing currency switch remains intact", () => {
    const source = readSource("components/site/pricing-section.tsx");
    expect(source).toContain("pricing-currency-usd");
    expect(source).toContain("pricing-currency-idr");
    expect(source).toContain("plan.prices[currency]");
  });

  test("pricing values remain unchanged in plan catalog", () => {
    expect(PRICING_PLANS[0]?.prices.usd.amount).toBe("$0");
    expect(PRICING_PLANS[2]?.prices.usd.amount).toBe("$4.99");
    expect(PRICING_PLANS[2]?.highlight).toBe(true);
  });

  test("Join Pilot Program CTA remains absent", () => {
    const landing = readSource("components/site/pages/landing-page.tsx");
    expect(landing).not.toContain("WaitlistForm");
    expect(landing).not.toContain('id="pilot"');
    expect(landing).not.toContain("pilot.title");
  });

  test("FAQ accordion remains on landing page", () => {
    const source = readSource("components/site/pages/landing-page.tsx");
    expect(source).toContain("<Accordion");
    expect(source).toContain("AccordionTrigger");
  });

  test("PASS / FAILED / BLOCKED outcome cards render", () => {
    const source = readSource("components/site/landing-outcome-cards.tsx");
    expect(source).toContain('key: "pass"');
    expect(source).toContain('key: "failed"');
    expect(source).toContain('key: "blocked"');
    expect(source).toContain("border-status-pass");
    expect(source).toContain("border-destructive");
    expect(source).toContain("border-status-blocked");
  });

  test("technology section only shows supported stack without Pub/Sub", () => {
    const source = readSource("components/site/landing-technology-row.tsx");
    expect(source).toContain("gemini");
    expect(source).toContain("googleAdk");
    expect(source).toContain("cloudRun");
    expect(source).toContain("firestore");
    expect(source).not.toContain("pubsub");
    expect(source).not.toContain("Pub/Sub");
  });

  test("landing CTAs use real routes only", () => {
    const landing = readSource("components/site/pages/landing-page.tsx");
    const header = readSource("components/site/site-header.tsx");
    for (const source of [landing, header]) {
      expect(source).not.toContain('to="/demo"');
      expect(source).not.toContain("Book a demo");
    }
    expect(landing).toMatch(/to="\/auth\/sign-up"/);
    expect(header).toContain('to: "/docs"');
  });

  test("EN and ID landing hero copy renders correctly", () => {
    expect(translatePublic("en", "hero.titleLine1")).toBe("Ship software tasks autonomously.");
    expect(translatePublic("id", "hero.titleLine1")).toBe("Kirim task perangkat lunak secara otonom.");
    expect(translatePublic("en", "hero.startFree")).toBe("Start for free");
    expect(translatePublic("id", "hero.startFree")).toBe("Mulai gratis");
  });

  test("new public landing keys exist in EN and ID catalogs", () => {
    const enKeys = flattenPublicKeys(publicEn);
    const idKeys = flattenPublicKeys(publicId);
    expect(enKeys.sort()).toEqual(idKeys.sort());
    for (const key of ["heroPreview.runLabel", "trust.t1Title", "technology.title", "finalCta.title"]) {
      expect(translatePublic("en", key)).not.toBe(key);
      expect(translatePublic("id", key)).not.toBe(key);
    }
  });

  test("public FAQ does not mention pilot or waitlist", () => {
    const faqKeys = ["q1", "a1", "q2", "a2", "q3", "a3", "q4", "a4", "q5", "a5"] as const;
    for (const key of faqKeys) {
      const en = translatePublic("en", `faq.${key}`);
      const id = translatePublic("id", `faq.${key}`);
      expect(en.toLowerCase()).not.toContain("pilot");
      expect(en.toLowerCase()).not.toContain("waitlist");
      expect(id.toLowerCase()).not.toContain("pilot");
      expect(id.toLowerCase()).not.toContain("waitlist");
    }
    expect(translatePublic("en", "faq.q4")).toBe("What does BuildLoop support today?");
    expect(translatePublic("id", "faq.q4")).toBe("Apa yang didukung BuildLoop saat ini?");
  });

  test("mobile layout avoids intentional horizontal overflow patterns", () => {
    const lifecycle = readSource("components/site/landing-lifecycle-steps.tsx");
    expect(lifecycle).toContain("overflow-x-auto");
    expect(lifecycle).toContain("lg:grid");
    const header = readSource("components/site/site-header.tsx");
    expect(header).toContain("lg:hidden");
  });
});
