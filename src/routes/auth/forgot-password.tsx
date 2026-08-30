import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthErrorBanner, AuthFieldError, AuthShell } from "@/components/auth/auth-shell";
import { supabase } from "@/integrations/supabase/client";
import { mapAuthError } from "@/lib/auth/auth-errors";
import { forgotPasswordSchema } from "@/lib/auth/auth-schema";

export const Route = createFileRoute("/auth/forgot-password")({
  ssr: false,
  component: ForgotPasswordPage,
  head: () => ({
    meta: [
      { title: "Forgot Password — BuildLoop" },
      { name: "description", content: "Reset your BuildLoop password." },
    ],
  }),
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      setError(null);
      return;
    }

    setFieldError(null);
    setError(null);
    setLoading(true);

    try {
      const redirectTo = `${window.location.origin}/auth/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo,
      });

      if (resetError) {
        setError(mapAuthError(resetError));
        return;
      }

      navigate({
        to: "/auth/forgot-password/sent",
        search: { email: parsed.data.email },
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we will send you a reset link."
    >
      {error ? <AuthErrorBanner message={error} /> : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="forgot-password-email">Email</Label>
          <Input
            id="forgot-password-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "forgot-password-email-error" : undefined}
            className="mt-2"
          />
          {fieldError ? (
            <AuthFieldError id="forgot-password-email-error" message={fieldError} />
          ) : null}
        </div>

        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link to="/auth" className="font-medium text-foreground underline hover:no-underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
