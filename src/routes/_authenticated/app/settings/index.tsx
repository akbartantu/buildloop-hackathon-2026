import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/site/pages/settings-pages";

export const Route = createFileRoute("/_authenticated/app/settings/")({
  component: SettingsPage,
  head: () => ({
    meta: [{ title: "Settings — BuildLoop" }],
  }),
});
