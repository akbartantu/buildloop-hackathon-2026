import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/site/app-layout";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayoutRoute,
});

function AppLayoutRoute() {
  return <AppLayout />;
}
