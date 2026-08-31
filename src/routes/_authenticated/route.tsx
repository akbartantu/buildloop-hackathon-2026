import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { createDevAuthBypassUser } from "@/lib/dev-auth-bypass";
import { resolveProtectedRouteAuthUser } from "@/lib/auth/client-session";
import { resolveDevBypassPrincipal } from "@/lib/auth/principal";
import { ProjectsProvider } from "@/hooks/use-projects";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const devPrincipal = resolveDevBypassPrincipal();
    if (devPrincipal) {
      return { user: createDevAuthBypassUser() };
    }

    const user = await resolveProtectedRouteAuthUser();
    if (!user) {
      throw redirect({ to: "/auth" });
    }
    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <ProjectsProvider>
      <Outlet />
    </ProjectsProvider>
  );
}
