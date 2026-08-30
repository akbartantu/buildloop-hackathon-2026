import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/auth-shell";
import { z } from "zod";

const searchSchema = z.object({
  email: z.string().optional(),
});

export const Route = createFileRoute("/auth/forgot-password/sent")({
  ssr: false,
  validateSearch: searchSchema,
  component: ForgotPasswordSentPage,
  head: () => ({
    meta: [
      { title: "Reset Link Sent — BuildLoop" },
      { name: "description", content: "Password reset link sent." },
    ],
  }),
});

function ForgotPasswordSentPage() {
  const { email } = Route.useSearch();

  return (
    <AuthShell
      title="Check your email"
      description="If an account exists for that address, a reset link is on its way."
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
        {email
          ? `Look for a message sent to ${email}. The link expires after a short time.`
          : "Look for a password reset message in your inbox. The link expires after a short time."}
      </p>
    </AuthShell>
  );
}
