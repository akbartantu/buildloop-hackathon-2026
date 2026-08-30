import { Gemini, InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";
import type { Event } from "@google/adk";

import { safeLogSummary } from "@/lib/redaction";
import { GeminiClientError } from "../gemini/errors";
import {
  DEFAULT_OPERATIONAL_RETRY,
  operationalFailureMessage,
  runWithOperationalRetry,
  type OperationalRetryConfig,
} from "../gemini/retry-policy";

export const BUILDLOOP_ADK_MODEL = "gemini-3.6-flash";

export type AdkAgentRunRequest = {
  systemInstruction: string;
  userPrompt: string;
  model?: string;
};

export type AdkAgentRunResult = {
  text: string;
  model: string;
  latencyMs: number;
  operationalRetries: number;
  geminiCallCount: number;
  adkRunnerInvoked: true;
  adkAgentName: string;
};

export type AdkAgentRunner = {
  run(request: AdkAgentRunRequest): Promise<AdkAgentRunResult>;
  isConfigured(): boolean;
};

let runnerOverride: AdkAgentRunner | null = null;

/** Test hook — inject mock official ADK runner without live API. */
export function setAdkRunnerOverride(runner: AdkAgentRunner | null): void {
  runnerOverride = runner;
}

export function getAdkRunnerOverride(): AdkAgentRunner | null {
  return runnerOverride;
}

export function createOfficialAdkRunner(
  retryConfig: OperationalRetryConfig = DEFAULT_OPERATIONAL_RETRY,
): AdkAgentRunner {
  return {
    isConfigured: () => Boolean(process.env["GEMINI_API_KEY"]),
    async run(request) {
      const started = Date.now();
      const model = request.model ?? BUILDLOOP_ADK_MODEL;
      let adkRunnerInvoked = false;
      try {
        const { result, operationalRetries, geminiCallCount } = await runWithOperationalRetry(
          () => {
            adkRunnerInvoked = true;
            return invokeOfficialAdkRunner(request, model);
          },
          retryConfig,
        );

        return {
          ...result,
          latencyMs: Date.now() - started,
          operationalRetries,
          geminiCallCount,
        };
      } catch (error) {
        if (error instanceof GeminiClientError) {
          const context: {
            adkRunnerInvoked?: boolean;
            operationalRetries?: number;
            geminiCallCount?: number;
          } = {
            adkRunnerInvoked: adkRunnerInvoked || error.adkRunnerInvoked === true,
          };
          if (error.operationalRetries !== undefined) {
            context.operationalRetries = error.operationalRetries;
          }
          if (error.geminiCallCount !== undefined) {
            context.geminiCallCount = error.geminiCallCount;
          }
          error.withContext(context);
        }
        throw error;
      }
    },
  };
}

export function getBuildLoopAdkRunner(): AdkAgentRunner {
  return runnerOverride ?? createOfficialAdkRunner();
}

async function invokeOfficialAdkRunner(
  request: AdkAgentRunRequest,
  model: string,
): Promise<Omit<AdkAgentRunResult, "operationalRetries" | "geminiCallCount">> {
  const agentName = "buildloop_coding_worker";
  const agent = new LlmAgent({
    name: agentName,
    model: new Gemini({ model }),
    instruction: request.systemInstruction,
    includeContents: "none",
    generateContentConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const runner = new InMemoryRunner({
    agent,
    appName: "buildloop-orchestrator",
  });

  const events: Event[] = [];
  for await (const event of runner.runEphemeral({
    userId: "buildloop",
    newMessage: { parts: [{ text: request.userPrompt }] },
  })) {
    events.push(event);
  }

  const text = extractAdkResponseText(events);
  if (!text) {
    const errorMessage = events.map((event) => event.errorMessage).filter(Boolean).join(" ");
    throw classifyEmptyAdkResponse(errorMessage);
  }

  return {
    text,
    model,
    latencyMs: 0,
    adkRunnerInvoked: true,
    adkAgentName: agentName,
  };
}

function classifyEmptyAdkResponse(errorMessage: string): GeminiClientError {
  const redacted = safeLogSummary(errorMessage, 300);
  const status = extractHttpStatusFromMessage(redacted);
  if (status === 429 || /quota|rate limit|429/i.test(redacted)) {
    return new GeminiClientError(
      "GEMINI_QUOTA_EXHAUSTED",
      operationalFailureMessage("GEMINI_QUOTA_EXHAUSTED"),
      429,
      undefined,
      { adkRunnerInvoked: true, geminiCallCount: 1 },
    );
  }
  return new GeminiClientError(
    "ADK_EMPTY_RESPONSE",
    redacted || "Official ADK runner returned empty response.",
    undefined,
    undefined,
    { adkRunnerInvoked: true, geminiCallCount: 1 },
  );
}

function extractAdkResponseText(events: Event[]): string {
  const chunks: string[] = [];
  for (const event of events) {
    if (event.errorMessage) {
      throw mapAdkEventError(event.errorCode, event.errorMessage);
    }
    const text = stringifyContent(event);
    if (text) chunks.push(text);
    if (event.output !== undefined) {
      chunks.push(typeof event.output === "string" ? event.output : JSON.stringify(event.output));
    }
  }
  return chunks.join("").trim();
}

function mapAdkEventError(code: string | undefined, message: string): GeminiClientError {
  const redacted = safeLogSummary(message, 300);
  const status = extractHttpStatusFromMessage(redacted);
  if (status === 429 || /quota|rate limit|429/i.test(redacted)) {
    return new GeminiClientError(
      "GEMINI_QUOTA_EXHAUSTED",
      operationalFailureMessage("GEMINI_QUOTA_EXHAUSTED"),
      429,
      undefined,
      { adkRunnerInvoked: true, geminiCallCount: 1 },
    );
  }
  if (status !== undefined && status >= 500) {
    return new GeminiClientError(
      "GEMINI_OPERATIONAL_FAILURE",
      operationalFailureMessage("GEMINI_OPERATIONAL_FAILURE"),
      status,
      undefined,
      { adkRunnerInvoked: true, geminiCallCount: 1 },
    );
  }
  if (status === 401 || status === 403) {
    return new GeminiClientError(
      "GEMINI_AUTH_DENIED",
      operationalFailureMessage("GEMINI_AUTH_DENIED"),
      status,
      undefined,
      { adkRunnerInvoked: true, geminiCallCount: 1 },
    );
  }
  return new GeminiClientError(code ?? "ADK_OPERATIONAL_FAILURE", redacted, status, undefined, {
    adkRunnerInvoked: true,
    geminiCallCount: 1,
  });
}

function extractHttpStatusFromMessage(message: string): number | undefined {
  const match = /(?:HTTP\s+|\bstatus[:\s]+|"code":\s*)(\d{3})/i.exec(message);
  if (!match?.[1]) return undefined;
  const status = Number(match[1]);
  return Number.isFinite(status) ? status : undefined;
}
