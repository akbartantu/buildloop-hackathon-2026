import { safeLogSummary } from "@/lib/redaction";
import { GeminiClientError } from "../gemini/errors";
import {
  DEFAULT_OPERATIONAL_RETRY,
  operationalFailureMessage,
  runWithOperationalRetry,
  type OperationalRetryConfig,
} from "../gemini/retry-policy";
import {
  BUILDLOOP_WORKER_AGENT_NAME,
  BUILDLOOP_WORKER_GENERATE_CONTENT_CONFIG,
  buildBuildLoopWorkerAgentOptions,
} from "./worker-agent-config";
import {
  buildWorkerGeminiResponseDiagnostics,
  type WorkerGeminiResponseDiagnostics,
} from "./worker-response-diagnostics";

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
  responseDiagnostics?: WorkerGeminiResponseDiagnostics;
};

export type AdkAgentRunner = {
  run(request: AdkAgentRunRequest): Promise<AdkAgentRunResult>;
  isConfigured(): boolean;
};

type AdkEvent = {
  author?: string;
  errorMessage?: string;
  errorCode?: string;
  output?: unknown;
  finishReason?: unknown;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
};

type OfficialAdkModule = {
  Gemini: new (options: { model: string }) => unknown;
  InMemoryRunner: new (options: {
    agent: unknown;
    appName: string;
  }) => {
    runEphemeral(input: {
      userId: string;
      newMessage: { parts: Array<{ text: string }> };
    }): AsyncIterable<AdkEvent>;
  };
  LlmAgent: new (options: Record<string, unknown>) => unknown;
  stringifyContent: (event: AdkEvent) => string;
  isFinalResponse: (event: AdkEvent) => boolean;
};

let runnerOverride: AdkAgentRunner | null = null;
let officialAdkModulePromise: Promise<OfficialAdkModule> | null = null;

async function loadOfficialAdkModule(): Promise<OfficialAdkModule> {
  if (!officialAdkModulePromise) {
    officialAdkModulePromise = import("@google/adk").catch((error: unknown) => {
      officialAdkModulePromise = null;
      const message = error instanceof Error ? error.message : String(error);
      throw new GeminiClientError(
        "ADK_MODULE_UNAVAILABLE",
        `Official Google ADK runtime is unavailable: ${message}`,
        undefined,
        undefined,
        { adkRunnerInvoked: false, geminiCallCount: 0 },
      );
    }) as Promise<OfficialAdkModule>;
  }
  return officialAdkModulePromise;
}

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
  const { Gemini, InMemoryRunner, LlmAgent, stringifyContent, isFinalResponse } =
    await loadOfficialAdkModule();
  const agentName = BUILDLOOP_WORKER_AGENT_NAME;
  const agent = new LlmAgent(
    buildBuildLoopWorkerAgentOptions({
      model: new Gemini({ model }),
      systemInstruction: request.systemInstruction,
    }),
  );

  const runner = new InMemoryRunner({
    agent,
    appName: "buildloop-orchestrator",
  });

  const events: AdkEvent[] = [];
  for await (const event of runner.runEphemeral({
    userId: "buildloop",
    newMessage: { parts: [{ text: request.userPrompt }] },
  })) {
    events.push(event);
  }

  const selection = selectBuildLoopAdkResponse(events, {
    agentName,
    stringifyContent,
    isFinalResponse,
  });
  const text = selection.text;
  if (!text) {
    const errorMessage = events.map((event) => event.errorMessage).filter(Boolean).join(" ");
    throw classifyEmptyAdkResponse(errorMessage);
  }

  const responseDiagnostics = selection.selectedEvent
    ? buildWorkerGeminiResponseDiagnostics({
        event: selection.selectedEvent,
        rawResponseLength: text.length,
        maxOutputTokens: BUILDLOOP_WORKER_GENERATE_CONTENT_CONFIG.maxOutputTokens,
      })
    : undefined;

  return {
    text,
    model,
    latencyMs: 0,
    adkRunnerInvoked: true,
    adkAgentName: agentName,
    ...(responseDiagnostics ? { responseDiagnostics } : {}),
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

type ExtractAdkResponseTextOptions = {
  agentName: string;
  stringifyContent: (event: AdkEvent) => string;
  isFinalResponse: (event: AdkEvent) => boolean;
};

/** Select the authoritative final coding-agent response from ADK events. */
export function selectBuildLoopAdkResponse(
  events: AdkEvent[],
  options: ExtractAdkResponseTextOptions,
): { text: string; selectedEvent?: AdkEvent } {
  for (const event of events) {
    if (event.errorMessage) {
      throw mapAdkEventError(event.errorCode, event.errorMessage);
    }
  }

  const agentEvents = events.filter((event) => event.author === options.agentName);

  let selected: AdkEvent | undefined;
  for (let index = agentEvents.length - 1; index >= 0; index -= 1) {
    const event = agentEvents[index];
    if (event && options.isFinalResponse(event)) {
      selected = event;
      break;
    }
  }

  if (!selected) {
    for (let index = agentEvents.length - 1; index >= 0; index -= 1) {
      const event = agentEvents[index];
      if (event && options.stringifyContent(event).trim()) {
        selected = event;
        break;
      }
    }
  }

  if (!selected) {
    return { text: "" };
  }

  return {
    text: options.stringifyContent(selected).trim(),
    selectedEvent: selected,
  };
}

/** Select the authoritative final coding-agent response text from ADK events. */
export function extractAdkResponseText(
  events: AdkEvent[],
  options: ExtractAdkResponseTextOptions,
): string {
  return selectBuildLoopAdkResponse(events, options).text;
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
