import { describe, expect, test } from "bun:test";

import { workerOutputSchema } from "../gemini/client";
import {
  BUILDLOOP_WORKER_GENERATE_CONTENT_CONFIG,
  buildBuildLoopWorkerAgentOptions,
  resolveWorkerGeminiGenerationConfig,
} from "./worker-agent-config";

/** Minimal genai Schema stand-in for asserting ADK setOutputSchema merge behavior. */
const sampleGenaiWorkerSchema = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    changedFiles: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING" },
          content: { type: "STRING" },
        },
        required: ["path", "content"],
      },
    },
  },
  required: ["summary", "changedFiles"],
} as const;

describe("BuildLoop worker ADK structured output config", () => {
  test("LlmAgent options set ADK outputSchema and JSON mime type", () => {
    const options = buildBuildLoopWorkerAgentOptions({
      model: "gemini-3.6-flash",
      systemInstruction: "Return JSON only.",
    });

    expect(options.outputSchema).toBe(workerOutputSchema);
    expect(options.generateContentConfig.responseMimeType).toBe("application/json");
    expect(options.generateContentConfig.temperature).toBe(0.2);
    expect(options.generateContentConfig.maxOutputTokens).toBe(8192);
    expect("responseSchema" in options.generateContentConfig).toBe(false);
    expect(options.includeContents).toBe("none");
  });

  test("resolved Gemini config requests application/json with responseSchema", () => {
    const resolved = resolveWorkerGeminiGenerationConfig(
      BUILDLOOP_WORKER_GENERATE_CONTENT_CONFIG,
      sampleGenaiWorkerSchema,
    );

    expect(resolved.responseMimeType).toBe("application/json");
    expect(resolved.responseSchema).toEqual(sampleGenaiWorkerSchema);
    expect(resolved.temperature).toBe(0.2);
    expect(resolved.maxOutputTokens).toBe(8192);
  });

  test("worker schema requires summary and changedFiles", () => {
    expect(workerOutputSchema.safeParse({}).success).toBe(false);
    expect(workerOutputSchema.safeParse({ summary: "Done" }).success).toBe(false);
    expect(
      workerOutputSchema.safeParse({
        summary: "Done",
        changedFiles: [{ path: "prototype/index.html", content: "<html></html>" }],
      }).success,
    ).toBe(true);
  });

  test("valid structured JSON still reaches the strict worker parser", () => {
    const parsed = workerOutputSchema.parse({
      summary: "Added prototype pages.",
      changedFiles: [
        { path: "prototype/index.html", content: "<html></html>" },
        { path: "prototype/styles.css", content: "body { margin: 0; }" },
      ],
    });

    expect(parsed.changedFiles).toHaveLength(2);
    expect(parsed.changedFiles[0]?.path).toBe("prototype/index.html");
  });
});
