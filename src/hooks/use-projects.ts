import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { connectPublicRepository } from "@/lib/repository.functions";
import { listProjects } from "@/lib/projects.functions";
import type { ProjectRecord } from "@/lib/projects/project-record";
import { projectDisplayName } from "@/lib/projects/project-record";
import type { ConnectedRepositorySource } from "@/lib/repository/repository-source";
import {
  persistActiveProjectId,
  readStoredActiveProjectId,
  resolveActiveProjectId,
} from "@/lib/workspace/active-project";

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
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(() =>
    readStoredActiveProjectId(),
  );

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
  });

  const projects = projectsQuery.data ?? [];

  useEffect(() => {
    const resolved = resolveActiveProjectId(projects, selectedProjectId);
    if (resolved !== selectedProjectId) {
      setSelectedProjectIdState(resolved);
      persistActiveProjectId(resolved);
    }
  }, [projects, selectedProjectId]);

  const activeProject = useMemo(() => {
    const resolvedId = resolveActiveProjectId(projects, selectedProjectId);
    return projects.find((project) => project.id === resolvedId) ?? null;
  }, [projects, selectedProjectId]);

  const source = activeProject ? toConnectedSource(activeProject) : null;

  const setSelectedProjectId = useCallback((projectId: string | null) => {
    const resolved = resolveActiveProjectId(projects, projectId);
    persistActiveProjectId(resolved);
    setSelectedProjectIdState(resolved);
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }, [projects, queryClient]);

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
    [connectRepository, queryClient, setSelectedProjectId],
  );

  return {
    projects,
    source,
    activeProject,
    selectedProjectId: activeProject?.id ?? null,
    setSelectedProjectId,
    connect,
    isLoading: projectsQuery.isLoading,
    isHydrated: !projectsQuery.isLoading,
  };
}
