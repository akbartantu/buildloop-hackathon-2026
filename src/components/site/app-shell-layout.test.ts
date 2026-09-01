import { describe, expect, test } from "bun:test";

import { translate } from "@/i18n";
import { resolveActiveNav } from "@/lib/app-nav";

const appRoutePath = new URL("../../routes/_authenticated/app/route.tsx", import.meta.url);
const workspaceRoutePath = new URL("../../routes/_authenticated/app/_workspace/route.tsx", import.meta.url);
const appIndexPath = new URL("../../routes/_authenticated/app/index.tsx", import.meta.url);
const globalLayoutPath = new URL("./global-app-layout.tsx", import.meta.url);
const appLayoutPath = new URL("./app-layout.tsx", import.meta.url);
const overviewSourcePath = new URL("./pages/workspace-overview-page.tsx", import.meta.url);
const switcherSourcePath = new URL("./workspace-switcher.tsx", import.meta.url);
const shellGuardPath = new URL("./workspace-shell-guard.tsx", import.meta.url);

async function readSource(path: URL) {
  return Bun.file(path).text();
}

describe("global vs workspace shell routing", () => {
  test("app root route renders outlet only without workspace sidebar layout", async () => {
    const source = await readSource(appRoutePath);
    expect(source).toContain("<Outlet />");
    expect(source).not.toContain('from "@/components/site/app-layout"');
    expect(source).not.toContain("GlobalAppLayout");
  });

  test("/app index uses global shell and workspace overview", async () => {
    const source = await readSource(appIndexPath);
    expect(source).toContain("GlobalAppLayout");
    expect(source).toContain("WorkspaceOverviewPage");
    expect(source).not.toContain('from "@/components/site/app-layout"');
  });

  test("workspace routes use pathless _workspace layout with AppLayout", async () => {
    const source = await readSource(workspaceRoutePath);
    expect(source).toContain("WorkspaceShellGuard");
    expect(source).toContain("AppLayout");
  });
});

describe("global shell presentation", () => {
  test("/app global layout has no workspace sidebar or switcher", async () => {
    const globalLayout = await readSource(globalLayoutPath);
    const appLayout = await readSource(appLayoutPath);

    expect(globalLayout).toContain('data-testid="global-app-layout"');
    expect(globalLayout).not.toContain("SidebarProvider");
    expect(globalLayout).not.toContain("WorkspaceSwitcher");
    expect(appLayout).toContain('data-testid="workspace-sidebar"');
    expect(appLayout).toContain("WorkspaceSwitcher");
  });

  test("global header hides workspace-scoped search", async () => {
    const source = await readSource(globalLayoutPath);
    expect(source).toContain("showSearch={false}");
    expect(source).toContain("showLogo");
  });

  test("mobile global shell has no sidebar navigation primitives", async () => {
    const source = await readSource(globalLayoutPath);
    expect(source).not.toContain("SidebarMenu");
    expect(source).not.toContain("collapsible=\"icon\"");
  });
});

describe("workspace shell presentation", () => {
  test("workspace layout keeps sidebar navigation and switcher", async () => {
    const source = await readSource(appLayoutPath);
    expect(source).toContain("APP_NAV_ITEMS");
    expect(source).toContain("WorkspaceSwitcher");
    expect(source).toContain('data-testid="sidebar-all-workspaces"');
    expect(source).toContain("workspaceOverview.allWorkspaces");
  });

  test("resolveActiveNav treats /app as global overview without workspace home highlight", () => {
    expect(resolveActiveNav("/app")).toBeNull();
    expect(resolveActiveNav("/app/dashboard")).toBe("home");
    expect(resolveActiveNav("/app/tasks")).toBe("tasks");
  });
});

describe("workspace overview interactions", () => {
  test("open workspace selects project and navigates to dashboard", async () => {
    const source = await readSource(overviewSourcePath);
    expect(source).toContain("setSelectedProjectId");
    expect(source).toContain('navigate({ to: "/app/dashboard" })');
  });

  test("workspace switcher links back to all workspaces overview", async () => {
    const source = await readSource(switcherSourcePath);
    expect(source).toContain('to="/app"');
    expect(source).toContain("workspaceOverview.allWorkspaces");
    expect(source).toContain("setSelectedProjectId");
  });
});

describe("no-workspace workspace shell guard", () => {
  test("redirects empty workspace routes to /app except projects connect flow", async () => {
    const source = await readSource(shellGuardPath);
    expect(source).toContain('navigate({ to: "/app", replace: true })');
    expect(source).toContain('pathname.startsWith("/app/projects")');
  });
});

describe("shell i18n labels", () => {
  test("EN and ID workspace overview navigation labels", () => {
    expect(translate("en", "workspaceOverview.title")).toBe("Your Workspaces");
    expect(translate("id", "workspaceOverview.title")).toBe("Workspace Anda");
    expect(translate("en", "workspaceOverview.allWorkspaces")).toBe("All workspaces");
    expect(translate("id", "workspaceOverview.allWorkspaces")).toBe("Semua workspace");
    expect(translate("en", "workspaceOverview.openWorkspace")).toBe("Open workspace");
    expect(translate("id", "workspaceOverview.openWorkspace")).toBe("Buka workspace");
  });
});
