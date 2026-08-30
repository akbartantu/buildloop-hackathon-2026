import { describe, expect, test, beforeEach } from "bun:test";

import { createDevProjectRepository, devProjectUserId } from "@/lib/projects/dev-project-repository";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import { resolveActiveProjectId } from "./active-project";

const USER = devProjectUserId();

describe("resolveActiveProjectId", () => {
  test("auto-selects the only connected project", () => {
    expect(resolveActiveProjectId([{ id: "project-a" }], null)).toBe("project-a");
  });

  test("restores a valid stored project when multiple exist", () => {
    const projects = [{ id: "project-a" }, { id: "project-b" }];
    expect(resolveActiveProjectId(projects, "project-b")).toBe("project-b");
  });

  test("falls back safely when stored selection is stale", () => {
    const projects = [{ id: "project-a" }, { id: "project-b" }];
    expect(resolveActiveProjectId(projects, "missing-project")).toBe("project-a");
  });
});

describe("project-scoped task listing", () => {
  let projects: ReturnType<typeof createDevProjectRepository>;
  let tasks: ReturnType<typeof createDevTaskRepository>;

  beforeEach(async () => {
    projects = createDevProjectRepository();
    await projects.resetForTests();

    tasks = createDevTaskRepository({
      getProject: async (id, userId) => {
        const project = await projects.getProject(id, userId);
        if (!project) return null;
        return {
          repositoryUrl: project.repositoryUrl,
          connectedCommitSha: project.connectedCommitSha,
        };
      },
    });
    await tasks.resetForTests();
  });

  test("tasks are created with the requested project_id", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/a",
      repositoryUrl: "https://github.com/owner/a",
      repositoryOwner: "owner",
      repositoryName: "a",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const created = await tasks.createTask({
      userId: USER,
      goal: "Update README subtitle to mention governed autonomous software delivery.",
      projectId: project.id,
    });

    expect(created.projectId).toBe(project.id);
    expect(created.workspace).toBe("https://github.com/owner/a");
  });

  test("project A tasks are not returned when listing project B", async () => {
    const projectA = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/a",
      repositoryUrl: "https://github.com/owner/a",
      repositoryOwner: "owner",
      repositoryName: "a",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });
    const projectB = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/b",
      repositoryUrl: "https://github.com/owner/b",
      repositoryOwner: "owner",
      repositoryName: "b",
      defaultBranch: "main",
      connectedCommitSha: "def4567890abcdef4567890abcdef4567890abcd",
    });

    await tasks.createTask({
      userId: USER,
      goal: "Task for project A with enough goal length.",
      projectId: projectA.id,
    });
    await tasks.createTask({
      userId: USER,
      goal: "Task for project B with enough goal length.",
      projectId: projectB.id,
    });

    const projectAList = await tasks.listTasks(USER, { projectId: projectA.id });
    const projectBList = await tasks.listTasks(USER, { projectId: projectB.id });

    expect(projectAList.every((item) => item.projectId === projectA.id)).toBe(true);
    expect(projectBList.every((item) => item.projectId === projectB.id)).toBe(true);
    expect(projectAList.some((item) => item.projectId === projectB.id)).toBe(false);
  });

  test("demo tasks remain available when project_id is null", async () => {
    await tasks.createTask({
      userId: USER,
      goal: "Demo task without project linkage for controlled workspace.",
    });

    const demoTasks = await tasks.listTasks(USER, { projectId: null });
    expect(demoTasks.every((item) => item.projectId === null)).toBe(true);
  });
});
