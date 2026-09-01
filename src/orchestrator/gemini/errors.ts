export type GeminiErrorContext = {
  adkRunnerInvoked?: boolean;
  operationalRetries?: number;
  geminiCallCount?: number;
};

export type WorkerOutputParseDiagnostics = {
  startsWithFence: boolean;
  endsWithFence: boolean;
  topLevelType: string | null;
  topLevelKeys: string[] | null;
  changedFilesPresent: boolean;
  changedFilesType: string | null;
  schemaFailureCode: string | null;
};

export class GeminiClientError extends Error {
  adkRunnerInvoked?: boolean;
  operationalRetries?: number;
  geminiCallCount?: number;
  parseDiagnostics?: WorkerOutputParseDiagnostics;

  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus?: number,
    readonly retryAfterMs?: number,
    context?: GeminiErrorContext & { parseDiagnostics?: WorkerOutputParseDiagnostics },
  ) {
    super(message);
    this.name = "GeminiClientError";
    if (context?.adkRunnerInvoked !== undefined) this.adkRunnerInvoked = context.adkRunnerInvoked;
    if (context?.operationalRetries !== undefined) this.operationalRetries = context.operationalRetries;
    if (context?.geminiCallCount !== undefined) this.geminiCallCount = context.geminiCallCount;
    if (context?.parseDiagnostics) this.parseDiagnostics = context.parseDiagnostics;
  }

  withContext(context: GeminiErrorContext & { parseDiagnostics?: WorkerOutputParseDiagnostics }): GeminiClientError {
    if (context.adkRunnerInvoked !== undefined) this.adkRunnerInvoked = context.adkRunnerInvoked;
    if (context.operationalRetries !== undefined) this.operationalRetries = context.operationalRetries;
    if (context.geminiCallCount !== undefined) this.geminiCallCount = context.geminiCallCount;
    if (context.parseDiagnostics) this.parseDiagnostics = context.parseDiagnostics;
    return this;
  }
}

export function isGeminiClientError(error: unknown): error is GeminiClientError {
  return error instanceof GeminiClientError;
}
