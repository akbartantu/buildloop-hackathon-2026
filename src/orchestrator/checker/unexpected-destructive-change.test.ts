import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decide } from "@/orchestrator/decision/engine";
import { DeterministicChecker } from "@/orchestrator/checker/deterministic-checker";
import {
  contractAuthorizesDestructiveChanges,
  contractExpectsBoundedAdditiveEdit,
} from "@/orchestrator/checker/unexpected-destructive-change";
import { BootstrapOrchestrator } from "@/orchestrator/bootstrap/orchestrator";
import { createDraftContract, lockContract } from "@/orchestrator/contract/schema";
import { BLOCKED_DEMO_GOAL } from "@/orchestrator/scenarios/pass";
import {
  cleanupTempSandbox,
  createTempSandbox,
  writeSandboxFile,
} from "@/orchestrator/governance/test-helpers";

const ORCHESTRATOR_TEST_TIMEOUT_MS = 120_000;

function workspaceRoot(): string {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

function readmeAdditiveContract() {
  return lockContract(
    createDraftContract({
      id: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      version: 1,
      goal: "Add one short sentence to README.md describing governed delivery.",
      inScope: ["README.md"],
      outOfScope: ["Application code", "Dependencies", "Deployment"],
      acceptanceCriteria: [
        "Only README.md is modified.",
        "Existing README structure remains intact.",
        "No protected paths are modified.",
      ],
      allowedPaths: ["README.md"],
    }),
  );
}

function buildReadmeBaseline(lineCount = 100): string {
  const header = "# BuildLoop\n\nGoverned autonomous delivery.\n";
  const body = Array.from({ length: lineCount - 3 }, (_, index) => `- Existing section ${index + 1}`)
    .join("\n");
  return `${header}\n${body}\n`;
}

describe("unexpected destructive change guard", () => {
  const checker = new DeterministicChecker();
  let sandboxRoot = "";

  afterEach(async () => {
    if (sandboxRoot) {
      await cleanupTempSandbox(sandboxRoot);
      sandboxRoot = "";
    }
  });

  async function runReadmeChecker(input: {
    baseline: string;
    updated: string;
    contract?: ReturnType<typeof readmeAdditiveContract>;
  }) {
    sandboxRoot = await createTempSandbox();
    const contract = input.contract ?? readmeAdditiveContract();
    await writeSandboxFile(sandboxRoot, "README.md", input.updated);

    return checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract,
      sandboxRoot,
      workspaceRoot: sandboxRoot,
      skipCommandExecution: true,
      baselineFileContents: { "README.md": input.baseline },
      workerReport: {
        workerId: "test-worker",
        attemptNumber: 1,
        filesChanged: ["README.md"],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Updated README",
        patchSummary: "readme",
      },
      sourceRevisionAtStart: "rev",
      sourceRevisionNow: "rev",
    });
  }

  test("A README small addition with mass unrelated deletion is NOT PASS", async () => {
    const baseline = buildReadmeBaseline(100);
    const updated = "# BuildLoop\n\nGoverned autonomous delivery with human approval.\n";

    const result = await runReadmeChecker({ baseline, updated });

    expect(result.passed).toBe(false);
    expect(result.blocked).toBe(false);
    expect(result.failed).toBe(true);
    expect(
      result.evidence.some((item) => item.name === "unexpected_destructive_change_README.md"),
    ).toBe(true);
  });

  test("B README small addition without unrelated deletions can PASS", async () => {
    const baseline = buildReadmeBaseline(20);
    const updated = `${baseline.trim()}\n\nBuildLoop provides governed delivery with human approval.\n`;

    const result = await runReadmeChecker({ baseline, updated });

    expect(result.passed).toBe(true);
    expect(
      result.evidence.some((item) => item.name === "unexpected_destructive_change_README.md"),
    ).toBe(false);
  });

  test("C explicit rewrite task is not rejected solely by destructive-change guard", async () => {
    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: "Rewrite README.md to replace the legacy onboarding section with a concise overview.",
        inScope: ["README.md"],
        outOfScope: [],
        acceptanceCriteria: [
          "README.md is replaced with the new concise overview.",
          "No protected paths are modified.",
        ],
        allowedPaths: ["README.md"],
      }),
    );

    expect(contractAuthorizesDestructiveChanges(contract)).toBe(true);
    expect(contractExpectsBoundedAdditiveEdit(contract)).toBe(false);

    const baseline = buildReadmeBaseline(80);
    const updated = "# BuildLoop\n\nConcise overview for new contributors.\n";

    const result = await runReadmeChecker({ baseline, updated, contract });
    expect(
      result.evidence.some((item) => item.name === "unexpected_destructive_change_README.md"),
    ).toBe(false);
  });

  test("D explicit deletion task is not rejected solely by destructive-change guard", async () => {
    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: "Remove the deprecated troubleshooting section from README.md.",
        inScope: ["README.md"],
        outOfScope: [],
        acceptanceCriteria: [
          "The deprecated troubleshooting section is removed from README.md.",
          "No protected paths are modified.",
        ],
        allowedPaths: ["README.md"],
      }),
    );

    expect(contractAuthorizesDestructiveChanges(contract)).toBe(true);

    const baseline = `${buildReadmeBaseline(10).trim()}\n\n## Troubleshooting\nLegacy notes.\n`;
    const updated = buildReadmeBaseline(10);

    const result = await runReadmeChecker({ baseline, updated, contract });
    expect(
      result.evidence.some((item) => item.name === "unexpected_destructive_change_README.md"),
    ).toBe(false);
  });

  test("E destructive result followed by minimal correction can PASS", async () => {
    const baseline = buildReadmeBaseline(30);
    const destructive = "# BuildLoop\n\nOne replacement sentence.\n";
    const corrected = `${baseline.trim()}\n\nBuildLoop provides governed delivery with human approval.\n`;

    const first = await runReadmeChecker({ baseline, updated: destructive });
    expect(first.passed).toBe(false);

    const second = await runReadmeChecker({ baseline, updated: corrected });
    expect(second.passed).toBe(true);
  });

  test("F destructive change plus protected path keeps BLOCKED semantics", async () => {
    sandboxRoot = await createTempSandbox();
    const contract = readmeAdditiveContract();
    const baseline = buildReadmeBaseline(40);
    await writeSandboxFile(sandboxRoot, "README.md", "# BuildLoop\n\nReplacement only.\n");
    await writeSandboxFile(sandboxRoot, "package.json", '{"name":"buildloop","version":"1.0.0"}');

    const result = await checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract,
      sandboxRoot,
      workspaceRoot: sandboxRoot,
      skipCommandExecution: true,
      baselineFileContents: {
        "README.md": baseline,
        "package.json": '{"name":"buildloop","version":"0.9.0"}',
      },
      workerReport: {
        workerId: "test-worker",
        attemptNumber: 1,
        filesChanged: ["README.md", "package.json"],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Destructive README and dependency change",
        patchSummary: "mixed",
      },
      sourceRevisionAtStart: "rev",
      sourceRevisionNow: "rev",
    });

    expect(result.blocked).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.evidence.some((item) => item.category === "protected_path")).toBe(true);
  });

  test("unexpected destructive failure consumes automatic correction budget", () => {
    const correction = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: {
        evidence: [
          {
            id: "1",
            runId: "run-1",
            attemptNumber: 1,
            category: "acceptance",
            name: "unexpected_destructive_change_README.md",
            status: "fail",
            summary: "Unexpected destructive change",
            details: "",
            affectedFiles: ["README.md"],
            severity: "error",
            createdAt: new Date().toISOString(),
          },
        ],
        blocked: false,
        failed: true,
        passed: false,
      },
      correctionCount: 0,
      maximumCorrections: 2,
      allowedCommands: [],
      sourceStale: false,
    });

    expect(correction.rule).toBe("CORRECTION_ALLOWED");
    expect(correction.shouldCorrect).toBe(true);
  });
});

describe("unexpected destructive change guard — demo regressions", () => {
  test(
    "G blocked demo scenario remains unchanged",
    async () => {
      const orchestrator = new BootstrapOrchestrator({
        workspaceRoot: workspaceRoot(),
        allowDirtyWorkspace: true,
      });
      const result = await orchestrator.runBlockedDemoForGoal(BLOCKED_DEMO_GOAL);
      expect(result.run.verdict).toBe("BLOCKED");
      expect(result.run.counters.workerCalls).toBe(0);
    },
    ORCHESTRATOR_TEST_TIMEOUT_MS,
  );

  test(
    "G PASS demo scenario remains unchanged",
    async () => {
      const orchestrator = new BootstrapOrchestrator({
        workspaceRoot: workspaceRoot(),
        allowDirtyWorkspace: true,
      });
      const result = await orchestrator.runPassDemo();
      expect(result.run.verdict).toBe("PASS");
    },
    ORCHESTRATOR_TEST_TIMEOUT_MS,
  );
});
