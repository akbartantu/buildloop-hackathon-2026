import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  buildChangeArtifact,
  isAllowedChangePath,
} from "@/lib/change-artifact";
import { buildChangeEvidenceViewModel } from "@/lib/change-evidence-presentation";
import { buildDeliveryHandoff } from "@/lib/delivery-artifact";
import { applyHumanApproval } from "@/lib/human-approval";
import { readAuthorizedDeliveryPatch } from "@/lib/delivery-artifact-gate";
import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import { DeterministicChecker } from "@/orchestrator/checker/deterministic-checker";
import { createDraftContract, lockContract } from "@/orchestrator/contract/schema";
import {
  cleanupSandboxDirectory,
  createIsolatedWorktree,
  removeWorktree,
  runGit,
  summarizeGitDiff,
  captureFileUnifiedDiff,
} from "@/orchestrator/workspace/git-workspace";

async function initGitRepo(repoPath: string, files: Record<string, string> = {}): Promise<string> {
  await mkdir(repoPath, { recursive: true });
  await runGit(repoPath, ["init"]);
  await runGit(repoPath, ["config", "user.email", "buildloop@test.local"]);
  await runGit(repoPath, ["config", "user.name", "BuildLoop Test"]);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = path.join(repoPath, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  if (Object.keys(files).length > 0) {
    await runGit(repoPath, ["add", "."]);
    await runGit(repoPath, ["commit", "-m", "init"]);
  } else {
    await writeFile(path.join(repoPath, "README.md"), "initial\n", "utf8");
    await runGit(repoPath, ["add", "README.md"]);
    await runGit(repoPath, ["commit", "-m", "init"]);
  }
  return runGit(repoPath, ["rev-parse", "HEAD"]);
}

describe("untracked file evidence capture", () => {
  let repoPath = "";
  let worktreePath = "";
  let baselineSha = "";

  afterEach(async () => {
    if (repoPath && worktreePath) {
      await removeWorktree(repoPath, worktreePath).catch(() => undefined);
    }
    if (repoPath) {
      await cleanupSandboxDirectory(path.dirname(repoPath));
      repoPath = "";
      worktreePath = "";
      baselineSha = "";
    }
  });

  async function setupRepo(initialFiles: Record<string, string> = { "README.md": "initial\n" }) {
    const root = path.join(tmpdir(), `buildloop-untracked-${crypto.randomUUID()}`);
    repoPath = path.join(root, "repo");
    baselineSha = await initGitRepo(repoPath, initialFiles);
    worktreePath = path.join(root, "worktree");
    await createIsolatedWorktree(repoPath, worktreePath, crypto.randomUUID());
  }

  test("A new allowed text file is reported, typed added, and diff captured", async () => {
    await setupRepo();
    const newFile = "docs/buildloop-demo-proof.md";
    const content = "# Demo proof\nBuildLoop captured this new file.\n";
    await mkdir(path.dirname(path.join(worktreePath, newFile)), { recursive: true });
    await writeFile(path.join(worktreePath, newFile), content, "utf8");

    const summary = await summarizeGitDiff(repoPath, baselineSha, worktreePath);
    expect(summary.changedFiles).toEqual([newFile]);
    expect(summary.addedFiles).toEqual([newFile]);

    const artifact = await buildChangeArtifact({
      worktreePath,
      baselineSha,
      attemptNumber: 1,
      allowedPaths: ["docs/**"],
      protectedPaths: [".env*"],
      diffSummary: summary,
      checkerVerified: true,
    });

    expect(artifact?.files).toHaveLength(1);
    expect(artifact?.files[0]?.path).toBe(newFile);
    expect(artifact?.files[0]?.changeType).toBe("added");
    expect(artifact?.files[0]?.diff).toContain("+BuildLoop captured this new file.");

    const checker = new DeterministicChecker();
    const checkerResult = await checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract: lockContract(
        createDraftContract({
          id: crypto.randomUUID(),
          taskId: crypto.randomUUID(),
          version: 1,
          goal: "Create docs/buildloop-demo-proof.md with demo proof text.",
          inScope: ["docs/**"],
          outOfScope: [],
          acceptanceCriteria: ["docs/buildloop-demo-proof.md exists with proof text."],
          allowedPaths: ["docs/**"],
        }),
      ),
      sandboxRoot: worktreePath,
      workspaceRoot: worktreePath,
      skipCommandExecution: true,
      workerReport: {
        workerId: "test-worker",
        attemptNumber: 1,
        filesChanged: [newFile],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Created proof doc",
        patchSummary: "added doc",
      },
      sourceRevisionAtStart: baselineSha,
      sourceRevisionNow: baselineSha,
      baselineSha,
    });

    expect(checkerResult.passed).toBe(true);
  });

  test("B new file with two lines shows +2 / -0 counts", async () => {
    await setupRepo();
    const newFile = "docs/new.md";
    await mkdir(path.join(worktreePath, "docs"), { recursive: true });
    await writeFile(path.join(worktreePath, newFile), "line one\nline two\n", "utf8");

    const summary = await summarizeGitDiff(repoPath, baselineSha, worktreePath);
    const artifact = await buildChangeArtifact({
      worktreePath,
      baselineSha,
      attemptNumber: 1,
      allowedPaths: ["docs/**"],
      protectedPaths: [],
      diffSummary: summary,
      checkerVerified: true,
    });

    const viewModel = buildChangeEvidenceViewModel(artifact!, "en");
    expect(viewModel?.files[0]?.changeSummary).toBe("+2 added · -0 removed");
  });

  test("C new protected file is excluded from safe evidence artifact", async () => {
    await setupRepo();
    await writeFile(path.join(worktreePath, ".env.local"), "SECRET=demo\n", "utf8");

    const summary = await summarizeGitDiff(repoPath, baselineSha, worktreePath);
    expect(summary.changedFiles).toContain(".env.local");

    const artifact = await buildChangeArtifact({
      worktreePath,
      baselineSha,
      attemptNumber: 1,
      allowedPaths: ["docs/**"],
      protectedPaths: [".env*"],
      diffSummary: summary,
      checkerVerified: false,
    });

    expect(artifact).toBeNull();

    const checker = new DeterministicChecker();
    const result = await checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract: lockContract(
        createDraftContract({
          id: crypto.randomUUID(),
          taskId: crypto.randomUUID(),
          version: 1,
          goal: "Create docs/new.md",
          inScope: ["docs/**"],
          outOfScope: [],
          acceptanceCriteria: ["Should block env"],
          allowedPaths: ["docs/**"],
        }),
      ),
      sandboxRoot: worktreePath,
      workspaceRoot: worktreePath,
      skipCommandExecution: true,
      workerReport: {
        workerId: "test-worker",
        attemptNumber: 1,
        filesChanged: [".env.local"],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Created env file",
        patchSummary: "env",
      },
      sourceRevisionAtStart: baselineSha,
      sourceRevisionNow: baselineSha,
    });

    expect(result.blocked).toBe(true);
  });

  test("D new out-of-scope file fails checker scope", async () => {
    await setupRepo();
    const outOfScope = "src/out-of-scope.ts";
    await mkdir(path.dirname(path.join(worktreePath, outOfScope)), { recursive: true });
    await writeFile(path.join(worktreePath, outOfScope), "export const x = 1;\n", "utf8");

    const summary = await summarizeGitDiff(repoPath, baselineSha, worktreePath);
    expect(summary.changedFiles).toContain(outOfScope);

    const checker = new DeterministicChecker();
    const result = await checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract: testContractDocsOnly(),
      sandboxRoot: worktreePath,
      workspaceRoot: worktreePath,
      skipCommandExecution: true,
      workerReport: {
        workerId: "test-worker",
        attemptNumber: 1,
        filesChanged: [outOfScope],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Created file",
        patchSummary: "scope fail",
      },
      sourceRevisionAtStart: baselineSha,
      sourceRevisionNow: baselineSha,
    });

    expect(result.passed).toBe(false);
    expect(result.evidence.some((item) => item.name === `scope_${outOfScope}` && item.status === "fail")).toBe(
      true,
    );
  });

  test("E new binary file stays metadata-only", async () => {
    await setupRepo();
    const binaryPath = "assets/logo.png";
    await mkdir(path.join(worktreePath, "assets"), { recursive: true });
    await writeFile(path.join(worktreePath, binaryPath), Buffer.from([0x89, 0x50, 0x4e, 0x47]), "binary");

    const summary = await summarizeGitDiff(repoPath, baselineSha, worktreePath);
    const artifact = await buildChangeArtifact({
      worktreePath,
      baselineSha,
      attemptNumber: 1,
      allowedPaths: ["assets/**"],
      protectedPaths: [],
      diffSummary: summary,
      checkerVerified: true,
    });

    expect(artifact?.files[0]?.changeType).toBe("binary");
    expect(artifact?.files[0]?.diff).toBeUndefined();
  });

  test("F existing modified file regression remains correct", async () => {
    await setupRepo({ "README.md": "before line\n" });
    await writeFile(path.join(worktreePath, "README.md"), "after line\n", "utf8");

    const summary = await summarizeGitDiff(repoPath, baselineSha, worktreePath);
    expect(summary.modifiedFiles).toContain("README.md");
    expect(summary.addedFiles).not.toContain("README.md");

    const captured = await captureFileUnifiedDiff(worktreePath, baselineSha, "README.md");
    expect(captured.diff).toContain("-before line");
    expect(captured.diff).toContain("+after line");
  });

  test("G new file survives sandbox cleanup through persisted ChangeArtifact", async () => {
    await setupRepo();
    const newFile = "docs/persisted.md";
    await mkdir(path.join(worktreePath, "docs"), { recursive: true });
    await writeFile(path.join(worktreePath, newFile), "persist me\n", "utf8");

    const summary = await summarizeGitDiff(repoPath, baselineSha, worktreePath);
    const artifact = await buildChangeArtifact({
      worktreePath,
      baselineSha,
      attemptNumber: 1,
      allowedPaths: ["docs/**"],
      protectedPaths: [],
      diffSummary: summary,
      checkerVerified: true,
    });

    await removeWorktree(repoPath, worktreePath);
    await cleanupSandboxDirectory(path.dirname(repoPath));
    worktreePath = "";
    repoPath = "";

    expect(artifact?.files[0]?.path).toBe(newFile);
    expect(artifact?.files[0]?.diff).toContain("+persist me");
  });

  test("H delivery handoff patch contains added file after current-run APPROVE_COMMIT", async () => {
    await setupRepo();
    const newFile = "docs/handoff.md";
    const content = "delivery handoff content\n";
    await mkdir(path.join(worktreePath, "docs"), { recursive: true });
    await writeFile(path.join(worktreePath, newFile), content, "utf8");

    const summary = await summarizeGitDiff(repoPath, baselineSha, worktreePath);
    const handoff = await buildDeliveryHandoff({
      taskId: "00000000-0000-4000-8000-000000000010",
      runId: "run-handoff",
      contractGoal: "Create docs/handoff.md",
      worktreePath,
      baselineSha,
      attemptNumber: 1,
      checkerVerdict: "PASS",
      allowedPaths: ["docs/**"],
      protectedPaths: [".env*"],
      diffSummary: summary,
    });

    expect(handoff?.blocked).toBe(false);
    expect(handoff?.changedFiles).toEqual([newFile]);
    expect(handoff?.patch).toContain("+delivery handoff content");

    const contract = buildContract("Create docs/handoff.md");
    const approved = applyHumanApproval({
      task: {
        status: "AWAITING_APPROVAL",
        contract,
        runnerState: {
          ...zeroChangeRunnerState("PASS"),
          runId: "run-handoff",
          deliveryHandoff: handoff,
        },
      },
      decision: "APPROVE_COMMIT",
      action: "COMMIT",
      actorUserId: "user-1",
    });

    expect(readAuthorizedDeliveryPatch(approved.runnerState)).toContain("+delivery handoff content");
  });

  test("I git_diff_summary, worker filesChanged, and ChangeArtifact agree on count", async () => {
    await setupRepo();
    const files = ["docs/one.md", "docs/two.md"];
    await mkdir(path.join(worktreePath, "docs"), { recursive: true });
    await writeFile(path.join(worktreePath, files[0]!), "one\n", "utf8");
    await writeFile(path.join(worktreePath, files[1]!), "two\n", "utf8");

    const summary = await summarizeGitDiff(repoPath, baselineSha, worktreePath);
    const workerFiles = files;
    const artifact = await buildChangeArtifact({
      worktreePath,
      baselineSha,
      attemptNumber: 1,
      allowedPaths: ["docs/**"],
      protectedPaths: [],
      diffSummary: summary,
      checkerVerified: true,
    });

    const scopedCount = summary.changedFiles.filter((file) =>
      isAllowedChangePath(file, ["docs/**"]),
    ).length;

    expect(summary.changedFiles).toHaveLength(workerFiles.length);
    expect(artifact?.files).toHaveLength(scopedCount);
    expect(workerFiles.every((file) => summary.changedFiles.includes(file))).toBe(true);
  });
});

function testContractDocsOnly() {
  return lockContract(
    createDraftContract({
      id: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      version: 1,
      goal: "Create docs/new.md only.",
      inScope: ["docs/**"],
      outOfScope: [],
      acceptanceCriteria: ["Only docs paths may change."],
      allowedPaths: ["docs/**"],
    }),
  );
}
