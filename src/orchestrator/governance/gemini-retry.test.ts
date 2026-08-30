import { afterEach, describe, expect, test } from "bun:test";

import { GeminiClientError } from "../gemini/client";
import {
  classifyGeminiError,
  computeOperationalBackoffMs,
  DEFAULT_OPERATIONAL_RETRY,
  isOperationalWorkerError,
  parseRetryAfterMs,
  runWithOperationalRetry,
  sleep,
} from "../gemini/retry-policy";

describe("G429 — Gemini operational retry", () => {
  afterEach(() => {
    delete process.env["GEMINI_API_KEY"];
  });

  test("G429-1: single 429 then success via operational retry", async () => {
    let calls = 0;
    const { result, operationalRetries } = await runWithOperationalRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new GeminiClientError("GEMINI_QUOTA_EXHAUSTED", "Gemini HTTP 429: quota", 429);
        }
        return "ok";
      },
      { ...DEFAULT_OPERATIONAL_RETRY, maxRetries: 3, baseDelayMs: 1, maxTotalWaitMs: 50, jitterMs: 0 },
    );
    expect(result).toBe("ok");
    expect(operationalRetries).toBe(1);
    expect(calls).toBe(2);
  });

  test("G429-2: repeated 429 stops with bounded calls and operational code", async () => {
    let calls = 0;
    await expect(
      runWithOperationalRetry(
        async () => {
          calls += 1;
          throw new GeminiClientError("GEMINI_QUOTA_EXHAUSTED", "Gemini HTTP 429: quota", 429);
        },
        { ...DEFAULT_OPERATIONAL_RETRY, maxRetries: 3, baseDelayMs: 1, maxTotalWaitMs: 50, jitterMs: 0 },
      ),
    ).rejects.toMatchObject({ code: "GEMINI_QUOTA_EXHAUSTED" });
    expect(calls).toBe(4);
  });

  test("G429-3: Retry-After header is honored within cap", () => {
    expect(parseRetryAfterMs("2")).toBe(2_000);
    expect(computeOperationalBackoffMs(0, DEFAULT_OPERATIONAL_RETRY, 1_500)).toBe(1_500);
  });

  test("G429-4: 401 invalid key is not retried", async () => {
    let calls = 0;
    await expect(
      runWithOperationalRetry(async () => {
        calls += 1;
        throw new GeminiClientError("GEMINI_AUTH_DENIED", "Gemini HTTP 401: denied", 401);
      }, { ...DEFAULT_OPERATIONAL_RETRY, maxRetries: 3, maxTotalWaitMs: 100 }),
    ).rejects.toMatchObject({ code: "GEMINI_AUTH_DENIED" });
    expect(calls).toBe(1);
  });

  test("G429-5: timeout then success uses operational retry path", async () => {
    let calls = 0;
    const { result, operationalRetries } = await runWithOperationalRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new GeminiClientError("GEMINI_TIMEOUT", "Gemini request timed out.");
        }
        return "ok";
      },
      { ...DEFAULT_OPERATIONAL_RETRY, maxRetries: 2, baseDelayMs: 1, maxTotalWaitMs: 50, jitterMs: 0 },
    );
    expect(result).toBe("ok");
    expect(operationalRetries).toBe(1);
    expect(calls).toBe(2);
  });

  test("operational worker error codes are classified", () => {
    expect(isOperationalWorkerError("GEMINI_QUOTA_EXHAUSTED")).toBe(true);
    expect(isOperationalWorkerError("ADK_EMPTY_RESPONSE", "HTTP 429 quota")).toBe(true);
    expect(isOperationalWorkerError("WORKER_ERROR", "rate limit exceeded")).toBe(true);
    expect(isOperationalWorkerError("GEMINI_MALFORMED")).toBe(false);
    expect(classifyGeminiError(new GeminiClientError("GEMINI_HTTP", "HTTP 503", 503)).retryable).toBe(true);
  });

  test("sleep helper resolves", async () => {
    const started = Date.now();
    await sleep(5);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4);
  });
});
