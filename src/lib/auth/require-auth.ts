import { createMiddleware } from "@tanstack/react-start";

/** Authenticated server-function middleware — dev bypass or Supabase JWT. */
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { resolveAuthenticatedRequestContext } = await import("./resolve-authenticated-context");
  const context = await resolveAuthenticatedRequestContext();
  return next({ context });
});
