import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SectionHeading } from "@/components/site/section-heading";
import { usePublicI18n } from "@/i18n/use-public-i18n";
import {
  PRICING_FEATURE_KEYS,
  PRICING_PLANS,
  type PricingCurrency,
  type PricingPlanId,
} from "@/lib/pricing-plans";
import { cn } from "@/lib/utils";

export const pricingCurrencyToggleItemClassName =
  "min-w-[5.5rem] rounded-md px-3 font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm";

function planFeatureKeys(planId: PricingPlanId): readonly string[] {
  switch (planId) {
    case "free":
      return ["f1", "f2", "f3", "f4"];
    case "oneoff":
      return ["f1", "f2", "f3", "f4"];
    case "builder":
      return ["f1", "f2", "f3", "f4", "f5"];
    case "pro":
      return ["f1", "f2", "f3", "f4", "f5"];
    default:
      return PRICING_FEATURE_KEYS;
  }
}

export function PricingSection() {
  const { pt } = usePublicI18n();
  const [currency, setCurrency] = useState<PricingCurrency>("usd");
  const [comingSoonNotice, setComingSoonNotice] = useState<PricingPlanId | null>(null);

  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            eyebrow={pt("pricing.eyebrow")}
            title={<span id="pricing-heading">{pt("pricing.title")}</span>}
            description={pt("pricing.description")}
          />
          <ToggleGroup
            type="single"
            value={currency}
            onValueChange={(value) => {
              if (value === "usd" || value === "idr") {
                setCurrency(value);
              }
            }}
            aria-label={pt("pricing.currencyLabel")}
            className="shrink-0 self-start rounded-lg border border-border bg-muted/30 p-1 sm:self-auto"
            size="sm"
          >
            <ToggleGroupItem
              value="usd"
              data-testid="pricing-currency-usd"
              aria-selected={currency === "usd"}
              className={pricingCurrencyToggleItemClassName}
            >
              {pt("pricing.currencyUsd")}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="idr"
              data-testid="pricing-currency-idr"
              aria-selected={currency === "idr"}
              className={pricingCurrencyToggleItemClassName}
            >
              {pt("pricing.currencyIdr")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {PRICING_PLANS.map((plan) => {
            const price = plan.prices[currency];
            const features = planFeatureKeys(plan.id);

            return (
              <Card
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-xl border shadow-none",
                  plan.highlight
                    ? "border-foreground/25 bg-card ring-1 ring-foreground/10"
                    : "border-border bg-card",
                )}
              >
                <CardHeader className="space-y-3 p-5 pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {pt(`pricing.plans.${plan.id}.name`)}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {pt(`pricing.plans.${plan.id}.target`)}
                      </p>
                    </div>
                    {plan.highlight ? (
                      <Badge variant="secondary" className="shrink-0 font-mono text-[10px] uppercase tracking-wide">
                        {pt("pricing.mostPopular")}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="pt-1">
                    <p className="text-2xl font-semibold tracking-tight text-foreground">
                      {price.amount}
                      {price.suffix ? (
                        <span className="text-sm font-normal text-muted-foreground">{price.suffix}</span>
                      ) : null}
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 p-5 pt-4">
                  <ul className="space-y-2.5">
                    {features.map((featureKey) => {
                      const label = pt(`pricing.plans.${plan.id}.${featureKey}`);
                      if (!label || label === `pricing.plans.${plan.id}.${featureKey}`) {
                        return null;
                      }
                      return (
                        <li key={featureKey} className="flex gap-2 text-sm text-muted-foreground">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden="true" />
                          <span>{label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>

                <CardFooter className="flex-col items-stretch gap-2 p-5 pt-0">
                  {plan.cta === "start-free" ? (
                    <Button asChild className="w-full">
                      <Link to="/auth/sign-up">{pt(`pricing.plans.${plan.id}.cta`)}</Link>
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant={plan.highlight ? "default" : "outline"}
                        className="w-full"
                        onClick={() => setComingSoonNotice(plan.id)}
                      >
                        {pt(`pricing.plans.${plan.id}.cta`)}
                      </Button>
                      <p className="text-center text-[11px] text-muted-foreground">
                        {pt("pricing.comingSoonHint")}
                      </p>
                      {comingSoonNotice === plan.id ? (
                        <p className="text-center text-xs text-muted-foreground" role="status" aria-live="polite">
                          {pt("pricing.comingSoonDetail")}
                        </p>
                      ) : null}
                    </>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
