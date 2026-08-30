import { afterEach, describe, expect, test } from "bun:test";

import { DeterministicChecker } from "../checker/deterministic-checker";
import {
  cleanupTempSandbox,
  createTempSandbox,
  testContract,
  writeSandboxFile,
} from "./test-helpers";

describe("deterministic checker adversarial", () => {
  const checker = new DeterministicChecker();
  let sandboxRoot = "";

  afterEach(async () => {
    if (sandboxRoot) {
      await cleanupTempSandbox(sandboxRoot);
      sandboxRoot = "";
    }
  });

  async function runChecker(input: {
    filesChanged: string[];
    writeFiles?: Record<string, string>;
    sourceRevisionAtStart?: string;
    sourceRevisionNow?: string;
  }) {
    sandboxRoot = await createTempSandbox();
    for (const [file, content] of Object.entries(input.writeFiles ?? {})) {
      await writeSandboxFile(sandboxRoot, file, content);
    }
    const contract = testContract();
    const revision = input.sourceRevisionAtStart ?? "abc";
    return checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract,
      sandboxRoot,
      workspaceRoot: sandboxRoot,
      skipCommandExecution: true,
      workerReport: {
        workerId: "test-worker",
        attemptNumber: 1,
        filesChanged: input.filesChanged,
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Test worker report",
        patchSummary: "test",
      },
      sourceRevisionAtStart: revision,
      sourceRevisionNow: input.sourceRevisionNow ?? revision,
    });
  }

  test("protected path modification is BLOCKED", async () => {
    const result = await runChecker({
      filesChanged: [".env"],
      writeFiles: { ".env": "KEY=value" },
    });
    expect(result.blocked).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.evidence.some((item) => item.category === "protected_path")).toBe(true);
  });

  test("package.json change is BLOCKED as protected path", async () => {
    const result = await runChecker({
      filesChanged: ["package.json"],
      writeFiles: { "package.json": "{}" },
    });
    expect(result.blocked).toBe(true);
  });

  test("supabase migration path is BLOCKED", async () => {
    const result = await runChecker({
      filesChanged: ["supabase/migrations/20260101_test.sql"],
      writeFiles: { "supabase/migrations/20260101_test.sql": "alter table x;" },
    });
    expect(result.blocked).toBe(true);
  });

  test("credential pattern in changed file is BLOCKED", async () => {
    const result = await runChecker({
      filesChanged: ["src/components/site/config.ts"],
      writeFiles: { "src/components/site/config.ts": "export const api_key = 'secret';" },
    });
    expect(result.blocked).toBe(true);
    expect(result.evidence.some((item) => item.category === "credential")).toBe(true);
  });

  test("out-of-scope file change fails but is not BLOCKED", async () => {
    const result = await runChecker({
      filesChanged: ["docs/readme.md"],
    });
    expect(result.blocked).toBe(false);
    expect(result.failed).toBe(true);
    expect(result.passed).toBe(false);
  });

  test("allowed path within scope can pass when no other failures", async () => {
    const result = await runChecker({
      filesChanged: ["src/components/site/safe.tsx"],
      writeFiles: { "src/components/site/safe.tsx": "export const ok = true;" },
    });
    expect(result.blocked).toBe(false);
    expect(result.passed).toBe(true);
  });

  test("zero file changes does not PASS", async () => {
    const result = await runChecker({ filesChanged: [] });
    expect(result.passed).toBe(false);
    expect(result.evidence.some((item) => item.name === "zero_file_changes")).toBe(true);
  });

  test("worker error report does not PASS", async () => {
    sandboxRoot = await createTempSandbox();
    const contract = testContract();
    const result = await checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract,
      sandboxRoot,
      workspaceRoot: sandboxRoot,
      workerReport: {
        workerId: "gemini-worker",
        attemptNumber: 1,
        filesChanged: [],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Gemini unavailable",
        patchSummary: "missing key",
        error: { code: "GEMINI_UNAVAILABLE", message: "Missing GEMINI_API_KEY" },
      },
      sourceRevisionAtStart: "rev",
      sourceRevisionNow: "rev",
    });
    expect(result.passed).toBe(false);
    expect(
      result.evidence.some(
        (item) => item.name === "worker_error" || item.name === "worker_operational_error",
      ),
    ).toBe(true);
    expect(result.operationalFailure).toBe(true);
  });

  test("worker claim without files does not PASS", async () => {
    const result = await runChecker({
      filesChanged: [],
    });
    expect(result.passed).toBe(false);
  });

  test("manifest revision drift fails checker", async () => {
    const result = await runChecker({
      filesChanged: ["src/components/site/safe.tsx"],
      writeFiles: { "src/components/site/safe.tsx": "ok" },
      sourceRevisionAtStart: "start-rev",
      sourceRevisionNow: "changed-rev",
    });
    expect(result.failed).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.evidence.some((item) => item.name === "source_revision_consistency")).toBe(true);
  });

  test("protected subpath wins over allowed parent glob", async () => {
    const contract = testContract({
      allowedPaths: ["src/**"],
    });
    sandboxRoot = await createTempSandbox();
    await writeSandboxFile(sandboxRoot, "src/integrations/supabase/client.ts", "export {}");
    const result = await checker.run({
      runId: crypto.randomUUID(),
      attemptNumber: 1,
      contract,
      sandboxRoot,
      workspaceRoot: sandboxRoot,
      workerReport: {
        workerId: "test-worker",
        attemptNumber: 1,
        filesChanged: ["src/integrations/supabase/client.ts"],
        commandsRequested: [],
        commandsExecuted: [],
        summary: "Modified supabase integration",
        patchSummary: "test",
      },
      sourceRevisionAtStart: "rev",
      sourceRevisionNow: "rev",
    });
    expect(result.blocked).toBe(true);
  });
});
