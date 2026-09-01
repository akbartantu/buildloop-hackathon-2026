import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { buildEvidenceSummaryViewModel, formatCheckUserLine, resolveCheckKey } from "@/lib/evidence-summary";
import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import type { TaskRecord } from "@/lib/tasks-schema";
import { AdkGeminiWorker } from "../adk/gemini-agent";
import { setAdkRunnerOverride } from "../adk/runner";
import { DeterministicChecker } from "../checker/deterministic-checker";
import { createDraftContract, lockContract } from "../contract/schema";
import { decide } from "../decision/engine";
import {
  buildWorkerOutputParseDiagnostics,
  extractWorkerOutputJson,
  normalizeWorkerFilePath,
  normalizeWorkerOutputPayload,
  parseWorkerStructuredOutput,
} from "../gemini/client";
import { GeminiClientError } from "../gemini/errors";
import { isOperationalWorkerError } from "../gemini/retry-policy";

const validPayload = {
  summary: "Added prototype pages.",
  changedFiles: [
    {
      path: "prototype/index.html",
      content: "<!doctype html><html><head></head><body><h1>Clevia</h1></body></html>",
    },
    {
      path: "prototype/styles.css",
      content: "body { margin: 0; font-family: sans-serif; }\n.main { display: flex; }",
    },
  ],
};

function staticPrototypeContract() {
  return lockContract(
    createDraftContract({
      id: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      version: 1,
      goal: "Create prototype/index.html and prototype/styles.css only.",
      inScope: ["prototype/**"],
      outOfScope: [],
      acceptanceCriteria: ["Prototype pages render static layout."],
      allowedPaths: ["prototype/index.html", "prototype/styles.css"],
      allowedCommands: [],
    }),
  );
}

function mockStaticPrototypeRunner(text: string) {
  setAdkRunnerOverride({
    isConfigured: () => true,
    run: async () => ({
      text,
      model: "gemini-3.6-flash",
      latencyMs: 1,
      operationalRetries: 0,
      geminiCallCount: 1,
      adkRunnerInvoked: true,
      adkAgentName: "buildloop_coding_worker",
    }),
  });
}

describe("worker structured output parsing", () => {
  test("valid raw JSON response parses two allowed files", () => {
    const parsed = parseWorkerStructuredOutput(JSON.stringify(validPayload));
    expect(parsed.changedFiles).toHaveLength(2);
  });

  test("single fenced JSON response parses safely", () => {
    const inner = JSON.stringify({
      summary: "Added prototype pages.",
      changedFiles: [{ path: "prototype/index.html", content: "<html></html>" }],
    });
    const parsed = parseWorkerStructuredOutput("```json\n" + inner + "\n```");
    expect(parsed.changedFiles[0]?.path).toBe("prototype/index.html");
    expect(extractWorkerOutputJson("```json\n" + inner + "\n```")).toBe(inner);
  });

  test("fenced JSON without newline after label parses safely", () => {
    const inner = JSON.stringify(validPayload);
    const parsed = parseWorkerStructuredOutput("```json" + inner + "```");
    expect(parsed.changedFiles).toHaveLength(2);
  });

  test("JSON with BOM and surrounding whitespace parses safely", () => {
    const parsed = parseWorkerStructuredOutput("  \uFEFF" + JSON.stringify(validPayload) + "  \n");
    expect(parsed.changedFiles).toHaveLength(2);
  });

  test("changed_files alias normalizes to changedFiles", () => {
    const parsed = parseWorkerStructuredOutput(
      JSON.stringify({
        summary: validPayload.summary,
        changed_files: validPayload.changedFiles,
      }),
    );
    expect(parsed.changedFiles).toHaveLength(2);
    expect(parsed.changedFiles[0]?.path).toBe("prototype/index.html");
  });

  test("filename alias normalizes to path within changedFiles entries", () => {
    const parsed = parseWorkerStructuredOutput(
      JSON.stringify({
        summary: validPayload.summary,
        changedFiles: [
          { filename: "prototype/index.html", content: validPayload.changedFiles[0]!.content },
          { filename: "prototype/styles.css", content: validPayload.changedFiles[1]!.content },
        ],
      }),
    );
    expect(parsed.changedFiles.map((file) => file.path)).toEqual([
      "prototype/index.html",
      "prototype/styles.css",
    ]);
  });

  test("arbitrary prose plus JSON remains rejected", () => {
    expect(() =>
      parseWorkerStructuredOutput("Here is the implementation:\n" + JSON.stringify(validPayload)),
    ).toThrow(GeminiClientError);
  });

  test("multiple JSON objects remain rejected", () => {
    expect(() =>
      parseWorkerStructuredOutput(JSON.stringify(validPayload) + "\n" + JSON.stringify(validPayload)),
    ).toThrow(GeminiClientError);
  });

  test("invalid JSON remains GEMINI_MALFORMED with diagnostics", () => {
    try {
      parseWorkerStructuredOutput("{not-json");
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiClientError);
      expect((error as GeminiClientError).code).toBe("GEMINI_MALFORMED");
      expect((error as GeminiClientError).parseDiagnostics?.schemaFailureCode).toBe("invalid_json");
      return;
    }
    throw new Error("expected parse failure");
  });

  test("schema-missing changedFiles remains rejected", () => {
    try {
      parseWorkerStructuredOutput(JSON.stringify({ summary: "Only summary provided." }));
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiClientError);
      expect((error as GeminiClientError).parseDiagnostics?.changedFilesPresent).toBe(false);
      expect((error as GeminiClientError).parseDiagnostics?.schemaFailureCode).toBeTruthy();
      return;
    }
    throw new Error("expected schema failure");
  });

  test("normalizeWorkerOutputPayload leaves unrelated keys untouched", () => {
    const normalized = normalizeWorkerOutputPayload({
      summary: "x",
      files: [{ path: "ignored.ts", content: "x" }],
    }) as Record<string, unknown>;
    expect(normalized.files).toBeDefined();
    expect(normalized.changedFiles).toBeUndefined();
  });

  test("parse diagnostics capture safe metadata without content", () => {
    const diagnostics = buildWorkerOutputParseDiagnostics({
      raw: "```json\n" + JSON.stringify({ summary: "x", changed_files: [] }) + "\n```",
      parsed: { summary: "x", changed_files: [] },
      schemaFailureCode: "too_small",
    });
    expect(diagnostics.startsWithFence).toBe(true);
    expect(diagnostics.endsWithFence).toBe(true);
    expect(diagnostics.topLevelType).toBe("object");
    expect(diagnostics.topLevelKeys).toContain("changed_files");
    expect(diagnostics.changedFilesPresent).toBe(true);
    expect(diagnostics.changedFilesType).toBe("array");
    expect(diagnostics.schemaFailureCode).toBe("too_small");
  });

  test("normalizeWorkerFilePath accepts ./ and leading slash prefixes", () => {
    expect(normalizeWorkerFilePath("./prototype/index.html")).toBe("prototype/index.html");
    expect(normalizeWorkerFilePath("/prototype/styles.css")).toBe("prototype/styles.css");
  });
});

describe("AdkGeminiWorker static prototype apply path", () => {
  let sandbox = "";

  afterEach(async () => {
    setAdkRunnerOverride(null);
    if (sandbox) {
      await rm(sandbox, { recursive: true, force: true });
      sandbox = "";
    }
  });

  test("live-like changed_files fenced output applies 2 allowed files", async () => {
    sandbox = path.join(tmpdir(), `bl-worker-static-${crypto.randomUUID()}`);
    await mkdir(sandbox, { recursive: true });
    mockStaticPrototypeRunner(
      "```json\n" +
        JSON.stringify({
          summary: validPayload.summary,
          changed_files: [
            { filename: "./prototype/index.html", content: validPayload.changedFiles[0]!.content },
            { filename: "./prototype/styles.css", content: validPayload.changedFiles[1]!.content },
          ],
        }) +
        "\n```",
    );

    const report = await new AdkGeminiWorker().execute({
      contract: staticPrototypeContract(),
      sandboxRoot: sandbox,
      workspaceRoot: sandbox,
      sourceRevision: "a10183eb",
      attemptNumber: 1,
    });

    expect(report.error).toBeUndefined();
    expect(report.filesChanged).toEqual(["prototype/index.html", "prototype/styles.css"]);
  });

  test("prefixed paths apply to allowed static files", async () => {
    sandbox = path.join(tmpdir(), `bl-worker-static-${crypto.randomUUID()}`);
    await mkdir(sandbox, { recursive: true });
    mockStaticPrototypeRunner(
      JSON.stringify({
        summary: "Added prototype pages.",
        changedFiles: [
          { path: "./prototype/index.html", content: validPayload.changedFiles[0]!.content },
          { path: "./prototype/styles.css", content: validPayload.changedFiles[1]!.content },
        ],
      }),
    );

    const report = await new AdkGeminiWorker().execute({
      contract: staticPrototypeContract(),
      sandboxRoot: sandbox,
      workspaceRoot: sandbox,
      sourceRevision: "a10183eb",
      attemptNumber: 1,
    });

    expect(report.error).toBeUndefined();
    expect(report.filesChanged).toEqual(["prototype/index.html", "prototype/styles.css"]);
    expect(await readFile(path.join(sandbox, "prototype/index.html"), "utf8")).toContain("<html>");
  });

  test("out-of-scope path is still rejected", async () => {
    sandbox = path.join(tmpdir(), `bl-worker-static-${crypto.randomUUID()}`);
    await mkdir(sandbox, { recursive: true });
    mockStaticPrototypeRunner(
      JSON.stringify({
        summary: "Bad path",
        changedFiles: [{ path: "src/app.ts", content: "export {}\n" }],
      }),
    );

    const report = await new AdkGeminiWorker().execute({
      contract: staticPrototypeContract(),
      sandboxRoot: sandbox,
      workspaceRoot: sandbox,
      sourceRevision: "a10183eb",
      attemptNumber: 1,
    });

    expect(report.filesChanged).toEqual([]);
    expect(report.error?.code).toBe("WORKER_ERROR");
    expect(report.error?.message).toContain("out-of-scope or protected path");
  });

  test("clevia static task reaches checker with filesChanged=2", async () => {
    sandbox = path.join(tmpdir(), `bl-worker-static-${crypto.randomUUID()}`);
    await mkdir(sandbox, { recursive: true });
    mockStaticPrototypeRunner(JSON.stringify(validPayload));

    const contract = staticPrototypeContract();
    const workerReport = await new AdkGeminiWorker().execute({
      contract,
      sandboxRoot: sandbox,
      workspaceRoot: sandbox,
      sourceRevision: "a10183eb",
      attemptNumber: 1,
    });

    const checkerResult = await new DeterministicChecker().run({
      runId: "run-static",
      attemptNumber: 1,
      contract,
      sandboxRoot: sandbox,
      workspaceRoot: sandbox,
      workerReport,
      sourceRevisionAtStart: "a10183eb",
      sourceRevisionNow: "a10183eb",
      skipCommandExecution: true,
    });

    expect(workerReport.filesChanged).toHaveLength(2);
    expect(checkerResult.passed).toBe(true);
    expect(checkerResult.evidence.some((item) => item.name === "worker_error")).toBe(false);
  });

  test("parse failure is operational and does not consume semantic correction", async () => {
    sandbox = path.join(tmpdir(), `bl-worker-static-${crypto.randomUUID()}`);
    await mkdir(sandbox, { recursive: true });
    mockStaticPrototypeRunner("{not-json");

    const workerReport = await new AdkGeminiWorker().execute({
      contract: staticPrototypeContract(),
      sandboxRoot: sandbox,
      workspaceRoot: sandbox,
      sourceRevision: "a10183eb",
      attemptNumber: 1,
    });

    expect(workerReport.error?.code).toBe("GEMINI_MALFORMED");
    expect(isOperationalWorkerError("GEMINI_MALFORMED")).toBe(true);

    const checkerResult = await new DeterministicChecker().run({
      runId: "run-parse-fail",
      attemptNumber: 1,
      contract: staticPrototypeContract(),
      sandboxRoot: sandbox,
      workspaceRoot: sandbox,
      workerReport,
      sourceRevisionAtStart: "a10183eb",
      sourceRevisionNow: "a10183eb",
      skipCommandExecution: true,
    });

    expect(checkerResult.operationalFailure).toBe(true);
    const decision = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(decision.shouldCorrect).toBe(false);
    expect(decision.rule).toBe("OPERATIONAL_FAILURE");
  });
});

describe("worker execution evidence presentation", () => {
  test("generic worker execution failure is not described as outside approved scope", () => {
    const task: TaskRecord = {
      id: "00000000-0000-4000-8000-000000000010",
      workspace: "akbartantu/clevia",
      goal: "Create prototype/index.html and prototype/styles.css only.",
      status: "FAILED",
      contract: buildContract("Create prototype/index.html and prototype/styles.css only."),
      blockedReasons: [],
      runnerState: {
        ...zeroChangeRunnerState("Worker failed."),
        runnerInvoked: true,
        filesChanged: 0,
        evidence: [
          {
            category: "worker",
            name: "worker_error",
            status: "fail",
            summary: "Worker reported an execution error before producing file changes.",
            details: "WORKER_ERROR: BuildLoop tidak dapat menyelesaikan langkah worker karena terjadi error sistem.",
          },
        ],
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
      lockedAt: "2026-01-01T00:00:30.000Z",
      projectId: null,
      sourceCommitSha: "a10183eb",
    };

    expect(resolveCheckKey("worker", "worker_error")).toBe("worker_execution");
    expect(formatCheckUserLine("worker_execution", "fail", "en")).toBe(
      "The coding worker failed before producing usable file changes.",
    );
    expect(formatCheckUserLine("worker_execution", "fail", "en")).not.toContain("outside the approved scope");

    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const summary = buildEvidenceSummaryViewModel(task, lifecycle, "en");
    expect(summary?.whatFailed.join(" ")).toContain("failed before producing usable file changes");
    expect(summary?.whatFailed.join(" ")).not.toContain("outside the approved scope");
  });
});
