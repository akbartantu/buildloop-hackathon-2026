import { describe, expect, test, beforeEach } from "bun:test";

import { createDevProjectRepository, devProjectUserId } from "@/lib/projects/dev-project-repository";
import { createDevSpecificationRepository } from "@/lib/specifications/dev-specification-repository";
import {
  buildSpecificationDownloadArtifact,
  mimeTypeForSpecificationFilename,
} from "@/lib/specifications/specification-download";
import { documentToPlanningEntry } from "@/lib/specifications/specification-planning";
import {
  canSubmitPendingUpload,
  pendingFilesFromSelection,
  replacePendingSelection,
  resolvePendingUploadAction,
  type PendingSpecificationFile,
} from "@/lib/specifications/specification-pending-upload";
import { selectRelevantSpecifications } from "@/lib/planning/planning-context";

const USER = devProjectUserId();
const USER_B = "00000000-0000-4000-8000-000000000099";

function pendingFile(filename: string, content: string): PendingSpecificationFile {
  return { filename, relativePath: filename, content };
}

describe("specification pending upload flow", () => {
  test("selecting files builds pending state without persistence", async () => {
    let createCalls = 0;
    const specifications = createDevSpecificationRepository();
    const originalCreate = specifications.createSpecification.bind(specifications);
    specifications.createSpecification = async (input) => {
      createCalls += 1;
      return originalCreate(input);
    };

    const pending = await pendingFilesFromSelection([
      new File(["# PRD"], "PRD.md", { type: "text/markdown" }),
    ]);

    expect(pending).toHaveLength(1);
    expect(pending[0]?.filename).toBe("PRD.md");
    expect(createCalls).toBe(0);
  });

  test("explicit upload resolution targets single-document persistence once", () => {
    const pending = [pendingFile("PRD.md", "Password reset uses email link.")];
    expect(resolvePendingUploadAction(pending, "PRD")).toEqual({ mode: "single" });
    expect(canSubmitPendingUpload({ pending, documentType: "PRD", uploading: false, disabled: false })).toBe(
      true,
    );
  });

  test("pending file can be cleared before upload", () => {
    const pending = [pendingFile("PRD.md", "content")];
    expect(replacePendingSelection([], false)).toEqual([]);
    expect(canSubmitPendingUpload({ pending: [], documentType: "PRD", uploading: false, disabled: false })).toBe(
      false,
    );
  });

  test("selecting another file replaces pending selection without uploading previous one", () => {
    const first = [pendingFile("first.md", "first")];
    const second = [pendingFile("second.md", "second")];
    const replaced = replacePendingSelection(second, false);
    expect(replaced).not.toEqual(first);
    expect(replaced[0]?.filename).toBe("second.md");
  });

  test("successful upload state moves from pending to stored specification", async () => {
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

    const pending = [pendingFile("PRD.md", "Authentication uses Supabase.")];
    const stored = await specifications.createSpecification({
      userId: USER,
      projectId: project.id,
      filename: pending[0]!.filename,
      originalPath: null,
      documentType: "PRD",
      content: pending[0]!.content,
    });

    const listed = await specifications.listSpecifications(project.id, USER);
    expect(listed.some((item) => item.id === stored.id)).toBe(true);
    expect(replacePendingSelection([], false)).toEqual([]);
  });

  test("failed upload validation does not create stored specification", async () => {
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

    const before = await specifications.listSpecifications(project.id, USER);
    expect(before).toHaveLength(0);

    const invalidResolution = resolvePendingUploadAction(
      [pendingFile("a.md", "a"), pendingFile("b.md", "b")],
      "PRD",
    );
    expect(invalidResolution).toEqual({ mode: "invalid", reason: "multiple-single-document" });
    expect(await specifications.listSpecifications(project.id, USER)).toHaveLength(0);
  });

  test("upload cannot submit while already uploading", () => {
    const pending = [pendingFile("PRD.md", "content")];
    expect(
      canSubmitPendingUpload({ pending, documentType: "PRD", uploading: true, disabled: false }),
    ).toBe(false);
  });
});

describe("specification download", () => {
  let projects: ReturnType<typeof createDevProjectRepository>;
  let specifications: ReturnType<typeof createDevSpecificationRepository>;

  beforeEach(async () => {
    projects = createDevProjectRepository();
    specifications = createDevSpecificationRepository();
    await projects.resetForTests();
    await specifications.resetForTests();
  });

  test("stored specification exposes downloadable original content artifact", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/app",
      repositoryUrl: "https://github.com/owner/app",
      repositoryOwner: "owner",
      repositoryName: "app",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const created = await specifications.createSpecification({
      userId: USER,
      projectId: project.id,
      filename: "PRD.md",
      originalPath: null,
      documentType: "PRD",
      content: "# Product requirements\nPassword reset uses email link.",
    });

    const artifact = await specifications.getSpecificationDownload({
      id: created.id,
      projectId: project.id,
      userId: USER,
    });
    expect(artifact).not.toBeNull();
    const download = buildSpecificationDownloadArtifact(artifact!.filename, artifact!.content);
    expect(download.filename).toBe("PRD.md");
    expect(download.content).toContain("Password reset uses email link.");
    expect(mimeTypeForSpecificationFilename("PRD.md")).toBe("text/markdown;charset=utf-8");
  });

  test("download lookup is read-only and does not mutate stored records", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/app",
      repositoryUrl: "https://github.com/owner/app",
      repositoryOwner: "owner",
      repositoryName: "app",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const created = await specifications.createSpecification({
      userId: USER,
      projectId: project.id,
      filename: "PRD.md",
      originalPath: null,
      documentType: "PRD",
      content: "Original content",
    });

    await specifications.getSpecificationDownload({
      id: created.id,
      projectId: project.id,
      userId: USER,
    });

    const listed = await specifications.listSpecifications(project.id, USER);
    expect(listed[0]?.content).toBe("Original content");
    expect(listed[0]?.filename).toBe("PRD.md");
  });

  test("unauthorized workspace access cannot download another workspace specification", async () => {
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

    const created = await specifications.createSpecification({
      userId: USER,
      projectId: projectA.id,
      filename: "PRD-A.md",
      originalPath: null,
      documentType: "PRD",
      content: "Project A only",
    });

    const crossProject = await specifications.getSpecificationDownload({
      id: created.id,
      projectId: projectB.id,
      userId: USER,
    });
    expect(crossProject).toBeNull();

    const otherUser = await specifications.getSpecificationDownload({
      id: created.id,
      projectId: projectA.id,
      userId: USER_B,
    });
    expect(otherUser).toBeNull();
  });

  test("planning-context retrieval still includes a successfully uploaded specification", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/app",
      repositoryUrl: "https://github.com/owner/app",
      repositoryOwner: "owner",
      repositoryName: "app",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const created = await specifications.createSpecification({
      userId: USER,
      projectId: project.id,
      filename: "PRD.md",
      originalPath: null,
      documentType: "PRD",
      content: "Authentication uses Supabase. Password reset via email link.",
    });

    const planningEntries = await specifications.listPlanningSpecifications(project.id, USER);
    const selected = selectRelevantSpecifications("Add forgot password flow.", planningEntries);
    expect(selected.some((entry) => entry.id === created.id)).toBe(true);
    expect(documentToPlanningEntry(created).content).toContain("Password reset via email link.");
  });
});
