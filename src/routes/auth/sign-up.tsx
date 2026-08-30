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

type FieldErrors = Partial<Record<"email" | "password" | "confirmPassword", string>>;

function SignUpPage() {
  const navigate = useNavigate();
  const precheckSignup = useServerFn(precheckEmailSignup);

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

    const parsed = signUpSchema.safeParse({ email, password, confirmPassword });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" || key === "password" || key === "confirmPassword") {
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
        setFormError("Could not create your account. Please try again.");
        return;
      }

      if (precheck.status !== "ok") {
        setFormError("Could not create your account. Please try again.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: precheck.emailRedirectTo,
        },
      });

      if (error) {
        const mapped = mapSignupError(error);

        if (mapped.status === "email_taken") {
          setFormError("An account with this email already exists. Sign in or use a different email.");
          return;
        }

        if (mapped.status === "weak_password") {
          setErrors({
            password: "Password does not meet the minimum requirements. Use at least 6 characters.",
          });
          return;
        }

        if (mapped.status === "rate_limited") {
          setFormError("Too many attempts. Please wait a moment and try again.");
          return;
        }

        setFormError("Could not create your account. Please try again.");
        return;
      }

      const completion = interpretSignupResponse(data);

      if (completion.status === "email_taken") {
        setFormError("An account with this email already exists. Sign in or use a different email.");
        return;
      }

      if (completion.status === "needs_email_confirmation") {
        setNeedsConfirmation(true);
        return;
      }

      if (completion.status === "error") {
        setFormError("Could not create your account. Please try again.");
        return;
      }

      navigate({ to: "/app", replace: true });
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (needsConfirmation) {
    return (
      <AuthShell
        title="Check your email"
        description="We sent a confirmation link to finish setting up your account."
        footer={
          <div className="border-t border-border px-6 pb-6">
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/auth" className="font-medium text-foreground underline hover:no-underline">
                Back to sign in
              </Link>
            </p>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          Open the link in your inbox to verify <span className="font-medium text-foreground">{email.trim().toLowerCase()}</span>, then sign in to continue.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" description="Securely continue to your workspace.">
      <GoogleSignInButton disabled={loading} onError={setFormError} />
      <AuthDivider />

      {formError ? <AuthErrorBanner message={formError} /> : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="sign-up-email">Email</Label>
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
          <Label htmlFor="sign-up-password">Password</Label>
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
          <Label htmlFor="sign-up-confirm-password">Confirm password</Label>
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
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/auth" className="font-medium text-foreground underline hover:no-underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
