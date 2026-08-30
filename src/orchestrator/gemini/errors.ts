export type GeminiErrorContext = {
  adkRunnerInvoked?: boolean;
  operationalRetries?: number;
  geminiCallCount?: number;
};

export class GeminiClientError extends Error {
  adkRunnerInvoked?: boolean;
  operationalRetries?: number;
  geminiCallCount?: number;

  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus?: number,
    readonly retryAfterMs?: number,
    context?: GeminiErrorContext,
  ) {
    super(message);
    this.name = "GeminiClientError";
    if (context?.adkRunnerInvoked !== undefined) this.adkRunnerInvoked = context.adkRunnerInvoked;
    if (context?.operationalRetries !== undefined) this.operationalRetries = context.operationalRetries;
    if (context?.geminiCallCount !== undefined) this.geminiCallCount = context.geminiCallCount;
  }

  withContext(context: GeminiErrorContext): GeminiClientError {
    if (context.adkRunnerInvoked !== undefined) this.adkRunnerInvoked = context.adkRunnerInvoked;
    if (context.operationalRetries !== undefined) this.operationalRetries = context.operationalRetries;
    if (context.geminiCallCount !== undefined) this.geminiCallCount = context.geminiCallCount;
    return this;
  }
}

export function isGeminiClientError(error: unknown): error is GeminiClientError {
  return error instanceof GeminiClientError;
}
