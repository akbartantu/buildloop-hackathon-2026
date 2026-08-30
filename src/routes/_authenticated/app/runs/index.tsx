import { createFileRoute } from "@tanstack/react-router";
import { RunsPage } from "@/components/site/pages/runs-page";

export const Route = createFileRoute("/_authenticated/app/runs/")({
  component: RunsPage,
  head: () => ({
    meta: [{ title: "Runs — BuildLoop" }],
  }),
});
