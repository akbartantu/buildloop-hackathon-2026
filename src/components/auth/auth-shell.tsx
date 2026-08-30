import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

type AuthShellProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({
  title = "Welcome to BuildLoop",
  description = "Securely continue to your workspace.",
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex gap-4 p-6">
          <div className="mt-1 h-16 w-[2px] shrink-0 rounded-full bg-boundary" />
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              BuildLoop
            </p>
            <h1 className="mt-2 text-lg font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="border-t border-border p-6">{children}</div>

        {footer ?? (
          <div className="border-t border-border px-6 pb-6">
            <p className="text-center text-xs text-muted-foreground">
              By continuing, you agree to BuildLoop&apos;s{" "}
              <Link to="/terms" className="underline hover:text-foreground">
                Terms
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="underline hover:text-foreground">
                Privacy Policy
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
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card px-2 text-muted-foreground">or</span>
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
