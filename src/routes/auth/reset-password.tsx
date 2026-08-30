import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AuthErrorBanner, AuthFieldError, AuthShell } from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { supabase } from "@/integrations/supabase/client";
import { establishSessionFromCallbackUrl } from "@/lib/auth-callback";
import { mapAuthError } from "@/lib/auth/auth-errors";
import { resetPasswordSchema } from "@/lib/auth/auth-schema";

export const Route = createFileRoute("/auth/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Set New Password — BuildLoop" },
      { name: "description", content: "Choose a new password for your BuildLoop account." },
    ],
  }),
});

type FieldErrors = Partial<Record<"password" | "confirmPassword", string>>;

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function prepareRecoverySession() {
      const result = await establishSessionFromCallbackUrl();
      if (cancelled) return;

      if (result.status === "session") {
        setSessionReady(true);
        return;
      }

      if (result.status === "error") {
        setSessionError(result.message);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        setSessionReady(true);
        return;
      }

      setSessionError("This reset link is invalid or has expired. Request a new one from sign in.");
    }

    void prepareRecoverySession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !sessionReady) return;

    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "password" || key === "confirmPassword") {
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
      const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (error) {
        setFormError(mapAuthError(error));
        return;
      }

      navigate({ to: "/auth/reset-password/success", replace: true });
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sessionError) {
    return (
      <AuthShell title="Reset link expired" description="Request a new password reset link to continue.">
        <AuthErrorBanner message={sessionError} />
        <Button
          type="button"
          className="w-full"
          size="lg"
          onClick={() => navigate({ to: "/auth/forgot-password" })}
        >
          Request new link
        </Button>
      </AuthShell>
    );
  }

  if (!sessionReady) {
    return (
      <AuthShell title="Preparing reset" description="Verifying your reset link…">
        <p className="text-sm text-muted-foreground">Please wait a moment.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" description="Choose a strong password for your account.">
      {formError ? <AuthErrorBanner message={formError} /> : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="reset-password">New password</Label>
          <PasswordField
            id="reset-password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "reset-password-error" : undefined}
            className="mt-2"
          />
          {errors.password ? <AuthFieldError id="reset-password-error" message={errors.password} /> : null}
        </div>

        <div>
          <Label htmlFor="reset-confirm-password">Confirm new password</Label>
          <PasswordField
            id="reset-confirm-password"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={errors.confirmPassword ? true : undefined}
            aria-describedby={errors.confirmPassword ? "reset-confirm-password-error" : undefined}
            className="mt-2"
          />
          {errors.confirmPassword ? (
            <AuthFieldError id="reset-confirm-password-error" message={errors.confirmPassword} />
          ) : null}
        </div>

        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
