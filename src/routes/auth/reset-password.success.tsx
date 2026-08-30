import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/auth-shell";

export const Route = createFileRoute("/auth/reset-password/success")({
  ssr: false,
  component: ResetPasswordSuccessPage,
  head: () => ({
    meta: [
      { title: "Password Updated — BuildLoop" },
      { name: "description", content: "Your BuildLoop password was updated." },
    ],
  }),
});

function ResetPasswordSuccessPage() {
  return (
    <AuthShell
      title="Password updated"
      description="Your password has been changed successfully."
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
        You can now sign in with your new password.
      </p>
      <Link
        to="/auth"
        className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Sign in
      </Link>
    </AuthShell>
  );
}
