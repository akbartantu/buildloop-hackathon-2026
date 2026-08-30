import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage } from "@/components/site/pages/settings-pages";

export const Route = createFileRoute("/_authenticated/app/integrations/")({
  component: IntegrationsPage,
  head: () => ({
    meta: [{ title: "Integrations — BuildLoop" }],
  }),
});
