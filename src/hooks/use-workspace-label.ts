import { useProjects } from "@/hooks/use-projects";
import { WORKSPACE_NAME } from "@/lib/task-contract";

export function useWorkspaceLabel() {
  const { source, activeProject, isHydrated } = useProjects();

  return {
    label: source?.repoName ?? WORKSPACE_NAME,
    source,
    activeProject,
    isConnected: Boolean(source),
    isHydrated,
  };
}
