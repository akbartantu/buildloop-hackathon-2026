import { describe, expect, test } from "bun:test";

import { WORKSPACE_SWITCH_INVALIDATION_KEYS } from "@/hooks/use-projects";
import {
  isWorkspaceTasksLoading,
  workspaceTasksQueryKey,
} from "@/hooks/use-workspace-tasks";

const projectsSourcePath = new URL("./use-projects.tsx", import.meta.url);
const authenticatedRouteSourcePath = new URL("../routes/_authenticated/route.tsx", import.meta.url);
const homePageSourcePath = new URL("../components/site/pages/home-page.tsx", import.meta.url);
const workspaceTasksSourcePath = new URL("./use-workspace-tasks.ts", import.meta.url);
const activeWorkspaceStoreSourcePath = new URL(
  "../lib/workspace/active-workspace-store.ts",
  import.meta.url,
);

async function readSource(path: URL) {
  return Bun.file(path).text();
}

describe("workspace switch synchronization", () => {
  test("workspace task query keys distinguish project scopes", () => {
    const projectA = "11111111-1111-4111-8111-111111111111";
    const projectB = "22222222-2222-4222-8222-222222222222";

    expect(workspaceTasksQueryKey(projectA)).toEqual(["tasks", projectA]);
    expect(workspaceTasksQueryKey(projectB)).toEqual(["tasks", projectB]);
    expect(workspaceTasksQueryKey(projectA)).not.toEqual(workspaceTasksQueryKey(projectB));
    expect(workspaceTasksQueryKey(null)).toEqual(["tasks", null]);
  });

  test("workspace switch invalidates tasks and specifications", () => {
    expect(WORKSPACE_SWITCH_INVALIDATION_KEYS).toEqual(["tasks", "specifications"]);
  });

  test("projects state is shared through ProjectsProvider and canonical store", async () => {
    const source = await readSource(projectsSourcePath);
    expect(source).toContain("ProjectsContext");
    expect(source).toContain("ProjectsProvider");
    expect(source).toContain("useProjects must be used within ProjectsProvider");
    expect(source).toContain("useCanonicalSelectedProjectId");
    expect(source).toContain("setCanonicalSelectedProjectId");
    expect(source).toContain("invalidateWorkspaceScopedQueries");
    expect(source).toContain('refetchQueries({ queryKey: ["tasks", projectId] })');
  });

  test("authenticated route wraps all app routes with one ProjectsProvider", async () => {
    const source = await readSource(authenticatedRouteSourcePath);
    expect(source).toContain("ProjectsProvider");
    expect(source).toContain("<Outlet />");
  });

  test("app layout does not create a second ProjectsProvider", async () => {
    const source = await readSource(new URL("../components/site/app-layout.tsx", import.meta.url));
    expect(source).not.toContain("ProjectsProvider");
  });

  test("workspace tasks hide stale rows while scope is transitioning", () => {
    expect(
      isWorkspaceTasksLoading({
        projectScope: "project-b",
        committedScope: "project-a",
        isPending: false,
        isFetching: false,
        hasData: true,
      }),
    ).toBe(true);
  });

  test("canonical store uses sync external store instead of page-local state", async () => {
    const source = await readSource(activeWorkspaceStoreSourcePath);
    expect(source).toContain("useSyncExternalStore");
    expect(source).toContain("subscribeSelectedProjectId");
  });

  test("home page avoids showing previous workspace summaries during loading", async () => {
    const source = await readSource(homePageSourcePath);
    expect(source).toContain('isLoading ? "…" : String(tasks.length)');
    expect(source).toContain('isLoading ? "…" : String(pendingApprovals)');
    expect(source).toContain("isLoading ? (");
    expect(source).toContain('{t("common.loading")}');
  });

  test("workspace tasks gate query fetch on active project scope", async () => {
    const source = await readSource(workspaceTasksSourcePath);
    expect(source).toContain("enabled: projectScope !== null");
    expect(source).toContain("isLoading ? [] : (tasksQuery.data ?? [])");
  });
});

describe("workspace switch route stability", () => {
  test("workspace switcher does not navigate away from the current route", async () => {
    const source = await readSource(new URL("../components/site/workspace-switcher.tsx", import.meta.url));
    expect(source).toContain("setSelectedProjectId(project.id)");
    expect(source).not.toContain("useNavigate");
    expect(source).not.toContain("window.location.reload");
  });
});
