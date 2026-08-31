import { describe, expect, test, beforeEach } from "bun:test";

import { createDevProjectRepository, devProjectUserId } from "@/lib/projects/dev-project-repository";
import { createDevSpecificationRepository } from "@/lib/specifications/dev-specification-repository";

const USER = devProjectUserId();
const USER_B = "00000000-0000-4000-8000-000000000099";

describe("specification project scoping", () => {
  let projects: ReturnType<typeof createDevProjectRepository>;
  let specifications: ReturnType<typeof createDevSpecificationRepository>;

  beforeEach(async () => {
    projects = createDevProjectRepository();
    specifications = createDevSpecificationRepository();
    await projects.resetForTests();
    await specifications.resetForTests();
  });

  test("specification belongs to one project", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/a",
      repositoryUrl: "https://github.com/owner/a",
      repositoryOwner: "owner",
      repositoryName: "a",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const created = await specifications.createSpecification({
      userId: USER,
      projectId: project.id,
      filename: "PRD.md",
      originalPath: null,
      documentType: "PRD",
      content: "Requirements",
    });

    const listed = await specifications.listSpecifications(project.id, USER);
    expect(listed.some((item) => item.id === created.id)).toBe(true);
    expect(created.projectId).toBe(project.id);
  });

  test("project A specs are not visible to project B", async () => {
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

    await specifications.createSpecification({
      userId: USER,
      projectId: projectA.id,
      filename: "PRD-A.md",
      originalPath: null,
      documentType: "PRD",
      content: "Project A only",
    });

    const projectBSpecs = await specifications.listSpecifications(projectB.id, USER);
    expect(projectBSpecs.some((item) => item.filename === "PRD-A.md")).toBe(false);
  });

  test("another user cannot read project specifications through repository filter", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/a",
      repositoryUrl: "https://github.com/owner/a",
      repositoryOwner: "owner",
      repositoryName: "a",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    await specifications.createSpecification({
      userId: USER,
      projectId: project.id,
      filename: "PRD.md",
      originalPath: null,
      documentType: "PRD",
      content: "Private",
    });

    const listed = await specifications.listSpecifications(project.id, USER_B);
    expect(listed.length).toBe(0);
  });
});
