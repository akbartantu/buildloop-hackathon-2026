import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth-bypass";

export function useWorkspaceSession() {
  const user = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const displayName =
    (user?.user_metadata?.["full_name"] as string | undefined) ||
    (user?.user_metadata?.["name"] as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Pengguna";
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
