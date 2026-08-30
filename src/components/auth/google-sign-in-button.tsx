import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type GoogleSignInButtonProps = {
  disabled?: boolean;
  onError: (message: string) => void;
};

export function GoogleSignInButton({ disabled, onError }: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (loading || disabled) return;

    setLoading(true);
    onError("");

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        onError("Could not start Google sign-in. Please try again.");
      }
    } catch {
      onError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleSignIn}
      disabled={loading || disabled}
      className="w-full"
      size="lg"
    >
      {loading ? "Connecting…" : "Continue with Google"}
    </Button>
  );
}
