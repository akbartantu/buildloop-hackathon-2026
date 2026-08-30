import { z } from "zod";

import { safeLogSummary } from "@/lib/redaction";
import { GeminiClientError } from "./errors";
import {
  classifyGeminiError,
  computeOperationalBackoffMs,
  DEFAULT_OPERATIONAL_RETRY,
  operationalFailureMessage,
  parseRetryAfterMs,
} from "./retry-policy";

export type GeminiClientConfig = {
  model: string;
  apiKeyEnvVar: string;
  timeoutMs: number;
  maxOperationalRetries: number;
};

const DEFAULT_CONFIG: GeminiClientConfig = {
  model: "gemini-3.6-flash",
  apiKeyEnvVar: "GEMINI_API_KEY",
  timeoutMs: 45_000,
  maxOperationalRetries: DEFAULT_OPERATIONAL_RETRY.maxRetries,
};

export type GeminiGenerateRequest = {
  systemInstruction: string;
  userPrompt: string;
};

export type GeminiGenerateResult = {
  text: string;
  model: string;
  latencyMs: number;
  operationalRetries: number;
};

export class GeminiClient {
  private readonly config: GeminiClientConfig;

  constructor(config: Partial<GeminiClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getApiKey(): string | undefined {
    return process.env[this.config.apiKeyEnvVar];
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  async generateContent(input: GeminiGenerateRequest): Promise<GeminiGenerateResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new GeminiClientError("GEMINI_UNAVAILABLE", "Missing GEMINI_API_KEY");
    }

    let lastError: GeminiClientError | null = null;
    let totalWaitMs = 0;

    for (let attempt = 0; attempt <= this.config.maxOperationalRetries; attempt++) {
      try {
        const result = await this.callOnce(apiKey, input);
        return { ...result, operationalRetries: attempt };
      } catch (error) {
        const normalized =
          error instanceof GeminiClientError
            ? error
            : new GeminiClientError("GEMINI_NETWORK", safeLogSummary(String(error), 200));
        lastError = normalized;
        const classification = classifyGeminiError(normalized);
        const isLastAttempt = attempt >= this.config.maxOperationalRetries;
        if (!classification.retryable || isLastAttempt) {
          break;
        }

        const delayMs = computeOperationalBackoffMs(
          attempt,
          DEFAULT_OPERATIONAL_RETRY,
          classification.retryAfterMs ?? normalized.retryAfterMs,
        );
        if (totalWaitMs + delayMs > DEFAULT_OPERATIONAL_RETRY.maxTotalWaitMs) {
          break;
        }
        totalWaitMs += delayMs;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const classification = classifyGeminiError(lastError);
    const code =
      classification.code === "GEMINI_QUOTA_EXHAUSTED" || lastError?.httpStatus === 429
        ? "GEMINI_QUOTA_EXHAUSTED"
        : classification.retryable
          ? "GEMINI_OPERATIONAL_FAILURE"
          : (lastError?.code ?? "GEMINI_FAILED");

    throw new GeminiClientError(
      code,
      operationalFailureMessage(code),
      lastError?.httpStatus,
      lastError?.retryAfterMs,
    );
  }

  private async callOnce(apiKey: string, input: GeminiGenerateRequest): Promise<Omit<GeminiGenerateResult, "operationalRetries">> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: input.userPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        const body = safeLogSummary(await response.text(), 300);
        const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
        throw new GeminiClientError(
          response.status === 429 ? "GEMINI_QUOTA_EXHAUSTED" : "GEMINI_HTTP",
          `Gemini HTTP ${response.status}: ${body}`,
          response.status,
          retryAfterMs,
        );
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!text.trim()) {
        throw new GeminiClientError("GEMINI_EMPTY", "Gemini returned empty response.");
      }

      return {
        text,
        model: this.config.model,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof GeminiClientError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new GeminiClientError("GEMINI_TIMEOUT", "Gemini request timed out.");
      }
      throw new GeminiClientError(
        "GEMINI_NETWORK",
        safeLogSummary(error instanceof Error ? error.message : String(error), 200),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export { GeminiClientError } from "./errors";

export const workerOutputSchema = z.object({
  summary: z.string().min(1),
  changedFiles: z.array(
    z.object({
      path: z.string().min(1),
      content: z.string(),
    }),
  ),
  implementationNotes: z.string().optional(),
  requestedChecks: z.array(z.string()).optional(),
  unresolvedIssues: z.array(z.string()).optional(),
  blockedByMissingInformation: z.boolean().optional(),
});

export type WorkerStructuredOutput = z.infer<typeof workerOutputSchema>;

export function parseWorkerStructuredOutput(raw: string): WorkerStructuredOutput {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  const candidate =
    jsonStart >= 0 && jsonEnd > jsonStart ? trimmed.slice(jsonStart, jsonEnd + 1) : trimmed;
  const parsed = workerOutputSchema.safeParse(JSON.parse(candidate));
  if (!parsed.success) {
    throw new GeminiClientError(
      "GEMINI_MALFORMED",
      `Worker output failed schema validation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
