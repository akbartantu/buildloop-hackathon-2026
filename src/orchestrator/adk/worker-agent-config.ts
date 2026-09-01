import { workerOutputSchema } from "../gemini/client";

export const BUILDLOOP_WORKER_AGENT_NAME = "buildloop_coding_worker";

/** Generation settings shared by the official ADK worker agent. */
export const BUILDLOOP_WORKER_GENERATE_CONTENT_CONFIG = {
  temperature: 0.2,
  maxOutputTokens: 4096,
  responseMimeType: "application/json",
} as const;

/**
 * Canonical LlmAgent options for the BuildLoop coding worker.
 *
 * Structured output is enforced via ADK `outputSchema`, which the runtime maps to
 * Gemini `responseMimeType: application/json` and `responseSchema` on the request.
 * Do not set `responseSchema` on `generateContentConfig` — ADK rejects that.
 */
export function buildBuildLoopWorkerAgentOptions(input: {
  model: unknown;
  systemInstruction: string;
}) {
  return {
    name: BUILDLOOP_WORKER_AGENT_NAME,
    model: input.model,
    instruction: input.systemInstruction,
    includeContents: "none" as const,
    outputSchema: workerOutputSchema,
    generateContentConfig: { ...BUILDLOOP_WORKER_GENERATE_CONTENT_CONFIG },
  };
}

/**
 * Mirrors ADK {@link setOutputSchema}: merges agent generation config with the
 * structured-output fields sent to Gemini.
 */
export function resolveWorkerGeminiGenerationConfig(
  generateContentConfig: typeof BUILDLOOP_WORKER_GENERATE_CONTENT_CONFIG,
  outputSchema: unknown,
) {
  return {
    ...generateContentConfig,
    responseMimeType: "application/json",
    responseSchema: outputSchema,
  };
}
