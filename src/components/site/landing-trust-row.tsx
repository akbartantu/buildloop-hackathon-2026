import { ShieldCheck, Sparkles, UserCheck, Cloud } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePublicI18n } from "@/i18n/use-public-i18n";

const ITEMS: Array<{ key: "t1" | "t2" | "t3" | "t4"; icon: LucideIcon }> = [
  { key: "t1", icon: ShieldCheck },
  { key: "t2", icon: Sparkles },
  { key: "t3", icon: UserCheck },
  { key: "t4", icon: Cloud },
];

export function LandingTrustRow() {
  const { pt } = usePublicI18n();

  return (
    <section aria-labelledby="trust-heading" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 id="trust-heading" className="sr-only">
          {pt("trust.title")}
        </h2>
        <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(({ key, icon: Icon }) => (
            <li key={key} className="space-y-2">
              <Icon className="size-5 text-foreground" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-foreground">{pt(`trust.${key}Title`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{pt(`trust.${key}Text`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
