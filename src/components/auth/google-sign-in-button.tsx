import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { mapOAuthStartError } from "@/lib/auth/auth-errors";
import { buildGoogleOAuthRequest } from "@/lib/auth/auth-redirect";

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
      const { error } = await supabase.auth.signInWithOAuth(buildGoogleOAuthRequest());

      if (error) {
        onError(mapOAuthStartError(error));
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
