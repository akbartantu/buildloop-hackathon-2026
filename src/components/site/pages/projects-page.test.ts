import { describe, expect, test } from "bun:test";

import { translate } from "@/i18n";

const projectsSourcePath = new URL("./projects-page.tsx", import.meta.url);
const switcherSourcePath = new URL("../workspace-switcher.tsx", import.meta.url);
const settingsSourcePath = new URL("./settings-pages.tsx", import.meta.url);

async function readSource(path: URL) {
  return Bun.file(path).text();
}

describe("projects page repository lifecycle UX", () => {
  test("connect form is hidden when repository is connected", async () => {
    const source = await readSource(projectsSourcePath);
    expect(source).toContain("!isRepositoryConnected");
    expect(source).toContain("isRepositoryConnected");
    expect(source).not.toMatch(/connectTitle[\s\S]*always/);
  });

  test("connected state uses state-aware copy keys", async () => {
    const source = await readSource(projectsSourcePath);
    expect(source).toContain("projects.descriptionConnected");
    expect(source).toContain("projects.descriptionDisconnected");
    expect(source).toContain("projects.connectAnotherRepository");
    expect(source).toContain("projects.createWorkspace");
  });

  test("refresh and workspace settings actions exist for connected state", async () => {
    const source = await readSource(projectsSourcePath);
    expect(source).toContain("projects.refreshRepository");
    expect(source).toContain("projects.workspaceSettings");
    expect(source).toContain("handleRefresh");
  });

  test("create workspace flow uses create_workspace intent", async () => {
    const source = await readSource(projectsSourcePath);
    expect(source).toContain('intent="create_workspace"');
  });

  test("workspace switcher links to create workspace mode", async () => {
    const source = await readSource(switcherSourcePath);
    expect(source).toContain('search={{ create: "1" }}');
  });
});

describe("workspace switcher", () => {
  test("uses create workspace action instead of connect repository", async () => {
    const source = await readSource(switcherSourcePath);
    expect(source).toContain("projects.createWorkspace");
    expect(source).not.toContain("projects.connectButton");
  });

  test("workspace label is i18n-backed", async () => {
    const source = await readSource(switcherSourcePath);
    expect(source).toContain("workspace.label");
  });
});

describe("settings workspace tab", () => {
  test("settings includes workspace tab between profile and environment", async () => {
    const source = await readSource(settingsSourcePath);
    expect(source).toContain('value="workspace"');
    expect(source).toContain("WorkspaceSettingsSection");
    expect(source).toContain("settings.tabs.workspace");
    expect(source).toContain("projects.disconnectRepository");
    expect(source).toContain("projects.refreshRepository");
  });
});

describe("projects i18n", () => {
  test("English connected and disconnected copy", () => {
    expect(translate("en", "projects.descriptionConnected")).toContain("connected");
    expect(translate("en", "projects.descriptionDisconnected")).toContain("Connect one");
    expect(translate("en", "projects.createWorkspace")).toBe("Create workspace");
  });

  test("Indonesian workspace lifecycle copy", () => {
    expect(translate("id", "projects.createWorkspace")).toBe("Buat workspace");
    expect(translate("id", "projects.statusConnected")).toBe("Terhubung");
    expect(translate("id", "settings.tabs.workspace")).toBe("Workspace");
  });
});
