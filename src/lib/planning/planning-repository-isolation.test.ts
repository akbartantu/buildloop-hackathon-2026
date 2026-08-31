import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { analyzeTaskGoal } from "@/lib/task-planning";
import { buildPlanningContext } from "@/lib/planning/planning-context";
import {
  filterRepositoryPathsAtRoot,
  formatRepositorySourceLabel,
} from "@/lib/planning/resolve-planning-repository";
import { documentToPlanningEntry } from "@/lib/specifications/specification-planning";
import type { PlanningSpecificationEntry } from "@/lib/specifications/specification-set-record";
import { clearDiscoverCandidatePathsCache } from "@/orchestrator/contract/discover-candidate-paths";
import { getWorkspaceRoot } from "@/orchestrator/product/orchestrator";

const execFileAsync = promisify(execFile);

const BUILDLOOP_AUTH_LEAK_PATHS = [
  "src/lib/auth/user-display.ts",
  "src/lib/auth/user-display.test.ts",
  "src/routes/auth.tsx",
  "src/lib/auth",
];

type TempRepo = {
  root: string;
  headSha: string;
};

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function createTempGitRepo(
  files: Record<string, string>,
  options?: { branch?: string },
): Promise<TempRepo> {
  const root = path.join(os.tmpdir(), `buildloop-planning-${crypto.randomUUID()}`);
  await mkdir(root, { recursive: true });
  await runGit(root, ["init"]);
  if (options?.branch) {
    await runGit(root, ["checkout", "-b", options.branch]);
  }

  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = path.join(root, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }

  await runGit(root, ["add", "."]);
  await runGit(root, ["commit", "-m", "init"]);
  const headSha = await runGit(root, ["rev-parse", "HEAD"]);

  return { root, headSha };
}

async function appendCommit(repo: TempRepo, files: Record<string, string>): Promise<string> {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = path.join(repo.root, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  await runGit(repo.root, ["add", "."]);
  await runGit(repo.root, ["commit", "-m", "update"]);
  repo.headSha = await runGit(repo.root, ["rev-parse", "HEAD"]);
  return repo.headSha;
}

function prdSpec(content: string, projectId = "00000000-0000-4000-8000-000000000010"): PlanningSpecificationEntry {
  return documentToPlanningEntry({
    id: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000099",
    projectId,
    filename: "PRD.md",
    originalPath: null,
    documentType: "PRD",
    content,
    parseStatus: "ready",
    summary: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function repositoryFilePaths(sources: Awaited<ReturnType<typeof analyzeTaskGoal>>["sourcesUsed"]): string[] {
  return (sources ?? [])
    .filter((source) => source.sourceType === "repository_file")
    .map((source) => source.path!)
    .filter(Boolean);
}

const tempRepos: TempRepo[] = [];

beforeEach(() => {
  clearDiscoverCandidatePathsCache();
});

afterEach(async () => {
  clearDiscoverCandidatePathsCache();
  for (const repo of tempRepos.splice(0)) {
    await rm(repo.root, { recursive: true, force: true });
  }
});

describe("planning repository isolation", () => {
  test("clevia-style README + uploaded PRD excludes BuildLoop auth sources", async () => {
    const clevia = await createTempGitRepo({
      "README.md": "# Clevia\nBaseline repository.",
    });
    tempRepos.push(clevia);

    const analysis = await analyzeTaskGoal({
      goal: "Add forgot password flow with Supabase Auth.",
      taskId: "preview",
      workspaceRoot: getWorkspaceRoot(),
      repositoryRoot: clevia.root,
      repositoryUrl: "https://github.com/akbartantu/clevia",
      sourceCommitSha: clevia.headSha,
      specifications: [
        prdSpec(
          "Authentication uses Supabase Auth.\nPassword reset must use a secure email link.",
        ),
      ],
    });

    expect(analysis.sourcesUsed?.some((source) => source.displayName === "PRD.md")).toBe(true);
    expect(analysis.sourcesUsed?.some((source) => source.sourceType === "source_commit")).toBe(true);

    const repoPaths = repositoryFilePaths(analysis.sourcesUsed);
    for (const leakPath of BUILDLOOP_AUTH_LEAK_PATHS) {
      expect(repoPaths).not.toContain(leakPath);
    }
    expect(repoPaths.every((repoPath) => repoPath === "README.md" || !repoPath.startsWith("src/"))).toBe(
      true,
    );
  });

  test("unrelated BuildLoop source files are excluded when repository root is isolated", async () => {
    const customerRepo = await createTempGitRepo({
      "README.md": "# Customer app",
    });
    tempRepos.push(customerRepo);

    const context = await buildPlanningContext({
      goal: "Fix forgot password flow and sign-in validation.",
      specifications: [],
      repositoryRoot: customerRepo.root,
      sourceCommitSha: customerRepo.headSha,
      repositoryUrl: "https://github.com/owner/customer",
    });

    const repoPaths = context.sourcesUsed
      .filter((source) => source.sourceType === "repository_file")
      .map((source) => source.path!);

    for (const leakPath of BUILDLOOP_AUTH_LEAK_PATHS) {
      expect(repoPaths).not.toContain(leakPath);
    }
  });

  test("repository evidence stays isolated between two workspace repositories", async () => {
    const workspaceA = await createTempGitRepo({
      "README.md": "# Workspace A",
      "docs/auth-notes.md": "Workspace A auth notes.",
    });
    const workspaceB = await createTempGitRepo({
      "README.md": "# Workspace B",
      "docs/billing-notes.md": "Workspace B billing notes.",
    });
    tempRepos.push(workspaceA, workspaceB);

    const goal = "Update auth notes documentation.";

    const contextA = await buildPlanningContext({
      goal,
      specifications: [],
      repositoryRoot: workspaceA.root,
      sourceCommitSha: workspaceA.headSha,
      repositoryUrl: "https://github.com/owner/workspace-a",
    });
    const contextB = await buildPlanningContext({
      goal,
      specifications: [],
      repositoryRoot: workspaceB.root,
      sourceCommitSha: workspaceB.headSha,
      repositoryUrl: "https://github.com/owner/workspace-b",
    });

    const pathsA = repositoryFilePaths(contextA.sourcesUsed);
    const pathsB = repositoryFilePaths(contextB.sourcesUsed);

    expect(pathsA.some((item) => item.includes("auth-notes"))).toBe(true);
    expect(pathsA.some((item) => item.includes("billing-notes"))).toBe(false);
    expect(pathsB.some((item) => item.includes("billing-notes"))).toBe(true);
    expect(pathsB.some((item) => item.includes("auth-notes"))).toBe(false);
  });

  test("repository evidence respects the selected source commit", async () => {
    const repo = await createTempGitRepo({
      "README.md": "# Baseline",
    });
    tempRepos.push(repo);

    const baselineSha = repo.headSha;
    await appendCommit(repo, {
      "src/lib/auth/user-display.ts": "export const displayName = 'later';",
    });

    await runGit(repo.root, ["checkout", baselineSha]);
    const baselineContext = await buildPlanningContext({
      goal: "Update user display helper for auth profile rendering.",
      specifications: [],
      repositoryRoot: repo.root,
      sourceCommitSha: baselineSha,
      repositoryUrl: "https://github.com/owner/commit-isolation",
    });

    const baselinePaths = await filterRepositoryPathsAtRoot(repo.root, [
      "src/lib/auth/user-display.ts",
      "README.md",
    ]);
    expect(baselinePaths).toEqual(["README.md"]);

    const baselineRepoPaths = repositoryFilePaths(baselineContext.sourcesUsed);
    expect(baselineRepoPaths).not.toContain("src/lib/auth/user-display.ts");

    await runGit(repo.root, ["checkout", repo.headSha]);
    clearDiscoverCandidatePathsCache();
    const latestContext = await buildPlanningContext({
      goal: "Update user display helper for auth profile rendering.",
      specifications: [],
      repositoryRoot: repo.root,
      sourceCommitSha: repo.headSha,
      repositoryUrl: "https://github.com/owner/commit-isolation",
    });
    const latestRepoPaths = repositoryFilePaths(latestContext.sourcesUsed);
    expect(latestRepoPaths).toContain("src/lib/auth/user-display.ts");
  });

  test("source labels reflect repository provenance", () => {
    const label = formatRepositorySourceLabel(
      "README.md",
      "https://github.com/akbartantu/clevia",
      "a10183ebdeadbeefdeadbeefdeadbeefdeadbeef",
    );
    expect(label).toBe("akbartantu/clevia:README.md@a10183e");
  });

  test("without verified repository root, planning excludes repository file evidence", async () => {
    const analysis = await analyzeTaskGoal({
      goal: "Add forgot password flow.",
      taskId: "preview",
      workspaceRoot: getWorkspaceRoot(),
      repositoryRoot: null,
      specifications: [prdSpec("Password reset uses email link.")],
    });

    expect(analysis.sourcesUsed?.some((source) => source.displayName === "PRD.md")).toBe(true);
    expect(analysis.sourcesUsed?.some((source) => source.sourceType === "repository_file")).toBe(false);
    for (const leakPath of BUILDLOOP_AUTH_LEAK_PATHS) {
      expect(repositoryFilePaths(analysis.sourcesUsed)).not.toContain(leakPath);
    }
  });
});
