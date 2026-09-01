import { Link } from "@tanstack/react-router";

import { useI18n } from "@/i18n/context";
import { usePublicI18n } from "@/i18n/use-public-i18n";

const GITHUB_URL = "https://github.com/akbartantu/buildloop-hackathon-2026";

export function SiteFooter() {
  const { t } = useI18n();
  const { pt } = usePublicI18n();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
              {pt("publicFooter.product")}
            </p>
            <nav aria-label={pt("publicFooter.product")} className="mt-4 flex flex-col gap-2 text-sm">
              <Link to="/" hash="how-it-works" className="text-muted-foreground hover:text-foreground">
                {pt("header.howItWorks")}
              </Link>
              <Link to="/" hash="features" className="text-muted-foreground hover:text-foreground">
                {pt("header.features")}
              </Link>
              <Link to="/" hash="pricing" className="text-muted-foreground hover:text-foreground">
                {pt("header.pricing")}
              </Link>
            </nav>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
              {pt("publicFooter.resources")}
            </p>
            <nav aria-label={pt("publicFooter.resources")} className="mt-4 flex flex-col gap-2 text-sm">
              <Link to="/docs" className="text-muted-foreground hover:text-foreground">
                {pt("header.docs")}
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                {pt("publicFooter.github")}
              </a>
            </nav>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
              {pt("publicFooter.company")}
            </p>
            <nav aria-label={pt("publicFooter.company")} className="mt-4 flex flex-col gap-2 text-sm">
              <Link to="/" hash="about" className="text-muted-foreground hover:text-foreground">
                {pt("header.about")}
              </Link>
            </nav>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
              {pt("publicFooter.legal")}
            </p>
            <nav aria-label={pt("publicFooter.legal")} className="mt-4 flex flex-col gap-2 text-sm">
              <Link to="/privacy" className="text-muted-foreground hover:text-foreground">
                {t("footer.privacy")}
              </Link>
              <Link to="/cookies" className="text-muted-foreground hover:text-foreground">
                {t("footer.cookies")}
              </Link>
              <Link to="/security" className="text-muted-foreground hover:text-foreground">
                {t("footer.security")}
              </Link>
              <Link to="/terms" className="text-muted-foreground hover:text-foreground">
                {t("footer.terms")}
              </Link>
            </nav>
          </div>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">{pt("publicFooter.copyright")}</p>
      </div>
    </footer>
  );
}
