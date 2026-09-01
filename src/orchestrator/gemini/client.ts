import { z } from "zod";

import { safeLogSummary } from "@/lib/redaction";
import { GeminiClientError, type WorkerOutputParseDiagnostics } from "./errors";
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

export { GeminiClientError, type WorkerOutputParseDiagnostics } from "./errors";

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

/** Strip relative prefixes and normalize separators for contract path matching. */
export function normalizeWorkerFilePath(filePath: string): string {
  let normalized = filePath.replace(/\\/g, "/").trim();
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  normalized = normalized.replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new GeminiClientError("GEMINI_MALFORMED", `Invalid worker file path: ${filePath}`);
  }
  return normalized;
}

const UTF8_BOM = "\uFEFF";
const SINGLE_FENCE_PATTERN = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/i;

export function stripWorkerOutputBom(raw: string): string {
  return raw.startsWith(UTF8_BOM) ? raw.slice(UTF8_BOM.length) : raw;
}

export function inspectWorkerOutputFence(raw: string): Pick<
  WorkerOutputParseDiagnostics,
  "startsWithFence" | "endsWithFence"
> {
  const trimmed = stripWorkerOutputBom(raw).trim();
  return {
    startsWithFence: trimmed.startsWith("```"),
    endsWithFence: trimmed.endsWith("```"),
  };
}

function describeParsedWorkerPayload(parsed: unknown): Pick<
  WorkerOutputParseDiagnostics,
  "topLevelType" | "topLevelKeys" | "changedFilesPresent" | "changedFilesType"
> {
  if (parsed === null || typeof parsed !== "object") {
    return {
      topLevelType: parsed === null ? "null" : typeof parsed,
      topLevelKeys: null,
      changedFilesPresent: false,
      changedFilesType: null,
    };
  }
  if (Array.isArray(parsed)) {
    return {
      topLevelType: "array",
      topLevelKeys: null,
      changedFilesPresent: false,
      changedFilesType: null,
    };
  }
  const record = parsed as Record<string, unknown>;
  const changedFiles = record["changedFiles"] ?? record["changed_files"];
  return {
    topLevelType: "object",
    topLevelKeys: Object.keys(record),
    changedFilesPresent: changedFiles !== undefined,
    changedFilesType:
      changedFiles === undefined ? null : Array.isArray(changedFiles) ? "array" : typeof changedFiles,
  };
}

export function buildWorkerOutputParseDiagnostics(input: {
  raw: string;
  parsed?: unknown;
  schemaFailureCode?: string | null;
}): WorkerOutputParseDiagnostics {
  const fence = inspectWorkerOutputFence(input.raw);
  const payload = describeParsedWorkerPayload(input.parsed ?? null);
  return {
    ...fence,
    ...payload,
    schemaFailureCode: input.schemaFailureCode ?? null,
  };
}

function throwWorkerOutputParseFailure(
  message: string,
  input: {
    raw: string;
    parsed?: unknown;
    schemaFailureCode?: string | null;
  },
): never {
  throw new GeminiClientError("GEMINI_MALFORMED", message, undefined, undefined, {
    parseDiagnostics: buildWorkerOutputParseDiagnostics(input),
  });
}

/** Map harmless representation aliases onto the canonical worker output schema. */
export function normalizeWorkerOutputPayload(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }

  const record = { ...(parsed as Record<string, unknown>) };
  if (record["changedFiles"] === undefined && Array.isArray(record["changed_files"])) {
    record["changedFiles"] = record["changed_files"];
    delete record["changed_files"];
  }

  if (Array.isArray(record["changedFiles"])) {
    record["changedFiles"] = record["changedFiles"].map((entry) => {
      if (!entry || typeof entry !== "object") {
        return entry;
      }
      const file = entry as Record<string, unknown>;
      if (typeof file["path"] === "string") {
        return entry;
      }
      if (typeof file["filename"] === "string") {
        return { ...file, path: file["filename"] };
      }
      return entry;
    });
  }

  return record;
}

export function extractWorkerOutputJson(raw: string): string {
  const trimmed = stripWorkerOutputBom(raw).trim();
  if (!trimmed) {
    throwWorkerOutputParseFailure("Worker output was empty.", { raw });
  }

  const fenced = trimmed.match(SINGLE_FENCE_PATTERN);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  throwWorkerOutputParseFailure(
    "Worker output was not a single JSON object or fenced JSON block.",
    { raw },
  );
}

export function parseWorkerStructuredOutput(raw: string): WorkerStructuredOutput {
  let candidate = "";
  let parsed: unknown;
  try {
    candidate = extractWorkerOutputJson(raw);
    parsed = JSON.parse(candidate);
  } catch (error) {
    if (error instanceof GeminiClientError) {
      throw error;
    }
    throwWorkerOutputParseFailure("Worker output was not valid JSON.", {
      raw,
      schemaFailureCode: "invalid_json",
    });
  }

  const normalized = normalizeWorkerOutputPayload(parsed);
  const validated = workerOutputSchema.safeParse(normalized);
  if (!validated.success) {
    throwWorkerOutputParseFailure(
      "Worker output failed schema validation.",
      {
        raw,
        parsed: normalized,
        schemaFailureCode: validated.error.issues[0]?.code ?? "invalid_schema",
      },
    );
  }
  return validated.data;
}
