export type PricingCurrency = "usd" | "idr";

export type PricingPlanId = "free" | "oneoff" | "builder" | "pro";

export type PricingPlanDefinition = {
  id: PricingPlanId;
  highlight?: boolean;
  prices: Record<
    PricingCurrency,
    {
      amount: string;
      suffix?: string;
    }
  >;
  cta: "start-free" | "coming-soon";
};

export const PRICING_PLANS: readonly PricingPlanDefinition[] = [
  {
    id: "free",
    prices: {
      usd: { amount: "$0" },
      idr: { amount: "Rp0" },
    },
    cta: "start-free",
  },
  {
    id: "oneoff",
    prices: {
      usd: { amount: "$0.99", suffix: "/ governed run" },
      idr: { amount: "Rp15.000", suffix: "/ governed run" },
    },
    cta: "coming-soon",
  },
  {
    id: "builder",
    highlight: true,
    prices: {
      usd: { amount: "$4.99", suffix: "/ month" },
      idr: { amount: "Rp79.000", suffix: "/ month" },
    },
    cta: "coming-soon",
  },
  {
    id: "pro",
    prices: {
      usd: { amount: "$12.99", suffix: "/ month" },
      idr: { amount: "Rp199.000", suffix: "/ month" },
    },
    cta: "coming-soon",
  },
] as const;

export const PRICING_FEATURE_KEYS = ["f1", "f2", "f3", "f4", "f5"] as const;
