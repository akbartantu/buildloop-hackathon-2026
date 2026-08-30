import { describe, expect, test, beforeEach } from "bun:test";

import { createDevProjectRepository } from "@/lib/projects/dev-project-repository";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import { devProjectUserId } from "@/lib/projects/dev-project-repository";
import { validatePublicGitHubUrl } from "@/lib/repository/public-github-url";

const USER_A = devProjectUserId();
const USER_B = "00000000-0000-4000-8000-000000000099";

describe("project persistence", () => {
  let projects: ReturnType<typeof createDevProjectRepository>;

  beforeEach(async () => {
    projects = createDevProjectRepository();
    await projects.resetForTests();
  });

  test("user can create own project", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER_A,
      name: "octocat/Hello-World",
      repositoryUrl: "https://github.com/octocat/Hello-World",
      repositoryOwner: "octocat",
      repositoryName: "Hello-World",
      defaultBranch: "master",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(project.repositoryUrl).toBe("https://github.com/octocat/Hello-World");
  });

  test("user can read own project", async () => {
    const created = await projects.upsertPublicGitHubProject({
      userId: USER_A,
      name: "octocat/Hello-World",
      repositoryUrl: "https://github.com/octocat/Hello-World",
      repositoryOwner: "octocat",
      repositoryName: "Hello-World",
      defaultBranch: "master",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const loaded = await projects.getProject(created.id, USER_A);
    expect(loaded?.id).toBe(created.id);
  });

  test("user cannot read another user's project", async () => {
    const created = await projects.upsertPublicGitHubProject({
      userId: USER_A,
      name: "octocat/Hello-World",
      repositoryUrl: "https://github.com/octocat/Hello-World",
      repositoryOwner: "octocat",
      repositoryName: "Hello-World",
      defaultBranch: "master",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    expect(await projects.getProject(created.id, USER_B)).toBeNull();
  });

  test("persisted project survives reload", async () => {
    const created = await projects.upsertPublicGitHubProject({
      userId: USER_A,
      name: "octocat/Hello-World",
      repositoryUrl: "https://github.com/octocat/Hello-World",
      repositoryOwner: "octocat",
      repositoryName: "Hello-World",
      defaultBranch: "master",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const reloaded = createDevProjectRepository();
    const listed = await reloaded.listProjects(USER_A);
    expect(listed.some((project) => project.id === created.id)).toBe(true);
  });

  test("task stores project_id and immutable source_commit_sha", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER_A,
      name: "octocat/Hello-World",
      repositoryUrl: "https://github.com/octocat/Hello-World",
      repositoryOwner: "octocat",
      repositoryName: "Hello-World",
      defaultBranch: "master",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const tasks = createDevTaskRepository({
      getProject: async (id, userId) => {
        const loaded = await projects.getProject(id, userId);
        if (!loaded) return null;
        return {
          repositoryUrl: loaded.repositoryUrl,
          connectedCommitSha: loaded.connectedCommitSha,
        };
      },
    });
    await tasks.resetForTests();

    const task = await tasks.createTask({
      userId: USER_A,
      goal: "Add a small utility with a focused test without touching protected files.",
      projectId: project.id,
    });

    expect(task.projectId).toBe(project.id);
    expect(task.sourceCommitSha).toBe("abc1234567890abcdef1234567890abcdef123456");
    expect(task.workspace).toBe("https://github.com/octocat/Hello-World");
  });

  test("project refresh does not mutate existing task source_commit_sha", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER_A,
      name: "octocat/Hello-World",
      repositoryUrl: "https://github.com/octocat/Hello-World",
      repositoryOwner: "octocat",
      repositoryName: "Hello-World",
      defaultBranch: "master",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const tasks = createDevTaskRepository({
      getProject: async (id, userId) => {
        const loaded = await projects.getProject(id, userId);
        if (!loaded) return null;
        return {
          repositoryUrl: loaded.repositoryUrl,
          connectedCommitSha: loaded.connectedCommitSha,
        };
      },
    });
    await tasks.resetForTests();

    const task = await tasks.createTask({
      userId: USER_A,
      goal: "Add a small utility with a focused test without touching protected files.",
      projectId: project.id,
    });

    await projects.upsertPublicGitHubProject({
      userId: USER_A,
      name: "octocat/Hello-World",
      repositoryUrl: "https://github.com/octocat/Hello-World",
      repositoryOwner: "octocat",
      repositoryName: "Hello-World",
      defaultBranch: "master",
      connectedCommitSha: "def4567890abcdef4567890abcdef4567890abcd",
    });

    const reloaded = await tasks.getTask(task.id);
    expect(reloaded?.sourceCommitSha).toBe("abc1234567890abcdef1234567890abcdef123456");
  });

  test("existing task rows without project_id still load safely", async () => {
    const tasks = createDevTaskRepository();
    await tasks.resetForTests();

    const task = await tasks.createTask({
      userId: USER_A,
      goal: "Add a small utility with a focused test without touching protected files.",
    });

    expect(task.projectId).toBeNull();
    expect(task.sourceCommitSha).toBeNull();
  });
});

describe("validatePublicGitHubUrl trailing git normalization", () => {
  test("accepts trailing .git", () => {
    const result = validatePublicGitHubUrl("https://github.com/octocat/Hello-World.git");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedUrl).toBe("https://github.com/octocat/Hello-World");
    }
  });

  test("rejects malformed repository path", () => {
    const result = validatePublicGitHubUrl("https://github.com/octocat");
    expect(result.ok).toBe(false);
  });
});
