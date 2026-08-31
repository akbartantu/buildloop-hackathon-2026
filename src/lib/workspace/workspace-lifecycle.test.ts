import { describe, expect, test, beforeEach } from "bun:test";

import { createDevProjectRepository, devProjectUserId } from "@/lib/projects/dev-project-repository";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import {
  isProjectRepositoryConnected,
  projectDisplayName,
} from "@/lib/projects/project-record";
import { DIFFERENT_REPOSITORY_REQUIRES_NEW_WORKSPACE_MESSAGE } from "@/lib/repository/repository-connection-errors";
import { assertTaskProjectExecutionSafe } from "@/lib/workspace/execution-guard";
import type { TaskRecord } from "@/lib/tasks-schema";

const USER = devProjectUserId();

describe("workspace repository lifecycle", () => {
  let projects: ReturnType<typeof createDevProjectRepository>;

  beforeEach(async () => {
    projects = createDevProjectRepository();
    await projects.resetForTests();
  });

  test("connected project is reported as connected", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/a",
      repositoryUrl: "https://github.com/owner/a",
      repositoryOwner: "owner",
      repositoryName: "a",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    expect(isProjectRepositoryConnected(project)).toBe(true);
    expect(projectDisplayName(project)).toBe("owner/a");
  });

  test("refresh updates workspace metadata without changing project identity", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/a",
      repositoryUrl: "https://github.com/owner/a",
      repositoryOwner: "owner",
      repositoryName: "a",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const refreshed = await projects.refreshPublicGitHubProject({
      userId: USER,
      projectId: project.id,
      defaultBranch: "main",
      connectedCommitSha: "def4567890abcdef4567890abcdef4567890abcd",
    });

    expect(refreshed.id).toBe(project.id);
    expect(refreshed.repositoryUrl).toBe("https://github.com/owner/a");
    expect(refreshed.connectedCommitSha).toBe("def4567890abcdef4567890abcdef4567890abcd");
  });

  test("refresh does not mutate existing task source_commit_sha", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/a",
      repositoryUrl: "https://github.com/owner/a",
      repositoryOwner: "owner",
      repositoryName: "a",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const tasks = createDevTaskRepository({
      getProject: async (id, userId) => {
        const loaded = await projects.getProject(id, userId);
        if (!loaded) return null;
        return {
          repositoryUrl: loaded.repositoryUrl,
          connectedCommitSha: loaded.connectedCommitSha,
          disconnectedAt: loaded.disconnectedAt,
        };
      },
    });
    await tasks.resetForTests();

    const task = await tasks.createTask({
      userId: USER,
      goal: "Add a small utility with a focused test without touching protected files.",
      projectId: project.id,
    });

    await projects.refreshPublicGitHubProject({
      userId: USER,
      projectId: project.id,
      defaultBranch: "main",
      connectedCommitSha: "def4567890abcdef4567890abcdef4567890abcd",
    });

    const reloaded = await tasks.getTask(task.id);
    expect(reloaded?.sourceCommitSha).toBe("abc1234567890abcdef1234567890abcdef123456");
  });

  test("different repository URL creates a separate workspace project", async () => {
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
      connectedCommitSha: "bbb4567890abcdef4567890abcdef4567890bbb",
    });

    expect(projectA.id).not.toBe(projectB.id);
    expect(projectA.repositoryUrl).not.toBe(projectB.repositoryUrl);
  });

  test("disconnect preserves project record and historical tasks", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/a",
      repositoryUrl: "https://github.com/owner/a",
      repositoryOwner: "owner",
      repositoryName: "a",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const tasks = createDevTaskRepository({
      getProject: async (id, userId) => {
        const loaded = await projects.getProject(id, userId);
        if (!loaded) return null;
        return {
          repositoryUrl: loaded.repositoryUrl,
          connectedCommitSha: loaded.connectedCommitSha,
          disconnectedAt: loaded.disconnectedAt,
        };
      },
    });
    await tasks.resetForTests();

    const task = await tasks.createTask({
      userId: USER,
      goal: "Add a small utility with a focused test without touching protected files.",
      projectId: project.id,
    });

    const disconnected = await projects.disconnectPublicGitHubProject({
      userId: USER,
      projectId: project.id,
    });

    expect(isProjectRepositoryConnected(disconnected)).toBe(false);
    expect(disconnected.repositoryUrl).toBe("https://github.com/owner/a");

    const preserved = await tasks.getTask(task.id);
    expect(preserved?.projectId).toBe(project.id);
    expect(preserved?.sourceCommitSha).toBe("abc1234567890abcdef1234567890abcdef123456");
  });

  test("disconnected workspace blocks new task creation", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/a",
      repositoryUrl: "https://github.com/owner/a",
      repositoryOwner: "owner",
      repositoryName: "a",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    await projects.disconnectPublicGitHubProject({
      userId: USER,
      projectId: project.id,
    });

    const tasks = createDevTaskRepository({
      getProject: async (id, userId) => {
        const loaded = await projects.getProject(id, userId);
        if (!loaded) return null;
        return {
          repositoryUrl: loaded.repositoryUrl,
          connectedCommitSha: loaded.connectedCommitSha,
          disconnectedAt: loaded.disconnectedAt,
        };
      },
    });
    await tasks.resetForTests();

    await expect(
      tasks.createTask({
        userId: USER,
        goal: "Add a small utility with a focused test without touching protected files.",
        projectId: project.id,
      }),
    ).rejects.toThrow(/disconnected/i);
  });

  test("execution guard rejects disconnected project", () => {
    const task = {
      projectId: "project-a",
      workspace: "https://github.com/owner/a",
      sourceCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    } as TaskRecord;

    expect(() =>
      assertTaskProjectExecutionSafe({
        task,
        project: {
          repositoryUrl: "https://github.com/owner/a",
          connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
          disconnectedAt: new Date().toISOString(),
        },
      }),
    ).toThrow(/disconnected/i);
  });

  test("different repository requires new workspace message is defined", () => {
    expect(DIFFERENT_REPOSITORY_REQUIRES_NEW_WORKSPACE_MESSAGE).toContain("new workspace");
  });
});
