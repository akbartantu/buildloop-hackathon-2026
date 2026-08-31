import { Link } from "@tanstack/react-router";

import { useI18n } from "@/i18n/context";

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs text-muted-foreground">© 2026 BuildLoop. All rights reserved.</p>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-4 text-xs">
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
    </footer>
  );
}
