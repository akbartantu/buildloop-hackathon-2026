import { Link } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { LandingFinalCta } from "@/components/site/landing-final-cta";
import { LandingHeroPreview } from "@/components/site/landing-hero-preview";
import { LandingLifecycleSteps } from "@/components/site/landing-lifecycle-steps";
import { LandingOutcomeCards } from "@/components/site/landing-outcome-cards";
import { LandingTechnologyRow } from "@/components/site/landing-technology-row";
import { LandingTrustRow } from "@/components/site/landing-trust-row";
import { PricingSection } from "@/components/site/pricing-section";
import { SectionHeading } from "@/components/site/section-heading";
import { usePublicI18n, usePublicPageMeta } from "@/i18n/use-public-i18n";

export function LandingPage() {
  const { pt } = usePublicI18n();
  usePublicPageMeta("meta.title", "meta.description");

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
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
            <div className="max-w-xl">
              <p className="inline-flex rounded-full border border-border bg-muted/30 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {pt("hero.eyebrow")}
              </p>
              <h1 className="mt-6 text-3xl font-semibold leading-[1.12] tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem]">
                {pt("hero.titleLine1")}
                <br />
                <span className="text-primary">{pt("hero.titleLine2")}</span>
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
                {pt("hero.subtitle")}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link to="/auth/sign-up">{pt("hero.startFree")}</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/" hash="how-it-works">
                    {pt("hero.seeHowItWorks")}
                  </Link>
                </Button>
              </div>
            </div>

            <LandingHeroPreview />
          </div>
        </div>
      </section>

      <LandingTrustRow />
      <LandingLifecycleSteps />
      <LandingOutcomeCards />

      <section id="features" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow={pt("features.eyebrow")}
            title={pt("features.title")}
            description={pt("features.description")}
          />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-xl border border-border bg-card p-6"
              >
                <h3 className="font-mono text-sm text-foreground">{feature.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <LandingTechnologyRow />

      <section id="about" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <SectionHeading title={pt("about.title")} description={pt("about.description")} />
        </div>
      </section>

      <PricingSection />

      <section id="faq">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHeading eyebrow={pt("faq.eyebrow")} title={pt("faq.title")} />
          <Accordion type="single" collapsible className="mt-8 max-w-3xl border-t border-border">
            {faq.map((item, index) => (
              <AccordionItem key={item.q} value={`faq-${index}`}>
                <AccordionTrigger className="py-4 text-left text-sm">{item.q}</AccordionTrigger>
                <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <LandingFinalCta />
    </div>
  );
}
