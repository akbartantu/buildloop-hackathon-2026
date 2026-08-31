import { describe, expect, test, beforeEach } from "bun:test";

import { createDevProjectRepository } from "@/lib/projects/dev-project-repository";
import { devProjectUserId } from "@/lib/projects/dev-project-repository";
import { createDevSpecificationRepository } from "@/lib/specifications/dev-specification-repository";
import { documentToPlanningEntry } from "@/lib/specifications/specification-planning";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import { planAndEvaluateTask } from "@/lib/task-planning";

const USER = devProjectUserId();

describe("task planning with specifications", () => {
  let projects: ReturnType<typeof createDevProjectRepository>;
  let specifications: ReturnType<typeof createDevSpecificationRepository>;

  beforeEach(async () => {
    projects = createDevProjectRepository();
    specifications = createDevSpecificationRepository();
    await projects.resetForTests();
    await specifications.resetForTests();
  });

  test("README task proceeds without clarification", async () => {
    const planned = await planAndEvaluateTask({
      goal: "Update README subtitle to mention governed autonomous software delivery.",
      taskId: "00000000-0000-4000-8000-000000000020",
      workspaceRoot: process.cwd(),
    });
    expect(planned.needsClarification).toBe(false);
    expect(planned.contract.inScope).toContain("README.md");
  });

  test("forgot password with PRD context generates criteria without clarification", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/app",
      repositoryUrl: "https://github.com/owner/app",
      repositoryOwner: "owner",
      repositoryName: "app",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const prd = await specifications.createSpecification({
      userId: USER,
      projectId: project.id,
      filename: "PRD.md",
      originalPath: null,
      documentType: "PRD",
      content:
        "Authentication uses Supabase Auth.\nPassword reset must use a secure email link.",
    });

    const planned = await planAndEvaluateTask({
      goal: "Add forgot password flow.",
      taskId: "00000000-0000-4000-8000-000000000021",
      workspaceRoot: process.cwd(),
      specifications: [documentToPlanningEntry(prd)],
      sourceCommitSha: project.connectedCommitSha,
    });

    expect(planned.needsClarification).toBe(false);
    expect(planned.contract.sourcesUsed?.some((source) => source.documentId === prd.id)).toBe(true);
    expect(
      planned.contract.acceptanceCriteria.some((item) => /email link|password reset/i.test(item)) ||
        Boolean(planned.contract.planningSummary),
    ).toBe(true);
  });

  test("locked task provenance remains after specification update", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/app",
      repositoryUrl: "https://github.com/owner/app",
      repositoryOwner: "owner",
      repositoryName: "app",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const prd = await specifications.createSpecification({
      userId: USER,
      projectId: project.id,
      filename: "PRD.md",
      originalPath: null,
      documentType: "PRD",
      content: "Password reset uses email link.",
    });

    const tasks = createDevTaskRepository(
      {
        getProject: async (id, userId) => {
          const loaded = await projects.getProject(id, userId);
          if (!loaded) return null;
          return {
            repositoryUrl: loaded.repositoryUrl,
            connectedCommitSha: loaded.connectedCommitSha,
            disconnectedAt: loaded.disconnectedAt,
          };
        },
      },
      {
        listPlanningSpecifications: (projectId, userId) =>
          specifications.listPlanningSpecifications(projectId, userId),
      },
    );
    await tasks.resetForTests();

    const task = await tasks.createTask({
      userId: USER,
      goal: "Add forgot password flow.",
      projectId: project.id,
      clarificationAnswer: "Email link",
    });

    const originalSources = task.contract.sourcesUsed?.length ?? 0;
    expect(originalSources).toBeGreaterThan(0);

    await specifications.createSpecification({
      userId: USER,
      projectId: project.id,
      filename: "FRD.md",
      originalPath: null,
      documentType: "FRD",
      content: "Password recovery uses OTP.",
    });

    const reloaded = await tasks.getTask(task.id);
    expect(reloaded?.contract.sourcesUsed?.length).toBe(originalSources);
  });

  test("spec kit set contributes individual file sources to planning", async () => {
    const project = await projects.upsertPublicGitHubProject({
      userId: USER,
      name: "owner/app",
      repositoryUrl: "https://github.com/owner/app",
      repositoryOwner: "owner",
      repositoryName: "app",
      defaultBranch: "main",
      connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    });

    const set = await specifications.createSpecificationSet({
      userId: USER,
      projectId: project.id,
      name: "spec-kit",
      documentType: "Spec Kit",
      summary: "Spec Kit set",
      requirementCount: 2,
      constraintCount: 1,
      flowCount: 1,
      files: [
        {
          filename: "constitution.md",
          relativePath: "spec-kit/constitution.md",
          fileRole: "constitution",
          sortOrder: 0,
          content: "Security constraints for auth.",
          requirementCount: 1,
          constraintCount: 1,
          flowCount: 0,
          summary: "constitution",
        },
        {
          filename: "spec.md",
          relativePath: "spec-kit/spec.md",
          fileRole: "spec",
          sortOrder: 1,
          content: "Password reset uses secure email link.",
          requirementCount: 1,
          constraintCount: 0,
          flowCount: 1,
          summary: "spec",
        },
      ],
    });

    const specFile = set.files.find((file) => file.filename === "spec.md");
    expect(specFile).toBeDefined();

    const planningEntries = await specifications.listPlanningSpecifications(project.id, USER);
    const planned = await planAndEvaluateTask({
      goal: "Add forgot password flow.",
      taskId: "00000000-0000-4000-8000-000000000022",
      workspaceRoot: process.cwd(),
      specifications: planningEntries,
      sourceCommitSha: project.connectedCommitSha,
    });

    expect(planned.needsClarification).toBe(false);
    expect(
      planned.contract.sourcesUsed?.some(
        (source) =>
          source.documentId === specFile?.id &&
          source.path === "spec-kit/spec.md" &&
          source.setName === "spec-kit",
      ),
    ).toBe(true);
  });
});
