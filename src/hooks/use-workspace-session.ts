import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { resolveUserDisplayName } from "@/lib/auth/user-display";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth-bypass";

export function useWorkspaceSession() {
  const user = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const displayName = resolveUserDisplayName({
    email: user?.email,
    userMetadata: user?.user_metadata as { full_name?: string; name?: string } | undefined,
  });
  const email = user?.email;
  const avatarUrl = user?.user_metadata?.["avatar_url"] as string | undefined;

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    if (!isDevAuthBypassEnabled()) {
      await supabase.auth.signOut();
    }
    navigate({ to: "/", replace: true });
  }

  return {
    displayName,
    email,
    avatarUrl,
    handleSignOut,
  };
}
