import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { DeterministicChecker } from "@/orchestrator/checker/deterministic-checker";
import {
  commandSkipReason,
  detectProjectCommands,
  partitionContractCommandsByApplicability,
  requiredCommandsForContract,
} from "@/orchestrator/checker/project-commands";
import { deriveAllowedCommands } from "@/orchestrator/contract/derive-task-contract";
import { createDraftContract, lockContract } from "@/orchestrator/contract/schema";

async function createTempRepo(root: string, files: Record<string, string>): Promise<void> {
  await mkdir(root, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = path.join(root, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
}

describe("command applicability", () => {
  let sandboxRoot = "";

  afterEach(async () => {
    if (sandboxRoot) {
      await rm(sandboxRoot, { recursive: true, force: true });
      sandboxRoot = "";
    }
  });

  test("repo without package.json skips typecheck, test, and lint", async () => {
    sandboxRoot = path.join(tmpdir(), `buildloop-cmd-${crypto.randomUUID()}`);
    await createTempRepo(sandboxRoot, {
      "prototype/index.html": "<!doctype html><html></html>",
      "prototype/styles.css": "body { margin: 0; }",
    });

    const detected = await detectProjectCommands(sandboxRoot);
    expect(detected.hasPackageJson).toBe(false);

    const allowlist = deriveAllowedCommands(["prototype/index.html"]);
    expect(allowlist).toEqual(["bun run typecheck", "bun test", "bun run lint"]);

    const partitioned = partitionContractCommandsByApplicability(allowlist, detected);
    expect(partitioned.applicable).toEqual([]);
    expect(partitioned.skipped).toEqual(["bun run typecheck", "bun test", "bun run lint"]);
    expect(requiredCommandsForContract(allowlist, detected)).toEqual([]);
  });

  test("repo with package.json and scripts keeps applicable commands", async () => {
    sandboxRoot = path.join(tmpdir(), `buildloop-cmd-${crypto.randomUUID()}`);
    await createTempRepo(sandboxRoot, {
      "package.json": JSON.stringify({
        scripts: {
          typecheck: "tsc --noEmit",
          test: "bun test",
          lint: "eslint .",
        },
      }),
    });

    const detected = await detectProjectCommands(sandboxRoot);
    expect(detected.hasPackageJson).toBe(true);
    expect(detected.typecheck).toBeTruthy();
    expect(detected.test).toBeTruthy();
    expect(detected.lint).toBeTruthy();

    const allowlist = ["bun run typecheck", "bun test", "bun run lint"];
    expect(requiredCommandsForContract(allowlist, detected)).toEqual([
      detected.typecheck,
      detected.test,
      detected.lint,
    ]);
  });

  test("repo with package.json but missing script skips only that command", async () => {
    sandboxRoot = path.join(tmpdir(), `buildloop-cmd-${crypto.randomUUID()}`);
    await createTempRepo(sandboxRoot, {
      "package.json": JSON.stringify({
        scripts: {
          typecheck: "tsc --noEmit",
        },
      }),
    });

    const detected = await detectProjectCommands(sandboxRoot);
    const allowlist = ["bun run typecheck", "bun test", "bun run lint"];
    const partitioned = partitionContractCommandsByApplicability(allowlist, detected);

    expect(partitioned.applicable).toEqual([detected.typecheck]);
    expect(partitioned.skipped).toEqual(["bun test", "bun run lint"]);
    expect(commandSkipReason("bun test", detected)).toContain("does not define the script");
  });

  test("static HTML/CSS task in repo without package.json passes checker without command failures", async () => {
    sandboxRoot = path.join(tmpdir(), `buildloop-cmd-${crypto.randomUUID()}`);
    await createTempRepo(sandboxRoot, {
      "prototype/index.html": "<!doctype html><html></html>",
      "prototype/styles.css": "body { margin: 0; }",
    });

    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: "Add static HTML/CSS prototype pages.",
        inScope: ["prototype/**"],
        outOfScope: ["package.json", "bun.lock"],
        acceptanceCriteria: ["Prototype pages render static layout."],
        allowedPaths: ["prototype/**"],
        allowedCommands: deriveAllowedCommands(["prototype/index.html"]),
      }),
    );

    const checker = new DeterministicChecker();
    const result = await checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract,
      sandboxRoot,
      workspaceRoot: sandboxRoot,
      skipCommandExecution: false,
      workerReport: {
        workerId: "adk-gemini-worker",
        attemptNumber: 1,
        filesChanged: ["prototype/index.html", "prototype/styles.css"],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Added static prototype pages.",
        patchSummary: "Added static prototype pages.",
      },
      sourceRevisionAtStart: "baseline",
      sourceRevisionNow: "baseline",
    });

    expect(result.blocked).toBe(false);
    expect(result.failed).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.evidence.some((item) => item.name === "worker_error")).toBe(false);
    expect(result.evidence.some((item) => item.status === "fail" && item.category === "typecheck")).toBe(
      false,
    );
    expect(
      result.evidence.filter((item) => item.name.endsWith("_not_applicable")).map((item) => item.command),
    ).toEqual(["bun run typecheck", "bun test", "bun run lint"]);
  });

  test("genuine applicable command failure still fails checker", async () => {
    sandboxRoot = path.join(tmpdir(), `buildloop-cmd-${crypto.randomUUID()}`);
    await createTempRepo(sandboxRoot, {
      "bun.lock": "",
      "package.json": JSON.stringify({
        scripts: {
          typecheck: "node -e \"process.exit(1)\"",
        },
      }),
      "src/example.ts": "export const value = 1;",
    });

    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: "Update example module.",
        inScope: ["src/**"],
        outOfScope: [],
        acceptanceCriteria: ["Example module updated."],
        allowedPaths: ["src/**"],
        allowedCommands: ["bun run typecheck"],
      }),
    );

    const checker = new DeterministicChecker();
    const result = await checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract,
      sandboxRoot,
      workspaceRoot: sandboxRoot,
      skipCommandExecution: false,
      workerReport: {
        workerId: "adk-gemini-worker",
        attemptNumber: 1,
        filesChanged: ["src/example.ts"],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Updated example module.",
        patchSummary: "Updated example module.",
      },
      sourceRevisionAtStart: "baseline",
      sourceRevisionNow: "baseline",
    });

    expect(result.failed).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.evidence.some((item) => item.category === "typecheck" && item.status === "fail")).toBe(
      true,
    );
  }, 15_000);

  test("repo with package.json and passing script runs command check successfully", async () => {
    sandboxRoot = path.join(tmpdir(), `buildloop-cmd-${crypto.randomUUID()}`);
    await createTempRepo(sandboxRoot, {
      "bun.lock": "",
      "package.json": JSON.stringify({
        scripts: {
          typecheck: "node -e \"process.exit(0)\"",
        },
      }),
      "src/example.ts": "export const value = 1;",
    });

    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: "Update example module.",
        inScope: ["src/**"],
        outOfScope: [],
        acceptanceCriteria: ["Example module updated."],
        allowedPaths: ["src/**"],
        allowedCommands: ["bun run typecheck"],
      }),
    );

    const checker = new DeterministicChecker();
    const result = await checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract,
      sandboxRoot,
      workspaceRoot: sandboxRoot,
      skipCommandExecution: false,
      workerReport: {
        workerId: "adk-gemini-worker",
        attemptNumber: 1,
        filesChanged: ["src/example.ts"],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Updated example module.",
        patchSummary: "Updated example module.",
      },
      sourceRevisionAtStart: "baseline",
      sourceRevisionNow: "baseline",
    });

    expect(result.failed).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.evidence.some((item) => item.category === "typecheck" && item.status === "pass")).toBe(
      true,
    );
  });
});
