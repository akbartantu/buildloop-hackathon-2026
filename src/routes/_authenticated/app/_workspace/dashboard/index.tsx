import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceDashboardPage } from "@/components/site/pages/workspace-dashboard-page";

export const Route = createFileRoute("/_authenticated/app/_workspace/dashboard/")({
  component: WorkspaceDashboardPage,
  head: () => ({
    meta: [
      { title: "Home — BuildLoop" },
      {
        name: "description",
        content: "BuildLoop workspace operational overview.",
      },
    ],
  }),
});
