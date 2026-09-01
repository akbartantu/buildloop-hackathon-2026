import { describe, expect, test } from "bun:test";

import { pricingCurrencyToggleItemClassName } from "@/components/site/pricing-section";

const landingSourcePath = new URL("./pages/landing-page.tsx", import.meta.url);
const pricingSourcePath = new URL("./pricing-section.tsx", import.meta.url);

async function readSource(path: URL) {
  return Bun.file(path).text();
}

describe("pricing currency toggle", () => {
  test("USD and IDR toggles use distinct active styling classes", async () => {
    const source = await readSource(pricingSourcePath);

    expect(source).toContain("pricingCurrencyToggleItemClassName");
    expect(pricingCurrencyToggleItemClassName).toContain("data-[state=on]:bg-primary");
    expect(pricingCurrencyToggleItemClassName).toContain("data-[state=on]:text-primary-foreground");
    expect(pricingCurrencyToggleItemClassName).toContain("text-muted-foreground");
    expect(source).not.toContain("data-[state=on]:bg-background");
  });

  test("active currency exposes accessible selected semantics", async () => {
    const source = await readSource(pricingSourcePath);
    expect(source).toContain('aria-selected={currency === "usd"}');
    expect(source).toContain('aria-selected={currency === "idr"}');
    expect(source).toContain("focus-visible:ring-2");
    expect(source).toContain('data-testid="pricing-currency-usd"');
    expect(source).toContain('data-testid="pricing-currency-idr"');
  });

  test("switching currency still updates pricing from plan catalog", async () => {
    const source = await readSource(pricingSourcePath);
    expect(source).toContain("plan.prices[currency]");
    expect(source).toContain('setCurrency(value)');
    expect(source).toContain('value="usd"');
    expect(source).toContain('value="idr"');
  });

  test("currency toggle keeps responsive layout classes", async () => {
    const source = await readSource(pricingSourcePath);
    expect(source).toContain("shrink-0 self-start");
    expect(source).toContain("sm:self-auto");
  });
});

describe("pilot program CTA visibility", () => {
  test("Join Pilot Program section and waitlist form are not rendered on landing page", async () => {
    const source = await readSource(landingSourcePath);
    expect(source).not.toContain("WaitlistForm");
    expect(source).not.toContain('id="pilot"');
    expect(source).not.toContain("pilot.title");
    expect(source).not.toContain("pilot.limitRepo");
    expect(source).not.toContain("waitlist.submit");
  });

  test("pricing flows directly into FAQ without pilot spacing gap", async () => {
    const source = await readSource(landingSourcePath);
    expect(source).toContain("<PricingSection />");
    expect(source).toContain('<section id="faq">');
    expect(source).not.toMatch(/PricingSection[\s\S]*pilot[\s\S]*faq/);
  });
});

describe("pricing EN/ID labels", () => {
  test("public pricing strings remain available in EN and ID catalogs", () => {
    const { translatePublic } = require("@/i18n/public-pages") as typeof import("@/i18n/public-pages");
    expect(translatePublic("en", "pricing.currencyUsd")).toBe("USD ($)");
    expect(translatePublic("id", "pricing.currencyIdr")).toBe("IDR (Rp)");
    expect(translatePublic("en", "pricing.plans.builder.name")).toBe("Builder");
    expect(translatePublic("id", "pricing.plans.builder.name")).toBe("Builder");
  });
});
