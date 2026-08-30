import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { resolvePublicRouteAuthUser } from "@/lib/auth/client-session";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const openWhenAuthenticated = ["/callback", "/reset-password"].some((suffix) =>
      location.pathname.endsWith(suffix),
    );
    if (openWhenAuthenticated) {
      return;
    }

    const user = await resolvePublicRouteAuthUser();
    if (user) {
      throw redirect({ to: "/app" });
    }
  },
  component: () => <Outlet />,
});
