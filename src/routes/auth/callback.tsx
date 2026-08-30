import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { establishSessionFromCallbackUrl } from "@/lib/auth-callback";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: CallbackPage,
  head: () => ({
    meta: [
      { title: "Menyiapkan Sesi — BuildLoop" },
      { name: "description", content: "Menyiapkan sesi BuildLoop." },
    ],
  }),
});

function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function confirmSession() {
      const initial = await establishSessionFromCallbackUrl();
      if (cancelled) return;

      if (initial.status === "session") {
        navigate({ to: "/app", replace: true });
        return;
      }
      if (initial.status === "error") {
        setError(initial.message);
        return;
      }

      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (cancelled) return;
        if (session?.user) {
          navigate({ to: "/app", replace: true });
        }
      });

      for (let i = 0; i < 8; i++) {
        if (cancelled) return;

        const result = await establishSessionFromCallbackUrl();
        if (result.status === "session") {
          navigate({ to: "/app", replace: true });
          return;
        }
        if (result.status === "error") {
          setError(result.message);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      if (!cancelled) {
        setError("Sesi tidak dapat disiapkan. Silakan coba masuk lagi.");
      }

      authListener.subscription.unsubscribe();
    }

    confirmSession();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <p className="text-sm text-destructive">{error}</p>
          <Link
            to="/auth"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Kembali ke halaman masuk
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 h-8 w-[2px] rounded-full bg-boundary" />
        <h1 className="text-base font-semibold text-foreground">Menyiapkan sesi…</h1>
        <p className="mt-1 text-sm text-muted-foreground">Mohon tunggu sebentar.</p>
      </div>
    </div>
  );
}
