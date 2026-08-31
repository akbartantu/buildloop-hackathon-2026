import { describe, expect, test } from "bun:test";

import { WORKSPACE_SWITCH_INVALIDATION_KEYS } from "@/hooks/use-projects";
import { workspaceTasksQueryKey } from "@/hooks/use-workspace-tasks";

const projectsSourcePath = new URL("./use-projects.tsx", import.meta.url);
const appLayoutSourcePath = new URL("../components/site/app-layout.tsx", import.meta.url);
const homePageSourcePath = new URL("../components/site/pages/home-page.tsx", import.meta.url);
const workspaceTasksSourcePath = new URL("./use-workspace-tasks.ts", import.meta.url);

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

  test("projects state is shared through ProjectsProvider", async () => {
    const source = await readSource(projectsSourcePath);
    expect(source).toContain("ProjectsContext");
    expect(source).toContain("ProjectsProvider");
    expect(source).toContain("useProjects must be used within ProjectsProvider");
    expect(source).toContain("invalidateWorkspaceScopedQueries");
    expect(source).toContain('refetchQueries({ queryKey: ["tasks", projectId] })');
  });

  test("authenticated app layout wraps content with ProjectsProvider", async () => {
    const source = await readSource(appLayoutSourcePath);
    expect(source).toContain("ProjectsProvider");
    expect(source).toContain("<AppLayoutContent />");
  });

  test("workspace tasks hide stale rows while the new scope is pending", async () => {
    const source = await readSource(workspaceTasksSourcePath);
    expect(source).toContain("workspaceTasksQueryKey(projectScope)");
    expect(source).toContain("isScopePending");
    expect(source).toContain("isScopePending ? [] : (tasksQuery.data ?? [])");
  });

  test("home page avoids showing previous workspace summaries during loading", async () => {
    const source = await readSource(homePageSourcePath);
    expect(source).toContain("isLoading ? \"…\" : String(tasks.length)");
    expect(source).toContain("isLoading ? \"…\" : String(pendingApprovals)");
    expect(source).toContain("isLoading ? (");
    expect(source).toContain("{t(\"common.loading\")}");
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
