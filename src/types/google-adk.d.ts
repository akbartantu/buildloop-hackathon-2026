declare module "@google/adk" {
  export class Gemini {
    constructor(options: { model: string });
  }

  export class LlmAgent {
    constructor(options: Record<string, unknown>);
  }

  export class InMemoryRunner {
    constructor(options: { agent: unknown; appName: string });
    runEphemeral(input: {
      userId: string;
      newMessage: { parts: Array<{ text: string }> };
    }): AsyncIterable<{
      errorMessage?: string;
      errorCode?: string;
      output?: unknown;
    }>;
  }

  export function stringifyContent(event: {
    errorMessage?: string;
    errorCode?: string;
    output?: unknown;
  }): string;

  export type Event = {
    errorMessage?: string;
    errorCode?: string;
    output?: unknown;
  };
}
