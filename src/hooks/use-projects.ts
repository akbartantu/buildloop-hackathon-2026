import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  connectPublicRepository,
  disconnectPublicGitHubProject,
  refreshPublicGitHubProject,
} from "@/lib/repository.functions";
import { listProjects } from "@/lib/projects.functions";
import {
  isProjectRepositoryConnected,
  projectDisplayName,
  type ProjectRecord,
} from "@/lib/projects/project-record";
import type { ConnectedRepositorySource } from "@/lib/repository/repository-source";
import {
  persistActiveProjectId,
  readStoredActiveProjectId,
  resolveActiveProjectId,
} from "@/lib/workspace/active-project";

function toConnectedSource(project: ProjectRecord): ConnectedRepositorySource | null {
  if (!isProjectRepositoryConnected(project)) {
    return null;
  }

  return {
    url: project.repositoryUrl,
    repoName: projectDisplayName(project),
    branch: project.defaultBranch ?? "main",
    commitSha: project.connectedCommitSha ?? "",
    sourceType: "public_github",
    projectId: project.id,
  };
}

export type ConnectIntent = "connect" | "create_workspace" | "reconnect";

export function useProjects() {
  const queryClient = useQueryClient();
  const fetchProjects = useServerFn(listProjects);
  const connectRepository = useServerFn(connectPublicRepository);
  const refreshRepository = useServerFn(refreshPublicGitHubProject);
  const disconnectRepository = useServerFn(disconnectPublicGitHubProject);
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
  const isRepositoryConnected = Boolean(source);

  const setSelectedProjectId = useCallback(
    (projectId: string | null) => {
      const resolved = resolveActiveProjectId(projects, projectId);
      persistActiveProjectId(resolved);
      setSelectedProjectIdState(resolved);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    [projects, queryClient],
  );

  const connect = useCallback(
    async (
      url: string,
      options?: { intent?: ConnectIntent; projectId?: string },
    ) => {
      const result = await connectRepository({
        data: {
          url,
          ...(options?.intent ? { intent: options.intent } : {}),
          ...(options?.projectId ? { projectId: options.projectId } : {}),
        },
      });
      if (result.status === "ok") {
        setSelectedProjectId(result.projectId);
        await queryClient.invalidateQueries({ queryKey: ["projects"] });
        await queryClient.refetchQueries({ queryKey: ["projects"] });
      }
      return result;
    },
    [connectRepository, queryClient, setSelectedProjectId],
  );

  const refresh = useCallback(
    async (projectId: string) => {
      const result = await refreshRepository({ data: { projectId } });
      if (result.status === "ok") {
        await queryClient.invalidateQueries({ queryKey: ["projects"] });
        await queryClient.refetchQueries({ queryKey: ["projects"] });
      }
      return result;
    },
    [queryClient, refreshRepository],
  );

  const disconnect = useCallback(
    async (projectId: string) => {
      const result = await disconnectRepository({ data: { projectId } });
      if (result.status === "ok") {
        await queryClient.invalidateQueries({ queryKey: ["projects"] });
        await queryClient.refetchQueries({ queryKey: ["projects"] });
      }
      return result;
    },
    [disconnectRepository, queryClient],
  );

  return {
    projects,
    source,
    activeProject,
    selectedProjectId: activeProject?.id ?? null,
    setSelectedProjectId,
    connect,
    refresh,
    disconnect,
    isRepositoryConnected,
    isLoading: projectsQuery.isLoading,
    isHydrated: !projectsQuery.isLoading,
  };
}
