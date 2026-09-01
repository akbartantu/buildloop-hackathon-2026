import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/site/app-layout";
import { WorkspaceShellGuard } from "@/components/site/workspace-shell-guard";

export const Route = createFileRoute("/_authenticated/app/_workspace")({
  component: WorkspaceLayoutRoute,
});

function WorkspaceLayoutRoute() {
  return (
    <WorkspaceShellGuard>
      <AppLayout />
    </WorkspaceShellGuard>
  );
}
