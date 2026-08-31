import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
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
import { resolveActiveProjectId } from "@/lib/workspace/active-project";
import {
  reconcileSelectedProjectWithProjects,
  setCanonicalSelectedProjectId,
  useCanonicalSelectedProjectId,
} from "@/lib/workspace/active-workspace-store";

export const WORKSPACE_SWITCH_INVALIDATION_KEYS = ["tasks", "specifications"] as const;

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

const ProjectsContext = createContext<ReturnType<typeof useProjectsState> | null>(null);

function useProjectsState() {
  const queryClient = useQueryClient();
  const fetchProjects = useServerFn(listProjects);
  const connectRepository = useServerFn(connectPublicRepository);
  const refreshRepository = useServerFn(refreshPublicGitHubProject);
  const disconnectRepository = useServerFn(disconnectPublicGitHubProject);
  const selectedProjectId = useCanonicalSelectedProjectId();

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
  });

  const projects = projectsQuery.data ?? [];

  useEffect(() => {
    reconcileSelectedProjectWithProjects(projects);
  }, [projects]);

  const activeProject = useMemo(() => {
    const resolvedId = resolveActiveProjectId(projects, selectedProjectId);
    return projects.find((project) => project.id === resolvedId) ?? null;
  }, [projects, selectedProjectId]);

  const source = activeProject ? toConnectedSource(activeProject) : null;
  const isRepositoryConnected = Boolean(source);

  const invalidateWorkspaceScopedQueries = useCallback(
    async (projectId: string | null) => {
      for (const key of WORKSPACE_SWITCH_INVALIDATION_KEYS) {
        await queryClient.invalidateQueries({ queryKey: [key] });
      }
      if (projectId) {
        await queryClient.refetchQueries({ queryKey: ["tasks", projectId] });
      }
    },
    [queryClient],
  );

  const setSelectedProjectId = useCallback(
    (projectId: string | null) => {
      const resolved =
        projects.length > 0
          ? resolveActiveProjectId(projects, projectId)
          : projectId;
      setCanonicalSelectedProjectId(resolved, { userInitiated: true });
      void invalidateWorkspaceScopedQueries(resolved);
    },
    [invalidateWorkspaceScopedQueries, projects],
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

export type ProjectsContextValue = ReturnType<typeof useProjectsState>;

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const value = useProjectsState();
  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsContextValue {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error("useProjects must be used within ProjectsProvider");
  }
  return context;
}
