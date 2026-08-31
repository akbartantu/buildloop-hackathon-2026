import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
import { mapSignupError } from "@/lib/auth/auth-errors";
import { precheckEmailSignup } from "@/lib/auth/auth.functions";
import { signUpSchema } from "@/lib/auth/auth-schema";
import { DISPOSABLE_EMAIL_MESSAGE } from "@/lib/auth/disposable-email";
import { interpretSignupResponse } from "@/lib/auth/signup-flow";
import { normalizeFullName } from "@/lib/auth/user-display";
import { useI18n } from "@/i18n/context";
import { LanguageSwitcher } from "@/i18n/language-switcher";

export const Route = createFileRoute("/auth/sign-up")({
  ssr: false,
  component: SignUpPage,
  head: () => ({
    meta: [
      { title: "Create Account — BuildLoop" },
      { name: "description", content: "Create your BuildLoop account." },
    ],
  }),
});

type FieldErrors = Partial<Record<"fullName" | "email" | "password" | "confirmPassword", string>>;

function SignUpPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const precheckSignup = useServerFn(precheckEmailSignup);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const parsed = signUpSchema.safeParse({ fullName, email, password, confirmPassword });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === "fullName" ||
          key === "email" ||
          key === "password" ||
          key === "confirmPassword"
        ) {
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
      const precheck = await precheckSignup({ data: parsed.data });

      if (precheck.status === "disposable_email") {
        setErrors({ email: DISPOSABLE_EMAIL_MESSAGE });
        return;
      }

      if (precheck.status === "error") {
        setFormError(t("auth.accountCreateError"));
        return;
      }

      if (precheck.status !== "ok") {
        setFormError(t("auth.accountCreateError"));
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: precheck.emailRedirectTo,
          data: {
            full_name: normalizeFullName(parsed.data.fullName),
          },
        },
      });

      if (error) {
        const mapped = mapSignupError(error);

        if (mapped.status === "email_taken") {
          setFormError(t("auth.emailTaken"));
          return;
        }

        if (mapped.status === "weak_password") {
          setErrors({ password: t("auth.weakPassword") });
          return;
        }

        if (mapped.status === "rate_limited") {
          setFormError(t("auth.rateLimited"));
          return;
        }

        setFormError(t("auth.accountCreateError"));
        return;
      }

      const completion = interpretSignupResponse(data);

      if (completion.status === "email_taken") {
        setFormError(t("auth.emailTaken"));
        return;
      }

      if (completion.status === "needs_email_confirmation") {
        setNeedsConfirmation(true);
        return;
      }

      if (completion.status === "error") {
        setFormError(t("auth.accountCreateError"));
        return;
      }

      navigate({ to: "/app", replace: true });
    } catch {
      setFormError(t("auth.genericError"));
    } finally {
      setLoading(false);
    }
  }

  if (needsConfirmation) {
    return (
      <AuthShell
        title={t("auth.checkEmailTitle")}
        description={t("auth.checkEmailDescription")}
        footer={
          <div className="border-t border-border px-6 pb-6">
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/auth" className="font-medium text-foreground underline hover:no-underline">
                {t("auth.backToSignIn")}
              </Link>
            </p>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {t("auth.verifyEmailHint", { email: email.trim().toLowerCase() })}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("auth.signUpTitle")} description={t("auth.signUpDescription")}>
      <div className="mb-4 flex justify-end">
        <LanguageSwitcher />
      </div>
      <GoogleSignInButton disabled={loading} onError={setFormError} />
      <AuthDivider />

      {formError ? <AuthErrorBanner message={formError} /> : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="sign-up-full-name">{t("auth.fullName")}</Label>
          <Input
            id="sign-up-full-name"
            name="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={errors.fullName ? "sign-up-full-name-error" : undefined}
            className="mt-2"
          />
          {errors.fullName ? (
            <AuthFieldError id="sign-up-full-name-error" message={errors.fullName} />
          ) : null}
        </div>

        <div>
          <Label htmlFor="sign-up-email">{t("auth.email")}</Label>
          <Input
            id="sign-up-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "sign-up-email-error" : undefined}
            className="mt-2"
          />
          {errors.email ? <AuthFieldError id="sign-up-email-error" message={errors.email} /> : null}
        </div>

        <div>
          <Label htmlFor="sign-up-password">{t("auth.password")}</Label>
          <PasswordField
            id="sign-up-password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "sign-up-password-error" : undefined}
            className="mt-2"
          />
          {errors.password ? (
            <AuthFieldError id="sign-up-password-error" message={errors.password} />
          ) : null}
        </div>

        <div>
          <Label htmlFor="sign-up-confirm-password">{t("auth.confirmPassword")}</Label>
          <PasswordField
            id="sign-up-confirm-password"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={errors.confirmPassword ? true : undefined}
            aria-describedby={errors.confirmPassword ? "sign-up-confirm-password-error" : undefined}
            className="mt-2"
          />
          {errors.confirmPassword ? (
            <AuthFieldError id="sign-up-confirm-password-error" message={errors.confirmPassword} />
          ) : null}
        </div>

        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t("auth.hasAccount")}{" "}
        <Link to="/auth" className="font-medium text-foreground underline hover:no-underline">
          {t("auth.signIn")}
        </Link>
      </p>
    </AuthShell>
  );
}
