import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AuthDivider,
  AuthErrorBanner,
  AuthFieldError,
  AuthShell,
} from "@/components/auth/auth-shell";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { PasswordField } from "@/components/auth/password-field";
import { supabase } from "@/integrations/supabase/client";
import { mapAuthError } from "@/lib/auth/auth-errors";
import { signInSchema } from "@/lib/auth/auth-schema";
import { useI18n } from "@/i18n/context";
import { LanguageSwitcher } from "@/i18n/language-switcher";

export const Route = createFileRoute("/auth/")({
  ssr: false,
  component: SignInPage,
  head: () => ({
    meta: [
      { title: "Sign In — BuildLoop" },
      { name: "description", content: "Sign in to your BuildLoop workspace." },
    ],
  }),
});

type FieldErrors = Partial<Record<"email" | "password", string>>;

function SignInPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" || key === "password") {
          next[key] = next[key] ?? issue.message;
        }
      }
      setErrors(next);
      setFormError(null);
      return;
    }

    setErrors({});
    setFormError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (error) {
        setFormError(mapAuthError(error));
        return;
      }

      navigate({ to: "/app", replace: true });
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title={t("auth.signInTitle")} description={t("auth.signInDescription")}>
      <div className="mb-4 flex justify-end">
        <LanguageSwitcher />
      </div>
      <GoogleSignInButton disabled={loading} onError={setFormError} />
      <AuthDivider />

      {formError ? <AuthErrorBanner message={formError} /> : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="sign-in-email">{t("auth.email")}</Label>
          <Input
            id="sign-in-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "sign-in-email-error" : undefined}
            className="mt-2"
          />
          {errors.email ? <AuthFieldError id="sign-in-email-error" message={errors.email} /> : null}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sign-in-password">{t("auth.password")}</Label>
            <Link
              to="/auth/forgot-password"
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {t("auth.forgotPassword")}
            </Link>
          </div>
          <PasswordField
            id="sign-in-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "sign-in-password-error" : undefined}
            className="mt-2"
          />
          {errors.password ? (
            <AuthFieldError id="sign-in-password-error" message={errors.password} />
          ) : null}
        </div>

        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t("auth.noAccount")}{" "}
        <Link to="/auth/sign-up" className="font-medium text-foreground underline hover:no-underline">
          {t("auth.signUp")}
        </Link>
      </p>
    </AuthShell>
  );
}
