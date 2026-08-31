import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import type { ValidatedSpecificationBundleFile } from "./specification-bundle-upload";
import { parseSpecificationContent } from "./specification-parser";
import {
  buildSpecificationsCatalog,
  flattenCatalogForPlanning,
} from "./specification-planning";
import {
  toSpecificationRecord,
  type SpecificationDocumentType,
  type SpecificationRecord,
} from "./specification-record";
import {
  toSpecificationSetFileRecord,
  toSpecificationSetRecord,
  type PlanningSpecificationEntry,
  type ProjectSpecificationsCatalog,
  type SpecificationSetFileRecord,
  type SpecificationSetWithFiles,
} from "./specification-set-record";

function projectRoot(): string {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

function storePath(): string {
  return path.join(projectRoot(), ".buildloop", "dev-specifications.json");
}

type DevSpecificationStore = {
  specifications: Array<{
    id: string;
    projectId: string;
    userId: string;
    filename: string;
    originalPath: string | null;
    documentType: SpecificationDocumentType;
    content: string;
    parseStatus: "pending" | "ready" | "failed" | "unsupported";
    summary: string | null;
    requirementCount: number | null;
    constraintCount: number | null;
    flowCount: number | null;
    createdAt: string;
    updatedAt: string;
    parsedAt: string | null;
  }>;
  specificationSets: Array<{
    id: string;
    projectId: string;
    userId: string;
    name: string;
    documentType: SpecificationDocumentType;
    parseStatus: "pending" | "ready" | "failed" | "unsupported";
    summary: string | null;
    requirementCount: number | null;
    constraintCount: number | null;
    flowCount: number | null;
    fileCount: number;
    createdAt: string;
    updatedAt: string;
  }>;
  specificationSetFiles: Array<{
    id: string;
    setId: string;
    filename: string;
    relativePath: string;
    fileRole: SpecificationSetFileRecord["fileRole"];
    sortOrder: number;
    content: string;
    parseStatus: "pending" | "ready" | "failed" | "unsupported";
    summary: string | null;
    requirementCount: number | null;
    constraintCount: number | null;
    flowCount: number | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

function emptyStore(): DevSpecificationStore {
  return { specifications: [], specificationSets: [], specificationSetFiles: [] };
}

async function readStore(): Promise<DevSpecificationStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<DevSpecificationStore>;
    return {
      specifications: parsed.specifications ?? [],
      specificationSets: parsed.specificationSets ?? [],
      specificationSetFiles: parsed.specificationSetFiles ?? [],
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: DevSpecificationStore): Promise<void> {
  const filePath = storePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

function toRecord(item: DevSpecificationStore["specifications"][number]): SpecificationRecord {
  return {
    id: item.id,
    projectId: item.projectId,
    filename: item.filename,
    originalPath: item.originalPath,
    documentType: item.documentType,
    content: item.content,
    parseStatus: item.parseStatus,
    summary: item.summary,
    requirementCount: item.requirementCount,
    constraintCount: item.constraintCount,
    flowCount: item.flowCount,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    parsedAt: item.parsedAt,
  };
}

function toSetWithFiles(
  store: DevSpecificationStore,
  setItem: DevSpecificationStore["specificationSets"][number],
): SpecificationSetWithFiles {
  const files = store.specificationSetFiles
    .filter((file) => file.setId === setItem.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((file) => toSpecificationSetFileRecord({
      id: file.id,
      set_id: file.setId,
      filename: file.filename,
      relative_path: file.relativePath,
      file_role: file.fileRole,
      sort_order: file.sortOrder,
      content: file.content,
      parse_status: file.parseStatus,
      summary: file.summary,
      requirement_count: file.requirementCount,
      constraint_count: file.constraintCount,
      flow_count: file.flowCount,
      created_at: file.createdAt,
      updated_at: file.updatedAt,
    }));

  return {
    ...toSpecificationSetRecord({
      id: setItem.id,
      project_id: setItem.projectId,
      user_id: setItem.userId,
      name: setItem.name,
      document_type: setItem.documentType,
      parse_status: setItem.parseStatus,
      summary: setItem.summary,
      requirement_count: setItem.requirementCount,
      constraint_count: setItem.constraintCount,
      flow_count: setItem.flowCount,
      file_count: setItem.fileCount,
      created_at: setItem.createdAt,
      updated_at: setItem.updatedAt,
    }),
    files,
  };
}

export type DevSpecificationRepository = ReturnType<typeof createDevSpecificationRepository>;

export function createDevSpecificationRepository() {
  return {
    async createSpecification(input: {
      userId: string;
      projectId: string;
      filename: string;
      originalPath: string | null;
      documentType: SpecificationDocumentType;
      content: string;
    }): Promise<SpecificationRecord> {
      const store = await readStore();
      const now = new Date().toISOString();
      const parsed = parseSpecificationContent(input.content, input.filename);
      const item = {
        id: randomUUID(),
        projectId: input.projectId,
        userId: input.userId,
        filename: input.filename,
        originalPath: input.originalPath,
        documentType: input.documentType,
        content: input.content,
        parseStatus: "ready" as const,
        summary: parsed.summary,
        requirementCount: parsed.requirementCount,
        constraintCount: parsed.constraintCount,
        flowCount: parsed.flowCount,
        createdAt: now,
        updatedAt: now,
        parsedAt: now,
      };
      store.specifications.unshift(item);
      await writeStore(store);
      return toRecord(item);
    },

    async createSpecificationSet(input: {
      userId: string;
      projectId: string;
      name: string;
      documentType: SpecificationDocumentType;
      summary: string;
      requirementCount: number;
      constraintCount: number;
      flowCount: number;
      files: ValidatedSpecificationBundleFile[];
    }): Promise<SpecificationSetWithFiles> {
      const store = await readStore();
      const now = new Date().toISOString();
      const setId = randomUUID();
      const setItem = {
        id: setId,
        projectId: input.projectId,
        userId: input.userId,
        name: input.name,
        documentType: input.documentType,
        parseStatus: "ready" as const,
        summary: input.summary,
        requirementCount: input.requirementCount,
        constraintCount: input.constraintCount,
        flowCount: input.flowCount,
        fileCount: input.files.length,
        createdAt: now,
        updatedAt: now,
      };

      const fileItems = input.files.map((file) => ({
        id: randomUUID(),
        setId,
        filename: file.filename,
        relativePath: file.relativePath,
        fileRole: file.fileRole,
        sortOrder: file.sortOrder,
        content: file.content,
        parseStatus: "ready" as const,
        summary: file.summary,
        requirementCount: file.requirementCount,
        constraintCount: file.constraintCount,
        flowCount: file.flowCount,
        createdAt: now,
        updatedAt: now,
      }));

      store.specificationSets.unshift(setItem);
      store.specificationSetFiles.unshift(...fileItems);
      await writeStore(store);
      return toSetWithFiles(store, setItem);
    },

    async listSpecifications(projectId: string, userId: string): Promise<SpecificationRecord[]> {
      const store = await readStore();
      return store.specifications
        .filter((item) => item.projectId === projectId && item.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(toRecord);
    },

    async listSpecificationSets(
      projectId: string,
      userId: string,
    ): Promise<SpecificationSetWithFiles[]> {
      const store = await readStore();
      return store.specificationSets
        .filter((item) => item.projectId === projectId && item.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((setItem) => toSetWithFiles(store, setItem));
    },

    async listSpecificationsCatalog(
      projectId: string,
      userId: string,
    ): Promise<ProjectSpecificationsCatalog> {
      const documents = await this.listSpecifications(projectId, userId);
      const sets = await this.listSpecificationSets(projectId, userId);
      return buildSpecificationsCatalog(documents, sets);
    },

    async listPlanningSpecifications(
      projectId: string,
      userId: string,
    ): Promise<PlanningSpecificationEntry[]> {
      const catalog = await this.listSpecificationsCatalog(projectId, userId);
      return flattenCatalogForPlanning(catalog);
    },

    async deleteSpecification(input: {
      id: string;
      projectId: string;
      userId: string;
    }): Promise<boolean> {
      const store = await readStore();
      const index = store.specifications.findIndex(
        (item) =>
          item.id === input.id && item.projectId === input.projectId && item.userId === input.userId,
      );
      if (index < 0) {
        return false;
      }
      store.specifications.splice(index, 1);
      await writeStore(store);
      return true;
    },

    async deleteSpecificationSet(input: {
      id: string;
      projectId: string;
      userId: string;
    }): Promise<boolean> {
      const store = await readStore();
      const index = store.specificationSets.findIndex(
        (item) =>
          item.id === input.id && item.projectId === input.projectId && item.userId === input.userId,
      );
      if (index < 0) {
        return false;
      }
      const setId = store.specificationSets[index]!.id;
      store.specificationSets.splice(index, 1);
      store.specificationSetFiles = store.specificationSetFiles.filter((file) => file.setId !== setId);
      await writeStore(store);
      return true;
    },

    async getSpecificationDownload(input: {
      id: string;
      projectId: string;
      userId: string;
    }): Promise<{ filename: string; content: string } | null> {
      const store = await readStore();
      const item = store.specifications.find(
        (spec) =>
          spec.id === input.id && spec.projectId === input.projectId && spec.userId === input.userId,
      );
      if (!item) {
        return null;
      }
      return { filename: item.filename, content: item.content };
    },

    async getSpecificationSetFileDownload(input: {
      fileId: string;
      setId: string;
      projectId: string;
      userId: string;
    }): Promise<{ filename: string; content: string } | null> {
      const store = await readStore();
      const setItem = store.specificationSets.find(
        (set) =>
          set.id === input.setId && set.projectId === input.projectId && set.userId === input.userId,
      );
      if (!setItem) {
        return null;
      }
      const file = store.specificationSetFiles.find(
        (item) => item.id === input.fileId && item.setId === input.setId,
      );
      if (!file) {
        return null;
      }
      return { filename: file.filename, content: file.content };
    },

    async resetForTests(): Promise<void> {
      await writeStore(emptyStore());
    },
  };
}
