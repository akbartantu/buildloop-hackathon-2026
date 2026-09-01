import { SectionHeading } from "@/components/site/section-heading";
import { usePublicI18n } from "@/i18n/use-public-i18n";

const STEP_KEYS = [
  "taskGoal",
  "contract",
  "worker",
  "checker",
  "correction",
  "decision",
  "approval",
  "delivery",
] as const;

export function LandingLifecycleSteps() {
  const { pt } = usePublicI18n();

  return (
    <section id="how-it-works" aria-labelledby="how-it-works-heading" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow={pt("howItWorks.eyebrow")}
          title={<span id="how-it-works-heading">{pt("howItWorks.title")}</span>}
          description={pt("howItWorks.description")}
        />

        <ol className="mt-10 flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0 xl:grid-cols-8">
          {STEP_KEYS.map((key, index) => (
            <li key={key} className="relative min-w-[9.5rem] flex-1 lg:min-w-0">
              <div className="flex h-full flex-col rounded-lg border border-border bg-card p-4">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 text-sm font-semibold text-foreground">
                  {pt(`howItWorks.steps.${key}.title`)}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {pt(`howItWorks.steps.${key}.text`)}
                </p>
              </div>
              {index < STEP_KEYS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute right-0 top-1/2 hidden h-px w-4 translate-x-full bg-border lg:block xl:w-3"
                />
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
