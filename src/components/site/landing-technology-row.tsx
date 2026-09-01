import { SectionHeading } from "@/components/site/section-heading";
import { usePublicI18n } from "@/i18n/use-public-i18n";

const TECH_KEYS = ["gemini", "googleAdk", "cloudRun", "firestore"] as const;

export function LandingTechnologyRow() {
  const { pt } = usePublicI18n();

  return (
    <section aria-labelledby="technology-heading" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow={pt("technology.eyebrow")}
          title={<span id="technology-heading">{pt("technology.title")}</span>}
          description={pt("technology.description")}
        />

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TECH_KEYS.map((key) => (
            <li
              key={key}
              className="rounded-lg border border-border bg-card px-5 py-4"
            >
              <h3 className="text-sm font-semibold text-foreground">{pt(`technology.items.${key}.name`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {pt(`technology.items.${key}.description`)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
