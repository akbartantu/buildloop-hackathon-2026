import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useState } from "react";
import { connectPublicRepository } from "@/lib/repository.functions";
import { listProjects } from "@/lib/projects.functions";
import type { ProjectRecord } from "@/lib/projects/project-record";
import { projectDisplayName } from "@/lib/projects/project-record";
import type { ConnectedRepositorySource } from "@/lib/repository/repository-source";

function toConnectedSource(project: ProjectRecord): ConnectedRepositorySource {
  return {
    url: project.repositoryUrl,
    repoName: projectDisplayName(project),
    branch: project.defaultBranch ?? "main",
    commitSha: project.connectedCommitSha ?? "",
    sourceType: "public_github",
    projectId: project.id,
  };
}

export function useProjects() {
  const queryClient = useQueryClient();
  const fetchProjects = useServerFn(listProjects);
  const connectRepository = useServerFn(connectPublicRepository);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
  });

  const projects = projectsQuery.data ?? [];

  const activeProject = useMemo(() => {
    if (selectedProjectId) {
      return projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
    }
    return projects[0] ?? null;
  }, [projects, selectedProjectId]);

  const source = activeProject ? toConnectedSource(activeProject) : null;

  const connect = useCallback(
    async (url: string) => {
      const result = await connectRepository({ data: { url } });
      if (result.status === "ok") {
        setSelectedProjectId(result.projectId);
        await queryClient.invalidateQueries({ queryKey: ["projects"] });
        await queryClient.refetchQueries({ queryKey: ["projects"] });
      }
      return result;
    },
    [connectRepository, queryClient],
  );

  return {
    projects,
    source,
    activeProject,
    selectedProjectId,
    setSelectedProjectId,
    connect,
    isLoading: projectsQuery.isLoading,
    isHydrated: !projectsQuery.isLoading,
  };
}
