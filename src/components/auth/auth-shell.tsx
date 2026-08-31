import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BuildLoopLogo } from "@/components/site/buildloop-logo";
import { useI18n } from "@/i18n/context";

type AuthShellProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex gap-4 p-6">
          <BuildLoopLogo className="mt-1 shrink-0" showWordmark={false} />
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              BuildLoop
            </p>
            <h1 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              {title ?? t("auth.welcomeTitle")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {description ?? t("auth.welcomeDescription")}
            </p>
          </div>
        </div>

        <div className="border-t border-border p-6">{children}</div>

        {footer ?? (
          <div className="border-t border-border px-6 pb-6">
            <p className="text-center text-xs text-muted-foreground">
              {t("auth.termsPrefix")}{" "}
              <Link to="/terms" className="underline hover:text-foreground">
                {t("auth.terms")}
              </Link>
              ,{" "}
              <Link to="/privacy" className="underline hover:text-foreground">
                {t("auth.privacyPolicy")}
              </Link>
              , {t("auth.and")}{" "}
              <Link to="/cookies" className="underline hover:text-foreground">
                {t("auth.cookiesPolicy")}
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function AuthDivider() {
  const { t } = useI18n();

  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card px-2 text-muted-foreground">{t("auth.orDivider")}</span>
      </div>
    </div>
  );
}

export function AuthErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {message}
    </div>
  );
}

export function AuthFieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="mt-2 text-xs text-destructive">
      {message}
    </p>
  );
}
