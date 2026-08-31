import { useProjects } from "@/hooks/use-projects";
import { isProjectRepositoryConnected, projectDisplayName } from "@/lib/projects/project-record";
import { WORKSPACE_NAME } from "@/lib/task-contract";

export function useWorkspaceLabel() {
  const { source, activeProject, isHydrated, isRepositoryConnected } = useProjects();

  const label = activeProject
    ? isRepositoryConnected
      ? projectDisplayName(activeProject)
      : activeProject.name
    : WORKSPACE_NAME;

  return {
    label,
    source,
    activeProject,
    isConnected: isRepositoryConnected,
    isDemo: !activeProject,
    isHydrated,
  };
}
