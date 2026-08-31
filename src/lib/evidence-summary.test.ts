import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import {
  buildCheckTechnicalDetails,
  buildEvidenceSummaryViewModel,
  classifyFailure,
  formatCheckTitle,
  formatCheckUserLine,
  isOperationalEvidence,
  resolveCheckKey,
  userFacingFailureExplanation,
} from "@/lib/evidence-summary";
import { evidenceSummaryContainsOnlyRawCommands } from "@/components/site/evidence-summary-panel";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";

function failedTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    workspace: "buildloop-demo",
    goal: PASS_DEMO_GOAL,
    status: "FAILED",
    contract: buildContract(PASS_DEMO_GOAL),
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("FAILED"),
      runnerInvoked: true,
      correctionCount: 2,
      runId: "run-failed",
      evidence: [
        { category: "scope", name: "worker_invocation", status: "pass", summary: "ok" },
        { category: "typecheck", name: "typecheck_bun_run_typecheck", status: "fail", summary: "Command failed: bun run typecheck" },
        { category: "test", name: "test_bun_test", status: "fail", summary: "Command failed: bun test" },
      ],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:02:00.000Z",
    lockedAt: "2026-01-01T00:00:30.000Z",
    projectId: null,
    sourceCommitSha: null,
    ...overrides,
  };
}

describe("evidence summary presentation", () => {
  test("typecheck failure has plain-language EN explanation", () => {
    expect(formatCheckTitle("typecheck", "en")).toBe("Project type check");
    expect(formatCheckUserLine("typecheck", "fail", "en")).toBe(
      "The project did not pass its code type validation.",
    );
  });

  test("test failure has plain-language ID explanation", () => {
    expect(formatCheckTitle("test", "id")).toBe("Pengujian otomatis");
    expect(formatCheckUserLine("test", "fail", "id")).toBe(
      "Satu atau lebih pengujian otomatis tidak berhasil.",
    );
  });

  test("raw command remains available in technical details", () => {
    const rows = failedTask().runnerState!.evidence!;
    const details = buildCheckTechnicalDetails(rows, "en");
    const typecheck = details.find((item) => resolveCheckKey(item.category, item.name) === "typecheck");
    expect(typecheck?.command).toBe("bun run typecheck");
    expect(typecheck?.summary).toContain("Command failed");
  });

  test("raw command is not the only failure explanation", () => {
    const task = failedTask();
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const summary = buildEvidenceSummaryViewModel(task, lifecycle, "en");
    expect(summary).not.toBeNull();
    expect(evidenceSummaryContainsOnlyRawCommands(summary!)).toBe(false);
    expect(summary!.whatFailed.join(" ")).toContain("type validation");
    expect(userFacingFailureExplanation(summary!.technicalDetails)).toContain("automated tests");
  });

  test("correction count appears in user summary", () => {
    const task = failedTask();
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const summary = buildEvidenceSummaryViewModel(task, lifecycle, "en");
    expect(summary?.correctionExplanation).toContain("2");
    expect(summary?.correctionExplanation).toContain("automatic corrections");
  });

  test("no irreversible action statement reflects actual approval state", () => {
    const task = failedTask();
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const summary = buildEvidenceSummaryViewModel(task, lifecycle, "en");
    expect(summary?.remoteActions).toContain("No commit, push, merge, or deployment was performed");
  });

  test("operational failures are not described as implementation failures", () => {
    const task = failedTask({
      runnerState: {
        ...failedTask().runnerState!,
        operationalError: "GEMINI_UNAVAILABLE",
        evidence: [
          {
            category: "scope",
            name: "worker_operational_error",
            status: "fail",
            summary: "Gemini request unavailable",
          },
        ],
      },
    });
    const rows = task.runnerState!.evidence!;
    expect(isOperationalEvidence(rows, task)).toBe(true);
    expect(classifyFailure(task, rows)).toBe("operational");
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const summary = buildEvidenceSummaryViewModel(task, lifecycle, "en");
    expect(summary?.classificationLabel).toContain("System issue");
    expect(summary?.whatFailed.join(" ")).not.toContain("type validation");
    expect(summary?.correctionExplanation).toContain("No automatic correction was attempted");
  });
});
