import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { SectionHeading } from "@/components/site/section-heading";
import { usePublicI18n } from "@/i18n/use-public-i18n";
import { cn } from "@/lib/utils";

const OUTCOMES = [
  { key: "pass" as const, icon: CheckCircle2, tone: "border-status-pass/30 bg-status-pass/5" },
  { key: "failed" as const, icon: XCircle, tone: "border-destructive/30 bg-destructive/5" },
  { key: "blocked" as const, icon: AlertTriangle, tone: "border-status-blocked/30 bg-status-blocked/5" },
];

const POINT_KEYS = ["p1", "p2", "p3", "p4"] as const;

export function LandingOutcomeCards() {
  const { pt } = usePublicI18n();

  return (
    <section aria-labelledby="outcomes-heading" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow={pt("outcomes.eyebrow")}
          title={<span id="outcomes-heading">{pt("outcomes.title")}</span>}
          description={pt("outcomes.description")}
        />

        <ul className="mt-10 grid gap-5 lg:grid-cols-3">
          {OUTCOMES.map(({ key, icon: Icon, tone }) => (
            <li
              key={key}
              className={cn("rounded-xl border p-6", tone)}
            >
              <div className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-foreground" aria-hidden="true" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground">
                  {pt(`outcomes.${key}.title`)}
                </h3>
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">{pt(`outcomes.${key}.subtitle`)}</p>
              <ul className="mt-4 space-y-2">
                {POINT_KEYS.map((pointKey) => {
                  const label = pt(`outcomes.${key}.${pointKey}`);
                  if (!label || label === `outcomes.${key}.${pointKey}`) return null;
                  return (
                    <li key={pointKey} className="flex gap-2 text-sm text-muted-foreground">
                      <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
