import { describe, expect, test } from "bun:test";

import { PRICING_PLANS } from "@/lib/pricing-plans";

describe("pricing plans", () => {
  test("defines four plans in display order", () => {
    expect(PRICING_PLANS.map((plan) => plan.id)).toEqual(["free", "oneoff", "builder", "pro"]);
  });

  test("builder plan is highlighted", () => {
    expect(PRICING_PLANS.find((plan) => plan.id === "builder")?.highlight).toBe(true);
  });

  test("usd and idr prices exist for every plan", () => {
    for (const plan of PRICING_PLANS) {
      expect(plan.prices.usd.amount.length).toBeGreaterThan(0);
      expect(plan.prices.idr.amount.length).toBeGreaterThan(0);
    }
  });

  test("only free plan links to sign up", () => {
    expect(PRICING_PLANS.filter((plan) => plan.cta === "start-free")).toHaveLength(1);
    expect(PRICING_PLANS.filter((plan) => plan.cta === "coming-soon")).toHaveLength(3);
  });
});

describe("pricing landing integration", () => {
  test("landing page includes pricing section and hides pilot waitlist CTA", async () => {
    const landing = await Bun.file(
      new URL("../components/site/pages/landing-page.tsx", import.meta.url),
    ).text();
    const header = await Bun.file(
      new URL("../components/site/site-header.tsx", import.meta.url),
    ).text();

    expect(landing).toContain("PricingSection");
    expect(landing).not.toContain("WaitlistForm");
    expect(landing).not.toContain('id="pilot"');
    expect(header).toContain('hash: "pricing"');
  });

  test("public pricing strings exist in EN and ID catalogs", () => {
    const { translatePublic } = require("@/i18n/public-pages") as typeof import("@/i18n/public-pages");
    expect(translatePublic("en", "pricing.title")).toContain("Simple pricing");
    expect(translatePublic("id", "pricing.plans.builder.name")).toBe("Builder");
    expect(translatePublic("en", "pricing.comingSoonHint")).toBe("Coming soon");
  });
});
