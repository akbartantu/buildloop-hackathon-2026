import { createFileRoute } from "@tanstack/react-router";
import { GlobalAppLayout } from "@/components/site/global-app-layout";
import { WorkspaceOverviewPage } from "@/components/site/pages/workspace-overview-page";

export const Route = createFileRoute("/_authenticated/app/")({
  component: WorkspaceOverviewRoute,
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

function WorkspaceOverviewRoute() {
  return (
    <GlobalAppLayout>
      <WorkspaceOverviewPage />
    </GlobalAppLayout>
  );
}
