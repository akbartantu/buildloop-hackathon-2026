import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceOverviewPage } from "@/components/site/pages/workspace-overview-page";

export const Route = createFileRoute("/_authenticated/app/")({
  component: WorkspaceOverviewPage,
  head: () => ({
    meta: [
      { title: "Workspaces — BuildLoop" },
      {
        name: "description",
        content: "BuildLoop workspace overview.",
      },
    ],
  }),
});
