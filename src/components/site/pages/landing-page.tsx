import { Link } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CheckPreview } from "@/components/site/check-preview";
import { SectionHeading } from "@/components/site/section-heading";
import { ScopeBoundary } from "@/components/site/scope-boundary";
import { LifecycleRailCompact, LifecycleRailDetailed } from "@/components/site/lifecycle-rail";
import { PricingSection } from "@/components/site/pricing-section";
import { WaitlistForm } from "@/components/site/waitlist-form";
import { usePublicI18n, usePublicPageMeta } from "@/i18n/use-public-i18n";

export function LandingPage() {
  const { pt } = usePublicI18n();
  usePublicPageMeta("meta.title", "meta.description");

  const problems = [
    { title: pt("problems.p1Title"), text: pt("problems.p1Text") },
    { title: pt("problems.p2Title"), text: pt("problems.p2Text") },
    { title: pt("problems.p3Title"), text: pt("problems.p3Text") },
  ];

  const features = [
    { title: pt("features.f1Title"), text: pt("features.f1Text") },
    { title: pt("features.f2Title"), text: pt("features.f2Text") },
    { title: pt("features.f3Title"), text: pt("features.f3Text") },
  ];

  const faq = [
    { q: pt("faq.q1"), a: pt("faq.a1") },
    { q: pt("faq.q2"), a: pt("faq.a2") },
    { q: pt("faq.q3"), a: pt("faq.a3") },
    { q: pt("faq.q4"), a: pt("faq.a4") },
    { q: pt("faq.q5"), a: pt("faq.a5") },
  ];

  return (
    <div>
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-14">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {pt("hero.eyebrow")}
              </p>
              <h1 className="mt-5 text-3xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-[2.6rem]">
                {pt("hero.titleLine1")}
                <br />
                {pt("hero.titleLine2")}
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {pt("hero.subtitle")}
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  to="/auth/sign-up"
                  className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  {pt("hero.signUp")}
                </Link>
                <Link
                  to="/auth"
                  className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {pt("hero.signIn")}
                </Link>
                <Link
                  to="/docs"
                  className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {pt("hero.readDocs")}
                </Link>
              </div>
            </div>

            <ScopeBoundary />
          </div>

          <LifecycleRailCompact className="mt-10 border-t border-border pt-5" />
        </div>
      </section>

      <section aria-labelledby="ledger-heading" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6 sm:pt-14">
          <SectionHeading
            eyebrow={pt("evidence.eyebrow")}
            title={<span id="ledger-heading">{pt("evidence.title")}</span>}
            description={pt("evidence.description")}
          />
        </div>
        <div className="mt-8 sm:mt-10">
          <CheckPreview />
        </div>
      </section>

      <section id="how-it-works" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <SectionHeading
            eyebrow={pt("howItWorks.eyebrow")}
            title={pt("howItWorks.title")}
            description={pt("howItWorks.description")}
          />
          <LifecycleRailDetailed className="mt-8" />
        </div>
      </section>

      <section id="problems" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <SectionHeading eyebrow={pt("problems.eyebrow")} title={pt("problems.title")} />
          <div className="mt-8">
            {problems.map((problem, index) => (
              <article
                key={problem.title}
                className="grid grid-cols-[auto_1fr] gap-x-5 border-t border-border py-5 last:border-b sm:gap-x-8"
              >
                <span className="font-mono text-[11px] text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{problem.title}</h3>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {problem.text}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <SectionHeading
            eyebrow={pt("features.eyebrow")}
            title={pt("features.title")}
            description={pt("features.description")}
          />
          <div className="mt-8">
            {features.map((feature, index) => (
              <article
                key={feature.title}
                className="grid grid-cols-[auto_1fr] gap-x-5 border-t border-border py-5 last:border-b sm:gap-x-8"
              >
                <span className="font-mono text-[11px] text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-mono text-sm text-foreground">{feature.title}</h3>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {feature.text}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <PricingSection />

      <section id="pilot" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {pt("pilot.title")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {pt("pilot.description")}
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-muted-foreground">
            <li>{pt("pilot.limitRepo")}</li>
            <li>{pt("pilot.limitTask")}</li>
            <li>{pt("pilot.limitContract")}</li>
          </ul>
          <WaitlistForm />
        </div>
      </section>

      <section id="faq">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <SectionHeading eyebrow={pt("faq.eyebrow")} title={pt("faq.title")} />
          <Accordion type="single" collapsible className="mt-6 max-w-3xl border-t border-border">
            {faq.map((item, index) => (
              <AccordionItem key={item.q} value={`faq-${index}`}>
                <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </div>
  );
}
