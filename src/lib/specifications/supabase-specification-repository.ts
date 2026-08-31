import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { ValidatedSpecificationBundleFile } from "./specification-bundle-upload";
import { parseSpecificationContent } from "./specification-parser";
import {
  buildSpecificationsCatalog,
  flattenCatalogForPlanning,
} from "./specification-planning";
import {
  toPersistedDocumentType,
  toSpecificationRecord,
  type SpecificationDocumentType,
  type SpecificationRecord,
  type SpecificationRowShape,
} from "./specification-record";
import {
  toSpecificationSetFileRecord,
  toSpecificationSetRecord,
  type PlanningSpecificationEntry,
  type ProjectSpecificationsCatalog,
  type SpecificationSetFileRowShape,
  type SpecificationSetRowShape,
  type SpecificationSetWithFiles,
} from "./specification-set-record";

const DOCUMENT_COLUMNS =
  "id, project_id, filename, original_path, document_type, content, parse_status, summary, requirement_count, constraint_count, flow_count, created_at, updated_at, parsed_at";

const SET_COLUMNS =
  "id, project_id, user_id, name, document_type, parse_status, summary, requirement_count, constraint_count, flow_count, file_count, created_at, updated_at";

const SET_FILE_COLUMNS =
  "id, set_id, filename, relative_path, file_role, sort_order, content, parse_status, summary, requirement_count, constraint_count, flow_count, created_at, updated_at";

export class SpecificationPersistenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SpecificationPersistenceError";
    this.code = code;
  }
}

function classifyPersistenceErrorCode(postgresCode: string | undefined): string {
  switch (postgresCode) {
    case "23514":
      return "document_type_check_violation";
    case "42501":
      return "rls_denied";
    case "23503":
      return "foreign_key_violation";
    case "23505":
      return "unique_violation";
    default:
      return "persist_failed";
  }
}

function throwSpecificationPersistenceFailure(
  operation: string,
  error: { code?: string; message?: string } | null,
): never {
  const postgresCode = error?.code;
  const code = classifyPersistenceErrorCode(postgresCode);
  console.error(`[specifications] ${operation} failed`, {
    code,
    postgresCode: postgresCode ?? "unknown",
  });
  throw new SpecificationPersistenceError(code, "Specification could not be saved.");
}

export type SupabaseSpecificationRepository = ReturnType<typeof createSupabaseSpecificationRepository>;

export function createSupabaseSpecificationRepository(supabase: SupabaseClient<Database>) {
  return {
    async createSpecification(input: {
      userId: string;
      projectId: string;
      filename: string;
      originalPath: string | null;
      documentType: SpecificationDocumentType;
      content: string;
    }): Promise<SpecificationRecord> {
      const parsed = parseSpecificationContent(input.content, input.filename);
      const now = new Date().toISOString();
      const { data: row, error } = await supabase
        .from("project_specifications")
        .insert({
          user_id: input.userId,
          project_id: input.projectId,
          filename: input.filename,
          original_path: input.originalPath,
          document_type: toPersistedDocumentType(input.documentType),
          content: input.content,
          parse_status: "ready",
          summary: parsed.summary,
          requirement_count: parsed.requirementCount,
          constraint_count: parsed.constraintCount,
          flow_count: parsed.flowCount,
          parsed_at: now,
        })
        .select(DOCUMENT_COLUMNS)
        .single();

      if (error || !row) {
        throwSpecificationPersistenceFailure("createSpecification", error);
      }

      return toSpecificationRecord(row as SpecificationRowShape);
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
      const { data: setRow, error: setError } = await supabase
        .from("project_specification_sets")
        .insert({
          user_id: input.userId,
          project_id: input.projectId,
          name: input.name,
          document_type: toPersistedDocumentType(input.documentType),
          parse_status: "ready",
          summary: input.summary,
          requirement_count: input.requirementCount,
          constraint_count: input.constraintCount,
          flow_count: input.flowCount,
          file_count: input.files.length,
        })
        .select(SET_COLUMNS)
        .single();

      if (setError || !setRow) {
        throwSpecificationPersistenceFailure("createSpecificationSet", setError);
      }

      const fileRows = input.files.map((file) => ({
        set_id: setRow.id,
        filename: file.filename,
        relative_path: file.relativePath,
        file_role: file.fileRole,
        sort_order: file.sortOrder,
        content: file.content,
        parse_status: "ready" as const,
        summary: file.summary,
        requirement_count: file.requirementCount,
        constraint_count: file.constraintCount,
        flow_count: file.flowCount,
      }));

      const { data: insertedFiles, error: filesError } = await supabase
        .from("project_specification_set_files")
        .insert(fileRows)
        .select(SET_FILE_COLUMNS);

      if (filesError || !insertedFiles) {
        console.error("createSpecificationSet files failed", filesError?.code);
        await supabase.from("project_specification_sets").delete().eq("id", setRow.id);
        throw new Error("Specification set files could not be saved.");
      }

      return {
        ...toSpecificationSetRecord(setRow as SpecificationSetRowShape),
        files: insertedFiles
          .map((row) => toSpecificationSetFileRecord(row as SpecificationSetFileRowShape))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      };
    },

    async listSpecifications(projectId: string, userId: string): Promise<SpecificationRecord[]> {
      const { data: rows, error } = await supabase
        .from("project_specifications")
        .select(DOCUMENT_COLUMNS)
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("listSpecifications failed", error.code);
        throw new Error("Specifications could not be loaded.");
      }

      return (rows ?? []).map((row) => toSpecificationRecord(row as SpecificationRowShape));
    },

    async listSpecificationSets(
      projectId: string,
      userId: string,
    ): Promise<SpecificationSetWithFiles[]> {
      const { data: setRows, error: setError } = await supabase
        .from("project_specification_sets")
        .select(SET_COLUMNS)
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (setError) {
        console.error("listSpecificationSets failed", setError.code);
        throw new Error("Specification sets could not be loaded.");
      }

      const sets = setRows ?? [];
      if (sets.length === 0) {
        return [];
      }

      const setIds = sets.map((row) => row.id);
      const { data: fileRows, error: fileError } = await supabase
        .from("project_specification_set_files")
        .select(SET_FILE_COLUMNS)
        .in("set_id", setIds)
        .order("sort_order", { ascending: true });

      if (fileError) {
        console.error("listSpecificationSetFiles failed", fileError.code);
        throw new Error("Specification set files could not be loaded.");
      }

      const filesBySet = new Map<string, SpecificationSetWithFiles["files"]>();
      for (const row of fileRows ?? []) {
        const file = toSpecificationSetFileRecord(row as SpecificationSetFileRowShape);
        const existing = filesBySet.get(file.setId) ?? [];
        existing.push(file);
        filesBySet.set(file.setId, existing);
      }

      return sets.map((row) => ({
        ...toSpecificationSetRecord(row as SpecificationSetRowShape),
        files: filesBySet.get(row.id) ?? [],
      }));
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
      const { error, count } = await supabase
        .from("project_specifications")
        .delete({ count: "exact" })
        .eq("id", input.id)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId);

      if (error) {
        console.error("deleteSpecification failed", error.code);
        throw new Error("Specification could not be removed.");
      }

      return (count ?? 0) > 0;
    },

    async deleteSpecificationSet(input: {
      id: string;
      projectId: string;
      userId: string;
    }): Promise<boolean> {
      const { error, count } = await supabase
        .from("project_specification_sets")
        .delete({ count: "exact" })
        .eq("id", input.id)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId);

      if (error) {
        console.error("deleteSpecificationSet failed", error.code);
        throw new Error("Specification set could not be removed.");
      }

      return (count ?? 0) > 0;
    },

    async getSpecificationDownload(input: {
      id: string;
      projectId: string;
      userId: string;
    }): Promise<{ filename: string; content: string } | null> {
      const { data: row, error } = await supabase
        .from("project_specifications")
        .select("filename, content")
        .eq("id", input.id)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .maybeSingle();

      if (error) {
        console.error("getSpecificationDownload failed", error.code);
        throw new Error("Specification could not be downloaded.");
      }

      if (!row) {
        return null;
      }

      return { filename: row.filename, content: row.content };
    },

    async getSpecificationSetFileDownload(input: {
      fileId: string;
      setId: string;
      projectId: string;
      userId: string;
    }): Promise<{ filename: string; content: string } | null> {
      const { data: setRow, error: setError } = await supabase
        .from("project_specification_sets")
        .select("id")
        .eq("id", input.setId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .maybeSingle();

      if (setError) {
        console.error("getSpecificationSetFileDownload set lookup failed", setError.code);
        throw new Error("Specification file could not be downloaded.");
      }
      if (!setRow) {
        return null;
      }

      const { data: fileRow, error: fileError } = await supabase
        .from("project_specification_set_files")
        .select("filename, content")
        .eq("id", input.fileId)
        .eq("set_id", input.setId)
        .maybeSingle();

      if (fileError) {
        console.error("getSpecificationSetFileDownload file lookup failed", fileError.code);
        throw new Error("Specification file could not be downloaded.");
      }
      if (!fileRow) {
        return null;
      }

      return { filename: fileRow.filename, content: fileRow.content };
    },
  };
}
