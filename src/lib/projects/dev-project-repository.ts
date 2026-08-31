import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import { toProjectRecord, type ProjectRecord } from "./project-record";

function projectRoot(): string {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

function storePath(): string {
  return path.join(projectRoot(), ".buildloop", "dev-projects.json");
}

type DevProjectStore = {
  projects: Array<{
    id: string;
    userId: string;
    name: string;
    sourceType: "public_github";
    repositoryUrl: string;
    repositoryOwner: string;
    repositoryName: string;
    defaultBranch: string | null;
    connectedCommitSha: string | null;
    disconnectedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

function emptyStore(): DevProjectStore {
  return { projects: [] };
}

async function readStore(): Promise<DevProjectStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as DevProjectStore;
    return {
      projects: parsed.projects.map((project) => ({
        ...project,
        disconnectedAt: project.disconnectedAt ?? null,
      })),
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: DevProjectStore): Promise<void> {
  const filePath = storePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

function toRecord(project: DevProjectStore["projects"][number]): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    sourceType: "public_github",
    repositoryUrl: project.repositoryUrl,
    repositoryOwner: project.repositoryOwner,
    repositoryName: project.repositoryName,
    defaultBranch: project.defaultBranch,
    connectedCommitSha: project.connectedCommitSha,
    disconnectedAt: project.disconnectedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export type DevProjectRepository = ReturnType<typeof createDevProjectRepository>;

export function createDevProjectRepository() {
  return {
    async upsertPublicGitHubProject(input: {
      userId: string;
      name: string;
      repositoryUrl: string;
      repositoryOwner: string;
      repositoryName: string;
      defaultBranch: string;
      connectedCommitSha: string;
    }): Promise<ProjectRecord> {
      const store = await readStore();
      const now = new Date().toISOString();
      const existingIndex = store.projects.findIndex(
        (project) => project.userId === input.userId && project.repositoryUrl === input.repositoryUrl,
      );

      if (existingIndex >= 0) {
        const existing = store.projects[existingIndex]!;
        existing.name = input.name;
        existing.defaultBranch = input.defaultBranch;
        existing.connectedCommitSha = input.connectedCommitSha;
        existing.disconnectedAt = null;
        existing.updatedAt = now;
        await writeStore(store);
        return toRecord(existing);
      }

      const project = {
        id: randomUUID(),
        userId: input.userId,
        name: input.name,
        sourceType: "public_github" as const,
        repositoryUrl: input.repositoryUrl,
        repositoryOwner: input.repositoryOwner,
        repositoryName: input.repositoryName,
        defaultBranch: input.defaultBranch,
        connectedCommitSha: input.connectedCommitSha,
        disconnectedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      store.projects.unshift(project);
      await writeStore(store);
      return toRecord(project);
    },

    async refreshPublicGitHubProject(input: {
      userId: string;
      projectId: string;
      defaultBranch: string;
      connectedCommitSha: string;
    }): Promise<ProjectRecord> {
      const store = await readStore();
      const project = store.projects.find(
        (item) => item.id === input.projectId && item.userId === input.userId,
      );
      if (!project) {
        throw new Error("Project not found.");
      }

      const now = new Date().toISOString();
      project.defaultBranch = input.defaultBranch;
      project.connectedCommitSha = input.connectedCommitSha;
      project.disconnectedAt = null;
      project.updatedAt = now;
      await writeStore(store);
      return toRecord(project);
    },

    async disconnectPublicGitHubProject(input: {
      userId: string;
      projectId: string;
    }): Promise<ProjectRecord> {
      const store = await readStore();
      const project = store.projects.find(
        (item) => item.id === input.projectId && item.userId === input.userId,
      );
      if (!project) {
        throw new Error("Project not found.");
      }

      const now = new Date().toISOString();
      project.disconnectedAt = now;
      project.updatedAt = now;
      await writeStore(store);
      return toRecord(project);
    },

    async listProjects(userId: string): Promise<ProjectRecord[]> {
      const store = await readStore();
      return store.projects
        .filter((project) => project.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(toRecord);
    },

    async getProject(id: string, userId: string): Promise<ProjectRecord | null> {
      const store = await readStore();
      const project = store.projects.find((item) => item.id === id && item.userId === userId);
      return project ? toRecord(project) : null;
    },

    async resetForTests(): Promise<void> {
      await writeStore(emptyStore());
    },
  };
}

export function devProjectUserId(): string {
  return DEV_AUTH_BYPASS_USER_ID;
}
