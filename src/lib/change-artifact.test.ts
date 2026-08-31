import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  buildChangeArtifact,
  CHANGE_ARTIFACT_MAX_BYTES,
  isAllowedChangePath,
  isProtectedChangePath,
  sanitizeDiffText,
  truncateDiffText,
  type ChangeArtifact,
} from "@/lib/change-artifact";
import { buildChangeEvidenceViewModel } from "@/lib/change-evidence-presentation";
import { BootstrapOrchestrator } from "@/orchestrator/bootstrap/orchestrator";
import { createDraftContract, lockContract } from "@/orchestrator/contract/schema";
import {
  cleanupSandboxDirectory,
  createIsolatedWorktree,
  removeWorktree,
  runGit,
  summarizeGitDiff,
} from "@/orchestrator/workspace/git-workspace";
import {
  firestoreRecordToStoredRun,
  storedRunToFirestoreRecord,
} from "@/orchestrator/persistence/firestore-mapper";
import type { StoredRun } from "@/orchestrator/persistence/local-store";
import { decide } from "@/orchestrator/decision/engine";
import { stubWorker } from "@/orchestrator/governance/test-helpers";

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

function sampleDiffSummary(changedFiles: string[], baselineSha: string) {
  return {
    baselineSha,
    changedFiles,
    addedFiles: changedFiles.filter((file) => file.endsWith(".new")),
    deletedFiles: [],
    modifiedFiles: changedFiles.filter((file) => !file.endsWith(".new")),
  };
}

describe("change artifact builder", () => {
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

  test("README text modification produces persisted change evidence", async () => {
    const root = path.join(tmpdir(), `buildloop-change-${crypto.randomUUID()}`);
    repoPath = path.join(root, "repo");
    baselineSha = await initGitRepo(repoPath, { "README.md": "old line\n" });
    worktreePath = path.join(root, "worktree");
    await createIsolatedWorktree(repoPath, worktreePath, crypto.randomUUID());
    await writeFile(
      path.join(worktreePath, "README.md"),
      "BuildLoop keeps security-sensitive actions under human control.\n",
      "utf8",
    );

    const summary = await summarizeGitDiff(repoPath, baselineSha, worktreePath);
    const artifact = await buildChangeArtifact({
      worktreePath,
      baselineSha,
      attemptNumber: 1,
      allowedPaths: ["README.md"],
      protectedPaths: [".env*"],
      diffSummary: summary,
      checkerVerified: true,
    });

    expect(artifact).not.toBeNull();
    expect(artifact?.files).toHaveLength(1);
    expect(artifact?.files[0]?.path).toBe("README.md");
    expect(artifact?.files[0]?.diff).toContain("-old line");
    expect(artifact?.files[0]?.diff).toContain(
      "+BuildLoop keeps security-sensitive actions under human control.",
    );
    expect(artifact?.checkerVerified).toBe(true);
  });

  test("evidence remains available after sandbox cleanup", async () => {
    const root = path.join(tmpdir(), `buildloop-change-${crypto.randomUUID()}`);
    repoPath = path.join(root, "repo");
    baselineSha = await initGitRepo(repoPath, { "README.md": "before\n" });
    worktreePath = path.join(root, "worktree");
    await createIsolatedWorktree(repoPath, worktreePath, crypto.randomUUID());
    await writeFile(path.join(worktreePath, "README.md"), "after\n", "utf8");

    const summary = await summarizeGitDiff(repoPath, baselineSha, worktreePath);
    const artifact = await buildChangeArtifact({
      worktreePath,
      baselineSha,
      attemptNumber: 2,
      allowedPaths: ["README.md"],
      protectedPaths: ["package.json"],
      diffSummary: summary,
      checkerVerified: true,
    });

    await removeWorktree(repoPath, worktreePath);
    await cleanupSandboxDirectory(root);

    expect(artifact?.files[0]?.path).toBe("README.md");
    expect(artifact?.files[0]?.diff).toContain("+after");
    worktreePath = "";
    repoPath = "";
  });

  test("only in-scope files from final diff are included", async () => {
    const artifact = await buildChangeArtifact({
      worktreePath: "/tmp/unused",
      baselineSha: "abc123",
      attemptNumber: 2,
      allowedPaths: ["README.md"],
      protectedPaths: ["package.json"],
      diffSummary: sampleDiffSummary(["README.md", "src/out-of-scope.ts"], "abc123"),
      checkerVerified: true,
      captureDiff: async (_worktree, _baseline, filePath) => ({
        diff: `diff --git a/${filePath} b/${filePath}\n-old\n+new\n`,
        isBinary: false,
      }),
    });

    expect(artifact?.files.map((file) => file.path)).toEqual(["README.md"]);
    expect(artifact?.attemptNumber).toBe(2);
  });

  test("protected paths do not expose content", async () => {
    const artifact = await buildChangeArtifact({
      worktreePath: "/tmp/unused",
      baselineSha: "abc123",
      attemptNumber: 1,
      allowedPaths: ["README.md", "package.json"],
      protectedPaths: ["package.json"],
      diffSummary: sampleDiffSummary(["README.md", "package.json"], "abc123"),
      checkerVerified: false,
      captureDiff: async (_worktree, _baseline, filePath) => ({
        diff: `diff --git a/${filePath} b/${filePath}\n-secret\n`,
        isBinary: false,
      }),
    });

    expect(artifact?.files.map((file) => file.path)).toEqual(["README.md"]);
    expect(artifact?.files.some((file) => file.path === "package.json")).toBe(false);
  });

  test("secret-like values are redacted", () => {
    const input = "API_KEY=super-secret-value\nTOKEN=abc123\n";
    const { text, redacted } = sanitizeDiffText(input);
    expect(redacted).toBe(true);
    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("super-secret-value");
  });

  test("binary files do not expose content", async () => {
    const artifact = await buildChangeArtifact({
      worktreePath: "/tmp/unused",
      baselineSha: "abc123",
      attemptNumber: 1,
      allowedPaths: ["assets/logo.png"],
      protectedPaths: [],
      diffSummary: sampleDiffSummary(["assets/logo.png"], "abc123"),
      checkerVerified: true,
      captureDiff: async () => ({
        diff: "Binary files a/assets/logo.png and b/assets/logo.png differ",
        isBinary: true,
      }),
    });

    expect(artifact?.files[0]?.changeType).toBe("binary");
    expect(artifact?.files[0]?.diff).toBeUndefined();
  });

  test("large diffs are truncated safely", async () => {
    const huge = "+\n".repeat(CHANGE_ARTIFACT_MAX_BYTES);
    const artifact = await buildChangeArtifact({
      worktreePath: "/tmp/unused",
      baselineSha: "abc123",
      attemptNumber: 1,
      allowedPaths: ["README.md"],
      protectedPaths: [],
      diffSummary: sampleDiffSummary(["README.md"], "abc123"),
      checkerVerified: true,
      maxBytes: 512,
      captureDiff: async () => ({ diff: huge, isBinary: false }),
    });

    expect(artifact?.truncated).toBe(true);
    expect(artifact?.files[0]?.truncated).toBe(true);
    expect(artifact?.totalBytes).toBeLessThanOrEqual(512);
    expect(artifact?.files[0]?.diff).toContain("[TRUNCATED]");
  });

  test("truncateDiffText respects remaining byte budget", () => {
    const { text, truncated } = truncateDiffText("a".repeat(100), 20);
    expect(truncated).toBe(true);
    expect(text).toContain("[TRUNCATED]");
  });
});

describe("change evidence presentation", () => {
  test("UI view model shows changed file name and sanitized diff", () => {
    const artifact: ChangeArtifact = {
      baselineSha: "abc1234567890",
      attemptNumber: 1,
      checkerVerified: true,
      totalBytes: 42,
      truncated: false,
      files: [
        {
          path: "README.md",
          changeType: "modified",
          diff: "- old line\n+ BuildLoop keeps security-sensitive actions under human control.\n",
          redacted: false,
          truncated: false,
        },
      ],
    };

    const viewModel = buildChangeEvidenceViewModel(artifact, "en");
    expect(viewModel?.files[0]?.path).toBe("README.md");
    expect(viewModel?.combinedDiff).toContain("README.md");
    expect(viewModel?.combinedDiff).toContain(
      "+ BuildLoop keeps security-sensitive actions under human control.",
    );
    expect(viewModel?.title).toBe("What changed");
  });
});

describe("change artifact governance invariants", () => {
  test("PASS semantics remain unchanged", () => {
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: {
        evidence: [],
        blocked: false,
        failed: false,
        passed: true,
      },
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(result.verdict).toBe("PASS");
    expect(result.nextStatus).toBe("AWAITING_APPROVAL");
  });

  test("blocked demo still records zero worker calls and no automatic delivery", async () => {
    const root = path.join(tmpdir(), `buildloop-blocked-${crypto.randomUUID()}`);
    const orchestrator = new BootstrapOrchestrator({
      workspaceRoot: root,
      allowDirtyWorkspace: true,
    });
    const result = await orchestrator.runBlockedDemo();
    expect(result.run.verdict).toBe("BLOCKED");
    expect(result.run.counters.workerCalls).toBe(0);
    expect(result.changeArtifact).toBeNull();
    expect(result.deliveryHandoff).toBeNull();
    await cleanupSandboxDirectory(root);
  }, 60_000);
});

describe("Firestore mapper change artifact", () => {
  test("preserves change artifact through orchestrationPayload round-trip", () => {
    const runId = "run-change-artifact";
    const taskId = "task-change-artifact";
    const original: StoredRun = {
      run: {
        id: runId,
        taskId,
        contractId: taskId,
        contractVersion: 1,
        status: "AWAITING_APPROVAL",
        verdict: "PASS",
        verdictReason: "Checks passed",
        sourceRevision: "abc123",
        workerId: "demo-worker",
        attemptNumber: 1,
        counters: {
          workerCalls: 1,
          checkerCalls: 1,
          correctionCount: 0,
          filesChanged: 1,
          commandsExecuted: 0,
        },
        startedAt: "2026-08-30T12:00:00.000Z",
        completedAt: "2026-08-30T12:01:00.000Z",
      },
      evidence: [],
      workerReports: [],
      decisionLog: [],
      orchestrationEvidence: {
        securityReviewInvoked: false,
        securityFindings: [],
        approvalType: null,
        policyDecision: null,
        plannerOutput: null,
      },
      changeArtifact: {
        baselineSha: "abc1234567890",
        attemptNumber: 1,
        checkerVerified: true,
        totalBytes: 20,
        truncated: false,
        files: [
          {
            path: "README.md",
            changeType: "modified",
            diff: "- old\n+ new\n",
            redacted: false,
            truncated: false,
          },
        ],
      },
      storedAt: "2026-08-30T12:01:01.000Z",
      taskGoal: "Update README",
    };

    const record = storedRunToFirestoreRecord(original);
    const restored = firestoreRecordToStoredRun(record);
    expect(restored.changeArtifact?.files[0]?.path).toBe("README.md");
    expect(restored.changeArtifact?.checkerVerified).toBe(true);
  });
});

describe("path helpers", () => {
  test("isAllowedChangePath respects glob patterns", () => {
    expect(isAllowedChangePath("src/components/foo.tsx", ["src/components/**"])).toBe(true);
    expect(isAllowedChangePath("docs/readme.md", ["README.md"])).toBe(false);
  });

  test("isProtectedChangePath matches protected globs", () => {
    expect(isProtectedChangePath(".env.local", [".env*"])).toBe(true);
    expect(isProtectedChangePath("README.md", ["package.json"])).toBe(false);
  });
});

describe("orchestrator final attempt capture", () => {
  test("persists artifact metadata from final attempt after cleanup", async () => {
    const root = path.join(tmpdir(), `buildloop-orch-${crypto.randomUUID()}`);
    const repoPath = path.join(root, "repo");
    const baseline = await initGitRepo(repoPath, { "README.md": "start\n" });

    const orchestrator = new BootstrapOrchestrator({
      workspaceRoot: repoPath,
      workspaceName: "buildloop-demo",
      allowDirtyWorkspace: true,
      worker: stubWorker("readme-worker", async ({ sandboxRoot, attemptNumber }) => {
        const content =
          attemptNumber === 1
            ? "attempt one\n"
            : "BuildLoop keeps security-sensitive actions under human control.\n";
        await writeFile(path.join(sandboxRoot, "README.md"), content, "utf8");
        return {
          workerId: "readme-worker",
          attemptNumber,
          filesChanged: ["README.md"],
          commandsRequested: [],
          commandsExecuted: [],
          summary: "Updated README",
          patchSummary: "README update",
        };
      }),
    });

    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: "Update README subtitle to mention governed autonomous software delivery.",
        inScope: ["README.md"],
        outOfScope: ["Deployment"],
        acceptanceCriteria: [
          "Only README.md is modified.",
          "Add one concise sentence describing BuildLoop as a governed autonomous software-delivery agent.",
        ],
        allowedPaths: ["README.md"],
        maximumCorrections: 1,
      }),
    );

    const result = await orchestrator.executeContractRun(contract);
    expect(result.changeArtifact).not.toBeNull();
    expect(result.changeArtifact?.attemptNumber).toBe(result.run.attemptNumber);
    expect(result.changeArtifact?.baselineSha).toBe(baseline);
    expect(result.changeArtifact?.files.some((file) => file.path === "README.md")).toBe(true);
    expect(result.changeArtifact?.files[0]?.diff).toContain(
      "BuildLoop keeps security-sensitive actions under human control.",
    );
    expect(result.deliveryHandoff).not.toBeNull();
    expect(result.deliveryHandoff?.blocked).toBe(false);
    expect(result.deliveryHandoff?.patch).toContain(
      "BuildLoop keeps security-sensitive actions under human control.",
    );
    expect(result.deliveryHandoff?.changedFiles).toEqual(["README.md"]);
    expect(result.deliveryHandoff?.suggestedCommitMessage.length).toBeGreaterThan(0);

    await cleanupSandboxDirectory(root);
    expect(result.changeArtifact?.files[0]?.path).toBe("README.md");
    expect(result.deliveryHandoff?.patch).toContain("BuildLoop keeps security-sensitive actions");
  }, 120_000);
});
