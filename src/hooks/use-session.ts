import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createDevAuthBypassUser } from "@/lib/dev-auth-bypass";
import { resolveDevBypassPrincipal } from "@/lib/auth/principal";
import type { User } from "@supabase/supabase-js";

export function useSession(): User | null {
  const devPrincipal = resolveDevBypassPrincipal();
  const [user, setUser] = useState<User | null>(() =>
    devPrincipal ? createDevAuthBypassUser() : null,
  );

  useEffect(() => {
    if (devPrincipal) {
      setUser(createDevAuthBypassUser());
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || error) return;
      setUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [devPrincipal]);

  return user;
}
