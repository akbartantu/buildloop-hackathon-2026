import { describe, expect, test } from "bun:test";

import { parseWorkerStructuredOutput } from "../gemini/client";
import { GeminiClientError } from "../gemini/errors";
import { extractAdkResponseText } from "./runner";
import { BUILDLOOP_WORKER_AGENT_NAME } from "./worker-agent-config";

type MockAdkEvent = {
  author?: string;
  text?: string;
  isFinal?: boolean;
  output?: unknown;
  errorMessage?: string;
  errorCode?: string;
};

function mockStringifyContent(event: MockAdkEvent): string {
  return event.text ?? "";
}

function mockIsFinalResponse(event: MockAdkEvent): boolean {
  return event.isFinal === true;
}

function extract(events: MockAdkEvent[]): string {
  return extractAdkResponseText(events, {
    agentName: BUILDLOOP_WORKER_AGENT_NAME,
    stringifyContent: mockStringifyContent,
    isFinalResponse: mockIsFinalResponse,
  });
}

const validWorkerJson = JSON.stringify({
  summary: "Added prototype pages.",
  changedFiles: [
    { path: "prototype/index.html", content: "<html></html>" },
    { path: "prototype/styles.css", content: "body { margin: 0; }" },
  ],
});

const alternateFinalJson = JSON.stringify({
  summary: "Final response.",
  changedFiles: [{ path: "prototype/index.html", content: "<html></html>" }],
});

describe("extractAdkResponseText", () => {
  test("selects a single final coding-worker event", () => {
    const text = extract([
      {
        author: BUILDLOOP_WORKER_AGENT_NAME,
        text: validWorkerJson,
        isFinal: true,
      },
    ]);

    expect(text).toBe(validWorkerJson);
    expect(() => parseWorkerStructuredOutput(text)).not.toThrow();
  });

  test("selects only the last final response among multiple agent events", () => {
    const text = extract([
      {
        author: BUILDLOOP_WORKER_AGENT_NAME,
        text: JSON.stringify({ summary: "first", changedFiles: [] }),
        isFinal: true,
      },
      {
        author: BUILDLOOP_WORKER_AGENT_NAME,
        text: alternateFinalJson,
        isFinal: true,
      },
    ]);

    expect(text).toBe(alternateFinalJson);
    expect(JSON.parse(text).summary).toBe("Final response.");
  });

  test("ignores user and system events when a final agent event exists", () => {
    const text = extract([
      {
        author: "user",
        text: JSON.stringify({ goal: "Create prototype files only.", attemptNumber: 1 }),
        isFinal: true,
      },
      {
        author: "system",
        text: "system preamble",
        isFinal: true,
      },
      {
        author: BUILDLOOP_WORKER_AGENT_NAME,
        text: validWorkerJson,
        isFinal: true,
      },
    ]);

    expect(text).toBe(validWorkerJson);
    expect(() => parseWorkerStructuredOutput(text)).not.toThrow();
  });

  test("does not concatenate two JSON agent events", () => {
    const first = JSON.stringify({ summary: "first", changedFiles: [] });
    const second = JSON.stringify({ summary: "second", changedFiles: [] });

    const text = extract([
      {
        author: BUILDLOOP_WORKER_AGENT_NAME,
        text: first,
        isFinal: false,
      },
      {
        author: BUILDLOOP_WORKER_AGENT_NAME,
        text: second,
        isFinal: true,
      },
    ]);

    expect(text).toBe(second);
    expect(text).not.toContain('"summary":"first"');
    expect(() => JSON.parse(text)).not.toThrow();
  });

  test("selects final agent event over earlier partial or intermediate agent events", () => {
    const text = extract([
      {
        author: BUILDLOOP_WORKER_AGENT_NAME,
        text: '{"summary":"partial","changedFiles":[',
        isFinal: false,
      },
      {
        author: BUILDLOOP_WORKER_AGENT_NAME,
        text: validWorkerJson,
        isFinal: true,
      },
    ]);

    expect(text).toBe(validWorkerJson);
    expect(() => parseWorkerStructuredOutput(text)).not.toThrow();
  });

  test("falls back to the last agent-authored non-empty event when no final response exists", () => {
    const fallbackJson = JSON.stringify({
      summary: "Fallback agent text.",
      changedFiles: [{ path: "prototype/index.html", content: "<html></html>" }],
    });

    const text = extract([
      {
        author: BUILDLOOP_WORKER_AGENT_NAME,
        text: '{"summary":"older","changedFiles":[]}',
        isFinal: false,
      },
      {
        author: BUILDLOOP_WORKER_AGENT_NAME,
        text: fallbackJson,
        isFinal: false,
      },
    ]);

    expect(text).toBe(fallbackJson);
  });

  test("returns empty text when no usable agent-authored content exists", () => {
    expect(
      extract([
        { author: "user", text: "contract payload", isFinal: true },
        { author: BUILDLOOP_WORKER_AGENT_NAME, text: "   ", isFinal: false },
      ]),
    ).toBe("");
  });

  test("does not append event.output for the normal coding-worker path", () => {
    const text = extract([
      {
        author: BUILDLOOP_WORKER_AGENT_NAME,
        text: validWorkerJson,
        isFinal: true,
        output: JSON.stringify({ summary: "corrupt", changedFiles: [] }),
      },
    ]);

    expect(text).toBe(validWorkerJson);
    expect(text).not.toContain("corrupt");
    expect(() => parseWorkerStructuredOutput(text)).not.toThrow();
  });

  test("still throws mapped operational errors from any event", () => {
    expect(() =>
      extract([
        {
          author: BUILDLOOP_WORKER_AGENT_NAME,
          text: validWorkerJson,
          isFinal: true,
        },
        {
          author: BUILDLOOP_WORKER_AGENT_NAME,
          errorCode: "ADK_OPERATIONAL_FAILURE",
          errorMessage: "HTTP 503 upstream unavailable",
        },
      ]),
    ).toThrow(GeminiClientError);
  });
});
