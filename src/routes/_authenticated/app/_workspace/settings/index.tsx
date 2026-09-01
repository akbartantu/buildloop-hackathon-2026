import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SettingsPage } from "@/components/site/pages/settings-pages";

const settingsSearchSchema = z.object({
  tab: z.enum(["profile", "workspace", "environment"]).default("profile"),
});

export const Route = createFileRoute("/_authenticated/app/_workspace/settings/")({
  component: SettingsPage,
  validateSearch: (search) => settingsSearchSchema.parse(search),
  head: () => ({
    meta: [{ title: "Settings — BuildLoop" }],
  }),
});
