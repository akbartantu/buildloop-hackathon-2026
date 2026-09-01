import { describe, expect, test } from "bun:test";

import { parseWorkerStructuredOutput } from "../gemini/client";
import { AdkGeminiWorker } from "./gemini-agent";
import { setAdkRunnerOverride } from "./runner";
import {
  buildWorkerGeminiResponseDiagnostics,
  formatWorkerGeminiResponseDiagnostics,
  isMaxTokensFinishReason,
} from "./worker-response-diagnostics";
import { BUILDLOOP_WORKER_GENERATE_CONTENT_CONFIG } from "./worker-agent-config";

describe("worker Gemini response diagnostics", () => {
  test("captures finish reason and token counts when present on the selected event", () => {
    const diagnostics = buildWorkerGeminiResponseDiagnostics({
      event: {
        finishReason: "MAX_TOKENS",
        usageMetadata: {
          promptTokenCount: 323,
          candidatesTokenCount: 861,
          thoughtsTokenCount: 2382,
          totalTokenCount: 3566,
        },
      },
      rawResponseLength: 826,
    });

    expect(diagnostics).toEqual({
      finishReason: "MAX_TOKENS",
      promptTokenCount: 323,
      candidatesTokenCount: 861,
      thoughtsTokenCount: 2382,
      totalTokenCount: 3566,
      maxOutputTokens: BUILDLOOP_WORKER_GENERATE_CONTENT_CONFIG.maxOutputTokens,
      rawResponseLength: 826,
    });
  });

  test("returns undefined when no selected event is available", () => {
    expect(buildWorkerGeminiResponseDiagnostics({ event: undefined })).toBeUndefined();
    expect(formatWorkerGeminiResponseDiagnostics(undefined)).toBeUndefined();
  });

  test("missing metadata fields are logged as null without throwing", () => {
    const diagnostics = buildWorkerGeminiResponseDiagnostics({
      event: { finishReason: "STOP" },
      rawResponseLength: 537,
    });

    expect(diagnostics?.finishReason).toBe("STOP");
    expect(diagnostics?.promptTokenCount).toBeNull();
    expect(diagnostics?.candidatesTokenCount).toBeNull();
    expect(diagnostics?.thoughtsTokenCount).toBeNull();
    expect(diagnostics?.totalTokenCount).toBeNull();
    expect(formatWorkerGeminiResponseDiagnostics(diagnostics)).toEqual({
      finishReason: "STOP",
      promptTokenCount: null,
      candidatesTokenCount: null,
      thoughtsTokenCount: null,
      totalTokenCount: null,
      maxOutputTokens: 4096,
      rawResponseLength: 537,
    });
  });

  test("formatted diagnostics never include response text or secret-like keys", () => {
    const formatted = formatWorkerGeminiResponseDiagnostics(
      buildWorkerGeminiResponseDiagnostics({
        event: {
          finishReason: "STOP",
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
        },
        rawResponseLength: 120,
      }),
    );

    expect(formatted).toBeDefined();
    expect(Object.keys(formatted ?? {})).toEqual([
      "finishReason",
      "promptTokenCount",
      "candidatesTokenCount",
      "thoughtsTokenCount",
      "totalTokenCount",
      "maxOutputTokens",
      "rawResponseLength",
    ]);
    expect(JSON.stringify(formatted)).not.toContain("GEMINI_API_KEY");
    expect(JSON.stringify(formatted)).not.toContain("changedFiles");
  });

  test("isMaxTokensFinishReason identifies MAX_TOKENS only", () => {
    expect(isMaxTokensFinishReason("MAX_TOKENS")).toBe(true);
    expect(isMaxTokensFinishReason("STOP")).toBe(false);
    expect(isMaxTokensFinishReason(null)).toBe(false);
  });

  test("parser behavior remains unchanged for valid and invalid worker output", () => {
    expect(() =>
      parseWorkerStructuredOutput(
        JSON.stringify({
          summary: "Done",
          changedFiles: [{ path: "prototype/index.html", content: "<html></html>" }],
        }),
      ),
    ).not.toThrow();

    expect(() => parseWorkerStructuredOutput("{not-json")).toThrow();
  });

  test("malformed ADK output logs safe Gemini metadata without response content", async () => {
    const originalError = console.error;
    const logs: unknown[] = [];
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };

    setAdkRunnerOverride({
      isConfigured: () => true,
      run: async () => ({
        text: '{"summary":"truncated","changedFiles":[',
        model: "gemini-3.6-flash",
        latencyMs: 1,
        operationalRetries: 0,
        geminiCallCount: 1,
        adkRunnerInvoked: true,
        adkAgentName: "buildloop_coding_worker",
        responseDiagnostics: {
          finishReason: "MAX_TOKENS",
          promptTokenCount: 323,
          candidatesTokenCount: 120,
          thoughtsTokenCount: 3500,
          totalTokenCount: 3943,
          maxOutputTokens: 4096,
          rawResponseLength: 37,
        },
      }),
    });

    try {
      const worker = new AdkGeminiWorker();
      const report = await worker.execute({
        contract: {
          id: "contract-id",
          taskId: "task-id",
          version: 1,
          goal: "Create prototype/index.html and prototype/styles.css only.",
          inScope: ["prototype/**"],
          outOfScope: [],
          acceptanceCriteria: ["Prototype pages render static layout."],
          allowedPaths: ["prototype/index.html", "prototype/styles.css"],
          allowedCommands: [],
          protectedAreas: [".env"],
          approvalRequiredPaths: [],
        },
        sandboxRoot: process.cwd(),
        workspaceRoot: process.cwd(),
        sourceRevision: "rev",
        attemptNumber: 1,
      });

      expect(report.error?.code).toBe("GEMINI_MALFORMED");
      expect(logs.length).toBeGreaterThan(0);
      const payload = logs.find(
        (entry) => Array.isArray(entry) && entry[0] === "[worker] execution failed",
      );
      expect(payload).toBeDefined();
      const record = (payload as [string, Record<string, unknown>] | undefined)?.[1];
      expect(record?.finishReason).toBe("MAX_TOKENS");
      expect(record?.promptTokenCount).toBe(323);
      expect(record?.candidatesTokenCount).toBe(120);
      expect(record?.thoughtsTokenCount).toBe(3500);
      expect(record?.totalTokenCount).toBe(3943);
      expect(record?.maxOutputTokens).toBe(4096);
      expect(record?.schemaFailureCode).toBe("invalid_json");
      expect(JSON.stringify(record)).not.toContain("truncated");
      expect(JSON.stringify(record)).not.toContain("prototype/index.html");
    } finally {
      console.error = originalError;
      setAdkRunnerOverride(null);
    }
  });
});
