import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { usePublicI18n } from "@/i18n/use-public-i18n";

export function LandingFinalCta() {
  const { pt } = usePublicI18n();

  return (
    <section aria-labelledby="final-cta-heading" className="border-b border-border bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6 sm:py-20">
        <h2 id="final-cta-heading" className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {pt("finalCta.title")}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {pt("finalCta.description")}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth/sign-up">{pt("finalCta.startFree")}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/auth">{pt("finalCta.signIn")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
