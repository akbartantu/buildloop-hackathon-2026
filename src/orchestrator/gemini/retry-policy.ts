import { GeminiClientError, isGeminiClientError } from "./errors";

export type RetryClassification = {
  retryable: boolean;
  code: string;
  retryAfterMs?: number;
};

export type OperationalRetryConfig = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxTotalWaitMs: number;
  jitterMs: number;
};

export const DEFAULT_OPERATIONAL_RETRY: OperationalRetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  maxTotalWaitMs: 20_000,
  jitterMs: 250,
};

const OPERATIONAL_ERROR_CODES = new Set([
  "GEMINI_QUOTA_EXHAUSTED",
  "GEMINI_OPERATIONAL_FAILURE",
  "GEMINI_TIMEOUT",
  "GEMINI_NETWORK",
  "GEMINI_UNAVAILABLE",
  "ADK_OPERATIONAL_FAILURE",
  "ADK_EMPTY_RESPONSE",
]);

const QUOTA_MESSAGE_PATTERN =
  /\b429\b|quota|rate limit|resource exhausted|too many requests|exceeded your current quota/i;

export function isOperationalWorkerError(code: string, message = ""): boolean {
  if (OPERATIONAL_ERROR_CODES.has(code)) {
    if (code === "ADK_EMPTY_RESPONSE") return true;
    return true;
  }
  if (QUOTA_MESSAGE_PATTERN.test(message)) return true;
  if (extractHttpStatus(message) === 429) return true;
  return false;
}

export function normalizeOperationalWorkerError(
  code: string,
  message: string,
): { code: string; message: string; operational: boolean } {
  if (QUOTA_MESSAGE_PATTERN.test(message) || extractHttpStatus(message) === 429) {
    return {
      code: "GEMINI_QUOTA_EXHAUSTED",
      message: operationalFailureMessage("GEMINI_QUOTA_EXHAUSTED"),
      operational: true,
    };
  }
  if (isOperationalWorkerError(code, message)) {
    return {
      code: code === "ADK_EMPTY_RESPONSE" ? "GEMINI_OPERATIONAL_FAILURE" : code,
      message: operationalFailureMessage(code === "ADK_EMPTY_RESPONSE" ? "GEMINI_OPERATIONAL_FAILURE" : code),
      operational: true,
    };
  }
  return { code, message, operational: false };
}

export function parseRetryAfterMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, 30_000);
  }
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), 30_000);
  }
  return undefined;
}

export function extractHttpStatus(message: string): number | undefined {
  const match = /HTTP\s+(\d{3})/i.exec(message);
  if (!match?.[1]) return undefined;
  const status = Number(match[1]);
  return Number.isFinite(status) ? status : undefined;
}

export function classifyGeminiError(error: unknown): RetryClassification {
  if (isGeminiClientError(error)) {
    const status = error.httpStatus ?? extractHttpStatus(error.message);
    if (status === 429) {
      return {
        retryable: true,
        code: "GEMINI_QUOTA_EXHAUSTED",
        ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
      };
    }
    if (status !== undefined && status >= 500) {
      return {
        retryable: true,
        code: "GEMINI_OPERATIONAL_FAILURE",
        ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
      };
    }
    if (error.code === "GEMINI_TIMEOUT" || error.code === "GEMINI_NETWORK") {
      return { retryable: true, code: error.code };
    }
    if (error.code === "GEMINI_UNAVAILABLE") {
      return { retryable: false, code: error.code };
    }
    if (status === 401 || status === 403) {
      return { retryable: false, code: "GEMINI_AUTH_DENIED" };
    }
    return { retryable: false, code: error.code };
  }

  const message = error instanceof Error ? error.message : String(error);
  const status = extractHttpStatus(message);
  if (status === 429) {
    return { retryable: true, code: "GEMINI_QUOTA_EXHAUSTED" };
  }
  if (status !== undefined && status >= 500) {
    return { retryable: true, code: "GEMINI_OPERATIONAL_FAILURE" };
  }
  if (/timed out|timeout|AbortError/i.test(message)) {
    return { retryable: true, code: "GEMINI_TIMEOUT" };
  }
  if (/network|ECONNRESET|fetch failed/i.test(message)) {
    return { retryable: true, code: "GEMINI_NETWORK" };
  }
  return { retryable: false, code: "ADK_OPERATIONAL_FAILURE" };
}

export function computeOperationalBackoffMs(
  attempt: number,
  config: OperationalRetryConfig,
  retryAfterMs?: number,
): number {
  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, config.maxDelayMs);
  }
  const exponential = Math.min(config.baseDelayMs * 2 ** attempt, config.maxDelayMs);
  const jitter = Math.floor(Math.random() * config.jitterMs);
  return exponential + jitter;
}

export async function runWithOperationalRetry<T>(
  operation: () => Promise<T>,
  config: OperationalRetryConfig = DEFAULT_OPERATIONAL_RETRY,
): Promise<{ result: T; operationalRetries: number; totalWaitMs: number; geminiCallCount: number }> {
  let lastError: unknown;
  let totalWaitMs = 0;
  let attemptsMade = 0;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    attemptsMade += 1;
    try {
      const result = await operation();
      return {
        result,
        operationalRetries: attempt,
        totalWaitMs,
        geminiCallCount: attemptsMade,
      };
    } catch (error) {
      lastError = error;
      const classification = classifyGeminiError(error);
      const isLastAttempt = attempt >= config.maxRetries;
      if (!classification.retryable || isLastAttempt) {
        break;
      }

      const delayMs = computeOperationalBackoffMs(attempt, config, classification.retryAfterMs);
      if (totalWaitMs + delayMs > config.maxTotalWaitMs) {
        break;
      }
      totalWaitMs += delayMs;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const classification = classifyGeminiError(lastError);
  const code =
    classification.code === "GEMINI_QUOTA_EXHAUSTED" ||
    extractHttpStatus(lastError instanceof Error ? lastError.message : String(lastError)) === 429
      ? "GEMINI_QUOTA_EXHAUSTED"
      : classification.retryable
        ? "GEMINI_OPERATIONAL_FAILURE"
        : classification.code;

  const err = new GeminiClientError(
    code,
    operationalFailureMessage(code),
    extractHttpStatus(lastError instanceof Error ? lastError.message : String(lastError)),
    undefined,
    {
      operationalRetries: Math.max(0, attemptsMade - 1),
      geminiCallCount: attemptsMade,
      adkRunnerInvoked: true,
    },
  );
  throw err;
}

export function operationalFailureMessage(code: string): string {
  if (code === "GEMINI_QUOTA_EXHAUSTED") {
    return "Gemini sedang mencapai batas penggunaan. BuildLoop menghentikan proses tanpa menganggap perubahan sebagai hasil final.";
  }
  if (code === "GEMINI_UNAVAILABLE" || code === "GEMINI_AUTH_DENIED") {
    return "Konfigurasi Gemini tidak valid atau tidak tersedia.";
  }
  if (code === "GEMINI_TIMEOUT" || code === "GEMINI_NETWORK" || code === "GEMINI_OPERATIONAL_FAILURE") {
    return "Gemini tidak dapat dihubungi setelah retry operasional. BuildLoop menghentikan proses tanpa hasil final.";
  }
  return "Worker operational error.";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
