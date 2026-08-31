import { describe, expect, test } from "bun:test";

import { documentToPlanningEntry } from "@/lib/specifications/specification-planning";
import { selectRelevantSpecifications } from "@/lib/planning/planning-context";
import {
  createSupabaseSpecificationRepository,
  SpecificationPersistenceError,
} from "@/lib/specifications/supabase-specification-repository";

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000099";
const PROJECT_A = "00000000-0000-4000-8000-000000000010";
const PROJECT_B = "00000000-0000-4000-8000-000000000011";
const SPEC_ID = "00000000-0000-4000-8000-000000000020";

type InsertPayload = Record<string, unknown>;

function specificationRow(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date().toISOString();
  return {
    id: SPEC_ID,
    project_id: PROJECT_A,
    filename: "PRD.md",
    original_path: null,
    document_type: "PRD",
    content: "Authentication uses Supabase. Password reset via email link.",
    parse_status: "ready",
    summary: "Authentication uses Supabase.",
    requirement_count: 1,
    constraint_count: 0,
    flow_count: 0,
    created_at: now,
    updated_at: now,
    parsed_at: now,
    ...overrides,
  };
}

function createMockSupabase(options: {
  insertResult?: { data: unknown; error: { code: string; message: string } | null };
  listRows?: unknown[];
  deleteCount?: number;
  downloadRow?: { filename: string; content: string } | null;
}) {
  let lastInsertPayload: InsertPayload | null = null;

  const supabase = {
    from(table: string) {
      return {
        insert(payload: InsertPayload | InsertPayload[]) {
          lastInsertPayload = Array.isArray(payload) ? payload[0]! : payload;
          return {
            select() {
              return {
                single: async () => options.insertResult ?? { data: specificationRow(), error: null },
              };
            },
          };
        },
        select() {
          return {
            eq(column: string, value: string) {
              const filters = [{ column, value }];
              const builder = {
                eq(nextColumn: string, nextValue: string) {
                  filters.push({ column: nextColumn, value: nextValue });
                  return builder;
                },
                order() {
                  return builder;
                },
                in() {
                  return builder;
                },
                maybeSingle: async () => {
                  if (table === "project_specifications" && filters.some((f) => f.column === "id")) {
                    const projectFilter = filters.find((f) => f.column === "project_id")?.value;
                    const userFilter = filters.find((f) => f.column === "user_id")?.value;
                    if (projectFilter === PROJECT_A && userFilter === USER_A) {
                      return {
                        data: options.downloadRow ?? { filename: "PRD.md", content: "Authentication uses Supabase." },
                        error: null,
                      };
                    }
                    return { data: null, error: null };
                  }
                  return { data: null, error: null };
                },
                then(onFulfilled: (value: { data: unknown[]; error: null }) => unknown) {
                  const projectFilter = filters.find((f) => f.column === "project_id")?.value;
                  const userFilter = filters.find((f) => f.column === "user_id")?.value;
                  const rows =
                    table === "project_specifications" &&
                    projectFilter === PROJECT_A &&
                    userFilter === USER_A
                      ? (options.listRows ?? [specificationRow()])
                      : [];
                  return Promise.resolve(onFulfilled({ data: rows, error: null }));
                },
              };
              return builder;
            },
          };
        },
        delete() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return Promise.resolve({ error: null, count: options.deleteCount ?? 1 });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    getLastInsertPayload() {
      return lastInsertPayload;
    },
  };

  return supabase;
}

describe("supabase specification repository production persistence", () => {
  test("canonical PRD document type maps to legacy PRD before insert", async () => {
    const supabase = createMockSupabase({});
    const repository = createSupabaseSpecificationRepository(supabase as never);

    const record = await repository.createSpecification({
      userId: USER_A,
      projectId: PROJECT_A,
      filename: "PRD.md",
      originalPath: null,
      documentType: "prd",
      content: "Authentication uses Supabase.",
    });

    expect(supabase.getLastInsertPayload()?.document_type).toBe("PRD");
    expect(record.documentType).toBe("prd");
  });

  test("authenticated user upload persists once and reloads for the same project", async () => {
    const supabase = createMockSupabase({});
    const repository = createSupabaseSpecificationRepository(supabase as never);

    const created = await repository.createSpecification({
      userId: USER_A,
      projectId: PROJECT_A,
      filename: "PRD.md",
      originalPath: null,
      documentType: "prd",
      content: "Authentication uses Supabase. Password reset via email link.",
    });

    const listed = await repository.listSpecifications(PROJECT_A, USER_A);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);
    expect(listed[0]?.documentType).toBe("prd");
  });

  test("uploaded specification is available to planning context", async () => {
    const supabase = createMockSupabase({});
    const repository = createSupabaseSpecificationRepository(supabase as never);

    const created = await repository.createSpecification({
      userId: USER_A,
      projectId: PROJECT_A,
      filename: "PRD.md",
      originalPath: null,
      documentType: "prd",
      content: "Authentication uses Supabase. Password reset via email link.",
    });

    const planningEntries = await repository.listPlanningSpecifications(PROJECT_A, USER_A);
    const selected = selectRelevantSpecifications("Add forgot password flow.", planningEntries);
    expect(selected.some((entry) => entry.id === created.id)).toBe(true);
    expect(documentToPlanningEntry(created).content).toContain("Password reset via email link.");
  });

  test("user and project isolation remain enforced on download lookup", async () => {
    const supabase = createMockSupabase({
      downloadRow: { filename: "PRD.md", content: "Project A only" },
    });
    const repository = createSupabaseSpecificationRepository(supabase as never);

    await repository.createSpecification({
      userId: USER_A,
      projectId: PROJECT_A,
      filename: "PRD.md",
      originalPath: null,
      documentType: "prd",
      content: "Project A only",
    });

    const crossProject = await repository.getSpecificationDownload({
      id: SPEC_ID,
      projectId: PROJECT_B,
      userId: USER_A,
    });
    expect(crossProject).toBeNull();

    const otherUser = await repository.getSpecificationDownload({
      id: SPEC_ID,
      projectId: PROJECT_A,
      userId: USER_B,
    });
    expect(otherUser).toBeNull();
  });

  test("failed persistence throws structured error without leaving stored rows", async () => {
    const supabase = createMockSupabase({
      insertResult: {
        data: null,
        error: { code: "23514", message: "new row violates check constraint" },
      },
      listRows: [],
    });
    const repository = createSupabaseSpecificationRepository(supabase as never);

    await expect(
      repository.createSpecification({
        userId: USER_A,
        projectId: PROJECT_A,
        filename: "PRD.md",
        originalPath: null,
        documentType: "prd",
        content: "Authentication uses Supabase.",
      }),
    ).rejects.toBeInstanceOf(SpecificationPersistenceError);

    try {
      await repository.createSpecification({
        userId: USER_A,
        projectId: PROJECT_A,
        filename: "PRD.md",
        originalPath: null,
        documentType: "prd",
        content: "Authentication uses Supabase.",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SpecificationPersistenceError);
      expect((error as SpecificationPersistenceError).code).toBe("document_type_check_violation");
    }

    const listed = await repository.listSpecifications(PROJECT_A, USER_A);
    expect(listed).toHaveLength(0);
  });
});
