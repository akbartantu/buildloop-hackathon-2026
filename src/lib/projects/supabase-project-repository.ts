import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { toProjectRecord, type ProjectRecord, type ProjectRowShape } from "./project-record";

const SELECT_COLUMNS =
  "id, name, source_type, repository_url, repository_owner, repository_name, default_branch, connected_commit_sha, disconnected_at, created_at, updated_at";

export type SupabaseProjectRepository = ReturnType<typeof createSupabaseProjectRepository>;

export function createSupabaseProjectRepository(supabase: SupabaseClient<Database>) {
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
      const { data: existing, error: lookupError } = await supabase
        .from("projects")
        .select(SELECT_COLUMNS)
        .eq("user_id", input.userId)
        .eq("repository_url", input.repositoryUrl)
        .maybeSingle();

      if (lookupError) {
        console.error("upsertPublicGitHubProject lookup failed", lookupError.code);
        throw new Error("Project gagal disimpan.");
      }

      if (existing) {
        const { data: row, error } = await supabase
          .from("projects")
          .update({
            name: input.name,
            default_branch: input.defaultBranch,
            connected_commit_sha: input.connectedCommitSha,
            disconnected_at: null,
          })
          .eq("id", existing.id)
          .eq("user_id", input.userId)
          .select(SELECT_COLUMNS)
          .single();

        if (error || !row) {
          console.error("upsertPublicGitHubProject update failed", error?.code);
          throw new Error("Project gagal diperbarui.");
        }

        return toProjectRecord(row as ProjectRowShape);
      }

      const { data: row, error } = await supabase
        .from("projects")
        .insert({
          user_id: input.userId,
          name: input.name,
          source_type: "public_github",
          repository_url: input.repositoryUrl,
          repository_owner: input.repositoryOwner,
          repository_name: input.repositoryName,
          default_branch: input.defaultBranch,
          connected_commit_sha: input.connectedCommitSha,
          disconnected_at: null,
        })
        .select(SELECT_COLUMNS)
        .single();

      if (error || !row) {
        console.error("upsertPublicGitHubProject insert failed", error?.code);
        throw new Error("Project gagal disimpan.");
      }

      return toProjectRecord(row as ProjectRowShape);
    },

    async refreshPublicGitHubProject(input: {
      userId: string;
      projectId: string;
      defaultBranch: string;
      connectedCommitSha: string;
    }): Promise<ProjectRecord> {
      const { data: row, error } = await supabase
        .from("projects")
        .update({
          default_branch: input.defaultBranch,
          connected_commit_sha: input.connectedCommitSha,
          disconnected_at: null,
        })
        .eq("id", input.projectId)
        .eq("user_id", input.userId)
        .select(SELECT_COLUMNS)
        .single();

      if (error || !row) {
        console.error("refreshPublicGitHubProject failed", error?.code);
        throw new Error("Project gagal diperbarui.");
      }

      return toProjectRecord(row as ProjectRowShape);
    },

    async disconnectPublicGitHubProject(input: {
      userId: string;
      projectId: string;
    }): Promise<ProjectRecord> {
      const now = new Date().toISOString();
      const { data: row, error } = await supabase
        .from("projects")
        .update({
          disconnected_at: now,
        })
        .eq("id", input.projectId)
        .eq("user_id", input.userId)
        .select(SELECT_COLUMNS)
        .single();

      if (error || !row) {
        console.error("disconnectPublicGitHubProject failed", error?.code);
        throw new Error("Project gagal diputus.");
      }

      return toProjectRecord(row as ProjectRowShape);
    },

    async listProjects(userId: string): Promise<ProjectRecord[]> {
      const { data: rows, error } = await supabase
        .from("projects")
        .select(SELECT_COLUMNS)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("listProjects failed", error.code);
        throw new Error("Daftar project gagal dibaca.");
      }

      return (rows ?? []).map((row) => toProjectRecord(row as ProjectRowShape));
    },

    async getProject(id: string, userId: string): Promise<ProjectRecord | null> {
      const { data: row, error } = await supabase
        .from("projects")
        .select(SELECT_COLUMNS)
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("getProject failed", error.code);
        throw new Error("Project gagal dibaca.");
      }

      return row ? toProjectRecord(row as ProjectRowShape) : null;
    },
  };
}
