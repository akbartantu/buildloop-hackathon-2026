import { afterEach, describe, expect, test } from "bun:test";

import { DeterministicChecker } from "../checker/deterministic-checker";
import { isCommandAllowed } from "../checker/project-commands";
import { createDraftContract, lockContract } from "../contract/schema";
import { executionApprovalGrantsCommit } from "../approval/model";
import { createApprovalRequest } from "../approval/model";
import {
  cleanupTempSandbox,
  createTempSandbox,
  testContract,
  writeSandboxFile,
} from "./test-helpers";

describe("worst-case gaps W5/W6/W8/W9", () => {
  const checker = new DeterministicChecker();
  let sandboxRoot = "";

  afterEach(async () => {
    if (sandboxRoot) {
      await cleanupTempSandbox(sandboxRoot);
      sandboxRoot = "";
    }
  });

  test("W5 — deployment/CI config modification is BLOCKED", async () => {
    sandboxRoot = await createTempSandbox();
    const contract = testContract();
    const result = await checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract,
      sandboxRoot,
      workspaceRoot: sandboxRoot,
      skipCommandExecution: true,
      workerReport: {
        workerId: "adk-gemini-worker",
        attemptNumber: 1,
        filesChanged: [".github/workflows/ci.yml"],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Updated CI",
        patchSummary: "ci",
      },
      sourceRevisionAtStart: "rev",
      sourceRevisionNow: "rev",
    });
    expect(result.blocked).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.evidence.some((e) => e.category === "protected_path")).toBe(true);
  });

  test("W6 — git commit command is not in allowlist", () => {
    const allowlist = ["bun run typecheck", "bun test", "bun run lint"];
    expect(isCommandAllowed("git commit -m 'auto'", allowlist)).toBe(false);
    expect(isCommandAllowed("git push origin main", allowlist)).toBe(false);
  });

  test("W6 — execution approval does not grant commit", () => {
    const request = createApprovalRequest({
      id: crypto.randomUUID(),
      runId: "run-1",
      action: "execute",
      requestedBy: "worker",
      impactSummary: "Worker wants to commit",
    });
    const approved = {
      ...request,
      status: "approved" as const,
      decidedBy: "user",
      decidedAt: new Date().toISOString(),
      decisionReason: "ok",
    };
    expect(executionApprovalGrantsCommit(approved)).toBe(false);
  });

  test("W8 — deleted test file detected as scope change failure", async () => {
    sandboxRoot = await createTempSandbox();
    await writeSandboxFile(sandboxRoot, "src/greet.test.ts", "test content");
    const contract = testContract({ allowedPaths: ["src/**"] });
    const result = await checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract,
      sandboxRoot,
      workspaceRoot: sandboxRoot,
      skipCommandExecution: true,
      workerReport: {
        workerId: "adk-gemini-worker",
        attemptNumber: 1,
        filesChanged: ["src/greet.test.ts"],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Removed failing test",
        patchSummary: "deleted test content",
      },
      sourceRevisionAtStart: "rev",
      sourceRevisionNow: "rev",
    });
    // Worker changed a test file with destructive intent — checker should not silently PASS
    expect(result.passed).toBe(false);
  });

  test("W9 — BuildLoop governance file modification is BLOCKED", async () => {
    sandboxRoot = await createTempSandbox();
    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: "Modify checker",
        inScope: ["orchestrator/**"],
        outOfScope: [],
        acceptanceCriteria: ["Should block"],
        allowedPaths: ["src/**"],
      }),
    );
    const result = await checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract,
      sandboxRoot,
      workspaceRoot: sandboxRoot,
      skipCommandExecution: true,
      workerReport: {
        workerId: "adk-gemini-worker",
        attemptNumber: 1,
        filesChanged: ["src/orchestrator/checker/deterministic-checker.ts"],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Modified checker",
        patchSummary: "governance bypass",
      },
      sourceRevisionAtStart: "rev",
      sourceRevisionNow: "rev",
    });
    expect(result.blocked).toBe(true);
    expect(result.passed).toBe(false);
  });
});
