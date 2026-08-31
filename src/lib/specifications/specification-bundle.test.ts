import { describe, expect, test } from "bun:test";

import { validateSpecificationBundleUpload } from "@/lib/specifications/specification-bundle-upload";
import { selectRelevantSpecifications } from "@/lib/planning/planning-context";
import { createDevSpecificationRepository } from "@/lib/specifications/dev-specification-repository";
import { createDevProjectRepository, devProjectUserId } from "@/lib/projects/dev-project-repository";
import { flattenCatalogForPlanning } from "@/lib/specifications/specification-planning";

const USER = devProjectUserId();

describe("specification bundle upload", () => {
  test("imports spec-kit folder as ordered set with preserved paths", () => {
    const result = validateSpecificationBundleUpload({
      files: [
        {
          filename: "tasks.md",
          relativePath: "spec-kit/tasks.md",
          content: "- Implement password reset route\n- Add tests",
        },
        {
          filename: "constitution.md",
          relativePath: "spec-kit/constitution.md",
          content: "# Constitution\nAll auth changes must preserve security boundaries.",
        },
        {
          filename: "spec.md",
          relativePath: "spec-kit/spec.md",
          content: "# Spec\nPassword reset uses secure email link via Supabase Auth.",
        },
        {
          filename: "plan.md",
          relativePath: "spec-kit/plan.md",
          content: "# Plan\nUpdate auth routes and recovery email template.",
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.name).toBe("spec-kit");
    expect(result.files.map((file) => file.filename)).toEqual([
      "constitution.md",
      "spec.md",
      "plan.md",
      "tasks.md",
    ]);
    expect(result.files.map((file) => file.relativePath)).toEqual([
      "spec-kit/constitution.md",
      "spec-kit/spec.md",
      "spec-kit/plan.md",
      "spec-kit/tasks.md",
    ]);
    expect(result.files.map((file) => file.fileRole)).toEqual([
      "constitution",
      "spec",
      "plan",
      "tasks",
    ]);
  });

  test("rejects single-file bundle uploads", () => {
    const result = validateSpecificationBundleUpload({
      files: [{ filename: "spec.md", content: "# Spec" }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("specification set planning", () => {
  test("selects relevant files from a set without flattening content", () => {
    const entries = flattenCatalogForPlanning({
      documents: [],
      sets: [
        {
          id: "00000000-0000-4000-8000-000000000050",
          projectId: "00000000-0000-4000-8000-000000000010",
          name: "spec-kit",
          documentType: "Spec Kit",
          parseStatus: "ready",
          summary: null,
          requirementCount: 2,
          constraintCount: 1,
          flowCount: 1,
          fileCount: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          files: [
            {
              id: "00000000-0000-4000-8000-000000000051",
              setId: "00000000-0000-4000-8000-000000000050",
              filename: "constitution.md",
              relativePath: "spec-kit/constitution.md",
              fileRole: "constitution",
              sortOrder: 0,
              content: "Security constraints for all auth work.",
              parseStatus: "ready",
              summary: null,
              requirementCount: 1,
              constraintCount: 1,
              flowCount: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: "00000000-0000-4000-8000-000000000052",
              setId: "00000000-0000-4000-8000-000000000050",
              filename: "spec.md",
              relativePath: "spec-kit/spec.md",
              fileRole: "spec",
              sortOrder: 1,
              content: "Password reset uses secure email link.",
              parseStatus: "ready",
              summary: null,
              requirementCount: 1,
              constraintCount: 0,
              flowCount: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]?.path).toBe("spec-kit/constitution.md");
    expect(entries[1]?.path).toBe("spec-kit/spec.md");

    const selected = selectRelevantSpecifications("Add forgot password flow.", entries);
    expect(selected.some((entry) => entry.filename === "spec.md")).toBe(true);
    expect(selected.every((entry) => entry.setName === "spec-kit")).toBe(true);
  });

  test("repository stores set files individually", async () => {
    const projects = createDevProjectRepository();
    const specifications = createDevSpecificationRepository();
    await projects.resetForTests();
    await specifications.resetForTests();

    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/app",
      repositoryUrl: "https://github.com/owner/app",
      repositoryOwner: "owner",
      repositoryName: "app",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const validation = validateSpecificationBundleUpload({
      files: [
        {
          filename: "spec.md",
          relativePath: "spec-kit/spec.md",
          content: "Password reset requirements.",
        },
        {
          filename: "plan.md",
          relativePath: "spec-kit/plan.md",
          content: "Implementation plan for auth routes.",
        },
      ],
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }

    const created = await specifications.createSpecificationSet({
      userId: USER,
      projectId: project.id,
      name: validation.name,
      documentType: validation.documentType,
      summary: validation.summary,
      requirementCount: validation.requirementCount,
      constraintCount: validation.constraintCount,
      flowCount: validation.flowCount,
      files: validation.files,
    });

    expect(created.fileCount).toBe(2);
    expect(created.files[0]?.relativePath).toBe("spec-kit/spec.md");

    const catalog = await specifications.listSpecificationsCatalog(project.id, USER);
    expect(catalog.sets).toHaveLength(1);
    expect(catalog.documents).toHaveLength(0);
    expect(catalog.sets[0]?.files).toHaveLength(2);
  });
});
