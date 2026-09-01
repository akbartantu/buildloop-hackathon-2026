import { describe, expect, test } from "bun:test";

import { RuntimeDiagnosticsPanel, runtimeDiagnosticsDisplayKeys } from "@/components/site/runtime-diagnostics-panel";
import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import { buildEvidenceSummaryViewModel } from "@/lib/evidence-summary";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import type { TaskRecord } from "@/lib/tasks-schema";
import {
  assertRuntimeDiagnosticsSafeForDisplay,
  buildRuntimeDiagnosticRows,
  buildRuntimeOperationalExplanation,
  buildWorkerRuntimeDiagnostics,
  sanitizePersistedRuntimeDiagnostics,
} from "@/lib/runtime-diagnostics";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";

function operationalTask(diagnostics: Record<string, unknown>): TaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000011",
    workspace: "buildloop-demo",
    goal: PASS_DEMO_GOAL,
    status: "FAILED",
    contract: buildContract(PASS_DEMO_GOAL),
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("FAILED"),
      runnerInvoked: true,
      operationalError: "GEMINI_MALFORMED",
      runtimeDiagnostics: diagnostics,
      evidence: [
        { category: "scope", name: "worker_operational_error", status: "fail", summary: "Malformed output" },
      ],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:02:00.000Z",
    lockedAt: "2026-01-01T00:00:30.000Z",
    projectId: null,
    sourceCommitSha: null,
  };
}

describe("runtime diagnostics", () => {
  test("MAX_TOKENS diagnostics render correctly", () => {
    const diagnostics = buildWorkerRuntimeDiagnostics({
      model: "gemini-3.6-flash",
      responseDiagnostics: {
        finishReason: "MAX_TOKENS",
        thoughtsTokenCount: 6386,
        candidatesTokenCount: 1790,
        maxOutputTokens: 8192,
        rawResponseLength: 5564,
      },
      stage: "parse_output",
      errorCode: "GEMINI_MALFORMED",
      attemptNumber: 1,
    });
    expect(diagnostics).toBeDefined();

    const rows = buildRuntimeDiagnosticRows(diagnostics!, "en");
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]));

    expect(byKey.provider).toBe("Gemini");
    expect(byKey.model).toBe("gemini-3.6-flash");
    expect(byKey.finishReason).toBe("MAX_TOKENS");
    expect(byKey.thoughtsTokenCount).toBe("6,386");
    expect(byKey.candidatesTokenCount).toBe("1,790");
    expect(byKey.maxOutputTokens).toBe("8,192");
    expect(byKey.rawResponseLength).toBe("5,564");
    expect(byKey.stage).toBe("parse_output");
    expect(byKey.errorCode).toBe("GEMINI_MALFORMED");
    expect(byKey.attempt).toBe("1");
  });

  test("STOP diagnostics render when present", () => {
    const diagnostics = buildWorkerRuntimeDiagnostics({
      model: "gemini-3.6-flash",
      responseDiagnostics: {
        finishReason: "STOP",
        promptTokenCount: 1200,
        candidatesTokenCount: 400,
        totalTokenCount: 1600,
      },
      attemptNumber: 1,
    });
    const rows = buildRuntimeDiagnosticRows(diagnostics!, "en");
    const keys = rows.map((row) => row.key);
    expect(keys).toContain("finishReason");
    expect(rows.find((row) => row.key === "finishReason")?.value).toBe("STOP");
    expect(keys).not.toContain("prompt" as never);
  });

  test("missing diagnostics do not break old runs", () => {
    const task: TaskRecord = {
      id: "00000000-0000-4000-8000-000000000012",
      workspace: "buildloop-demo",
      goal: PASS_DEMO_GOAL,
      status: "PASS",
      contract: buildContract(PASS_DEMO_GOAL),
      blockedReasons: [],
      runnerState: {
        ...zeroChangeRunnerState("PASS"),
        runnerInvoked: true,
        evidence: [{ category: "scope", name: "worker_invocation", status: "pass", summary: "ok" }],
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
      lockedAt: "2026-01-01T00:00:30.000Z",
      projectId: null,
      sourceCommitSha: null,
    };
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const summary = buildEvidenceSummaryViewModel(task, lifecycle, "en");
    expect(summary).not.toBeNull();
    expect(summary!.runtimeDiagnostics).toBeNull();
    expect(summary!.runtimeFailureExplanation).toBeNull();
    expect(summary!.headline).toBe("Task completed successfully");
  });

  test("only whitelisted fields are rendered", () => {
    const sanitized = sanitizePersistedRuntimeDiagnostics({
      provider: "Gemini",
      model: "gemini-3.6-flash",
      finishReason: "MAX_TOKENS",
      promptTokenCount: 100,
      secretField: "should-not-appear",
      rawResponse: "{ \"summary\": \"hidden\" }",
      systemInstruction: "hidden",
    });
    expect(sanitized).toBeDefined();
    const keys = runtimeDiagnosticsDisplayKeys(sanitized!, "en");
    expect(keys).toEqual(
      expect.arrayContaining(["provider", "model", "finishReason", "promptTokenCount"]),
    );
    expect(keys).not.toContain("secretField");
    expect(keys).not.toContain("rawResponse");
    expect(keys).not.toContain("systemInstruction");
  });

  test("prompt, raw response, and secrets cannot be rendered through diagnostics", () => {
    const unsafePersisted = {
      provider: "Gemini",
      model: "gemini-3.6-flash",
      prompt: "system: you are a coder",
      rawResponse: '{"changedFiles":[{"path":"src/a.ts","content":"secret"}]}',
      api_key: "sk-test",
      authorization: "Bearer secret",
    };
    const sanitized = sanitizePersistedRuntimeDiagnostics(unsafePersisted);
    expect(sanitized).toBeDefined();
    assertRuntimeDiagnosticsSafeForDisplay(sanitized!);
    const serialized = JSON.stringify(buildRuntimeDiagnosticRows(sanitized!, "en"));
    expect(serialized.toLowerCase()).not.toContain("sk-test");
    expect(serialized.toLowerCase()).not.toContain("bearer");
    expect(serialized.toLowerCase()).not.toContain("you are a coder");
    expect(serialized.toLowerCase()).not.toContain("changedfiles");
  });

  test("operational failure copy is correct for MAX_TOKENS", () => {
    const diagnostics = buildWorkerRuntimeDiagnostics({
      model: "gemini-3.6-flash",
      responseDiagnostics: { finishReason: "MAX_TOKENS", maxOutputTokens: 8192 },
      stage: "parse_output",
      errorCode: "GEMINI_MALFORMED",
      attemptNumber: 1,
    });
    const explanation = buildRuntimeOperationalExplanation(diagnostics, "en");
    expect(explanation).toContain("output budget was exhausted");
    expect(explanation).toContain("No files were applied");
  });

  test("operational failure explanation appears in evidence summary only for operational failures", () => {
    const task = operationalTask({
      provider: "Gemini",
      finishReason: "MAX_TOKENS",
      stage: "parse_output",
      errorCode: "GEMINI_MALFORMED",
      maxOutputTokens: 8192,
    });
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const summary = buildEvidenceSummaryViewModel(task, lifecycle, "en");
    expect(summary?.runtimeFailureExplanation).toContain("output budget was exhausted");
  });

  test("semantic failures do not show provider operational explanation", () => {
    const task: TaskRecord = {
      id: "00000000-0000-4000-8000-000000000013",
      workspace: "buildloop-demo",
      goal: PASS_DEMO_GOAL,
      status: "FAILED",
      contract: buildContract(PASS_DEMO_GOAL),
      blockedReasons: [],
      runnerState: {
        ...zeroChangeRunnerState("FAILED"),
        runnerInvoked: true,
        runtimeDiagnostics: {
          provider: "Gemini",
          finishReason: "STOP",
          model: "gemini-3.6-flash",
        },
        evidence: [
          { category: "typecheck", name: "typecheck_bun_run_typecheck", status: "fail", summary: "Command failed: bun run typecheck" },
        ],
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
      lockedAt: "2026-01-01T00:00:30.000Z",
      projectId: null,
      sourceCommitSha: null,
    };
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const summary = buildEvidenceSummaryViewModel(task, lifecycle, "en");
    expect(summary?.runtimeFailureExplanation).toBeNull();
    expect(summary?.runtimeDiagnostics?.finishReason).toBe("STOP");
  });

  test("PASS evidence summary stays unchanged apart from optional diagnostics", () => {
    const without = operationalTask({});
    without.status = "PASS";
    without.runnerState = {
      ...zeroChangeRunnerState("PASS"),
      runnerInvoked: true,
      evidence: [{ category: "scope", name: "worker_invocation", status: "pass", summary: "ok" }],
    };

    const withDiagnostics = {
      ...without,
      runnerState: {
        ...without.runnerState!,
        runtimeDiagnostics: {
          provider: "Gemini",
          model: "gemini-3.6-flash",
          finishReason: "STOP",
          totalTokenCount: 900,
        },
      },
    };

    const lifecycleWithout = buildTaskLifecycleViewModel(without, "en");
    const lifecycleWith = buildTaskLifecycleViewModel(withDiagnostics, "en");
    const summaryWithout = buildEvidenceSummaryViewModel(without, lifecycleWithout, "en");
    const summaryWith = buildEvidenceSummaryViewModel(withDiagnostics, lifecycleWith, "en");

    expect(summaryWithout?.headline).toBe(summaryWith?.headline);
    expect(summaryWithout?.whatPassed).toEqual(summaryWith?.whatPassed);
    expect(summaryWithout?.whatFailed).toEqual(summaryWith?.whatFailed);
    expect(summaryWith?.runtimeDiagnostics?.finishReason).toBe("STOP");
  });

  test("RuntimeDiagnosticsPanel omits empty rows", () => {
    const diagnostics = buildWorkerRuntimeDiagnostics({
      model: "gemini-3.6-flash",
      responseDiagnostics: { finishReason: "STOP" },
    });
    expect(diagnostics).toBeDefined();
    const element = RuntimeDiagnosticsPanel({ diagnostics: diagnostics!, locale: "en" });
    expect(element).not.toBeNull();
    const rows = buildRuntimeDiagnosticRows(diagnostics!, "en");
    expect(rows.every((row) => row.value.length > 0)).toBe(true);
  });
});
