import { describe, expect, test } from "bun:test";

import { translate } from "@/i18n";
import { resolveActiveNav } from "@/lib/app-nav";

const overviewSourcePath = new URL("./workspace-overview-page.tsx", import.meta.url);
const dashboardRoutePath = new URL("../../../routes/_authenticated/app/_workspace/dashboard/index.tsx", import.meta.url);
const workspaceRoutePath = new URL("../../../routes/_authenticated/app/_workspace/route.tsx", import.meta.url);
const appIndexRoutePath = new URL("../../../routes/_authenticated/app/index.tsx", import.meta.url);
const switcherSourcePath = new URL("../workspace-switcher.tsx", import.meta.url);
const appNavPath = new URL("../../../lib/app-nav.ts", import.meta.url);

async function readSource(path: URL) {
  return Bun.file(path).text();
}

describe("workspace overview routing", () => {
  test("authenticated app index renders workspace overview page", async () => {
    const source = await readSource(appIndexRoutePath);
    expect(source).toContain("WorkspaceOverviewPage");
    expect(source).not.toContain("WorkspaceDashboardPage");
  });

  test("workspace dashboard route preserves operational overview under workspace shell", async () => {
    const source = await readSource(dashboardRoutePath);
    expect(source).toContain("WorkspaceDashboardPage");
    expect(source).toContain("/_authenticated/app/_workspace/dashboard/");
  });

  test("workspace shell layout wraps dashboard and task routes", async () => {
    const source = await readSource(workspaceRoutePath);
    expect(source).toContain("AppLayout");
    expect(source).toContain("WorkspaceShellGuard");
  });

  test("app index uses global shell without workspace sidebar", async () => {
    const source = await readSource(appIndexRoutePath);
    expect(source).toContain("GlobalAppLayout");
    expect(source).not.toContain('from "@/components/site/app-layout"');
  });

  test("nav home points to workspace dashboard while /app remains overview", async () => {
    const source = await readSource(appNavPath);
    expect(source).toContain('to: "/app/dashboard"');
    expect(resolveActiveNav("/app")).toBeNull();
    expect(resolveActiveNav("/app/dashboard")).toBe("home");
    expect(resolveActiveNav("/app/tasks")).toBe("tasks");
    expect(resolveActiveNav("/app/tasks/task-1")).toBe("tasks");
  });
});

describe("workspace overview page behavior", () => {
  test("renders workspace cards from project data and opens dashboard route", async () => {
    const source = await readSource(overviewSourcePath);
    expect(source).toContain('data-testid="workspace-overview-page"');
    expect(source).toContain("useProjects()");
    expect(source).toContain('data-testid={`workspace-card-${project.id}`}');
    expect(source).toContain('navigate({ to: "/app/dashboard" })');
    expect(source).toContain('search={{ create: "1" }}');
    expect(source).toContain("WorkspaceOverviewEmptyState");
  });

  test("usage panel omits fake upgrade and quota limits", async () => {
    const source = await readSource(overviewSourcePath);
    expect(source).toContain("buildWorkspaceUsageRows");
    expect(source).toContain("workspaceOverview.noPlanData");
    expect(source).not.toContain("Upgrade");
    expect(source).not.toContain("Stripe");
    expect(source).not.toContain("workspaceOverview.plan");
    expect(source).not.toContain("pricing-plans");
  });

  test("layout uses responsive grid without forcing overflow", async () => {
    const source = await readSource(overviewSourcePath);
    expect(source).toContain("workspaceOverviewLayoutClassName");
    expect(source).toContain("lg:grid-cols-3");
    expect(source).toContain("sm:grid-cols-2");
  });
});

describe("workspace switcher integration", () => {
  test("dropdown still switches workspaces and links to all workspaces overview", async () => {
    const source = await readSource(switcherSourcePath);
    expect(source).toContain("setSelectedProjectId");
    expect(source).toContain('data-testid={`workspace-option-${project.id}`}');
    expect(source).toContain('to="/app"');
    expect(source).toContain("workspaceOverview.allWorkspaces");
    expect(source).toContain("projects.createWorkspace");
  });
});

describe("workspace overview localized labels", () => {
  test("empty state copy is localized", () => {
    expect(translate("en", "workspaceOverview.emptyTitle")).toBe("No workspaces yet");
    expect(translate("id", "workspaceOverview.emptyTitle")).toBe("Belum ada workspace");
    expect(translate("id", "workspaceOverview.createWorkspace")).toBe("Buat Workspace");
  });
});
