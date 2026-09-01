import { BUILDLOOP_WORKER_GENERATE_CONTENT_CONFIG } from "./worker-agent-config";

/** Safe Gemini/ADK response metadata for malformed-output diagnostics. */
export type WorkerGeminiResponseDiagnostics = {
  finishReason: string | null;
  promptTokenCount: number | null;
  candidatesTokenCount: number | null;
  thoughtsTokenCount: number | null;
  totalTokenCount: number | null;
  maxOutputTokens: number;
  rawResponseLength: number | null;
};

type AdkUsageMetadataLike = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
};

type AdkResponseEventLike = {
  finishReason?: unknown;
  usageMetadata?: AdkUsageMetadataLike;
};

function readOptionalCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readFinishReason(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Build safe diagnostics from the selected ADK worker event, if available. */
export function buildWorkerGeminiResponseDiagnostics(input: {
  event?: AdkResponseEventLike;
  rawResponseLength?: number | null;
  maxOutputTokens?: number;
}): WorkerGeminiResponseDiagnostics | undefined {
  if (!input.event) {
    return undefined;
  }

  const usage = input.event.usageMetadata;
  return {
    finishReason: readFinishReason(input.event.finishReason),
    promptTokenCount: readOptionalCount(usage?.promptTokenCount),
    candidatesTokenCount: readOptionalCount(usage?.candidatesTokenCount),
    thoughtsTokenCount: readOptionalCount(usage?.thoughtsTokenCount),
    totalTokenCount: readOptionalCount(usage?.totalTokenCount),
    maxOutputTokens: input.maxOutputTokens ?? BUILDLOOP_WORKER_GENERATE_CONTENT_CONFIG.maxOutputTokens,
    rawResponseLength:
      input.rawResponseLength === undefined || input.rawResponseLength === null
        ? null
        : input.rawResponseLength,
  };
}

/** Returns true when Gemini reports output stopped due to token limit. */
export function isMaxTokensFinishReason(finishReason: string | null | undefined): boolean {
  return finishReason === "MAX_TOKENS";
}

/** Flatten diagnostics for structured worker failure logs. */
export function formatWorkerGeminiResponseDiagnostics(
  diagnostics: WorkerGeminiResponseDiagnostics | undefined,
): Record<string, string | number | null> | undefined {
  if (!diagnostics) {
    return undefined;
  }

  return {
    finishReason: diagnostics.finishReason,
    promptTokenCount: diagnostics.promptTokenCount,
    candidatesTokenCount: diagnostics.candidatesTokenCount,
    thoughtsTokenCount: diagnostics.thoughtsTokenCount,
    totalTokenCount: diagnostics.totalTokenCount,
    maxOutputTokens: diagnostics.maxOutputTokens,
    rawResponseLength: diagnostics.rawResponseLength,
  };
}
