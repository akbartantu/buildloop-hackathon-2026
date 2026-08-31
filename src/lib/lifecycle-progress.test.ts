import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import {
  buildRunProgressViewModel,
  containsFakePercentageProgress,
  formatDuration,
  formatProgressStepStatus,
  isTerminalPollBoundary,
  mapStepToVisualState,
  shouldPollTaskStatus,
  RUN_ACTIVITY_DELAY_THRESHOLD_MS,
} from "@/lib/lifecycle-progress";
import { progressPanelContainsFakePercentage } from "@/components/site/lifecycle-progress-panel";

function baseTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    workspace: "buildloop-demo",
    goal: "Update README subtitle",
    status: "RUNNING",
    contract: buildContract("Update README subtitle"),
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("running"),
      runnerInvoked: true,
      correctionCount: 0,
      runId: "run-1",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    lockedAt: "2026-01-01T00:00:30.000Z",
    projectId: null,
    sourceCommitSha: null,
    ...overrides,
  };
}

describe("lifecycle progress presentation", () => {
  test("current active lifecycle phase is visible", () => {
    const vm = buildTaskLifecycleViewModel(baseTask({ status: "CHECKING" }), "en");
    const active = vm.progress.steps.filter((step) => step.visualState === "active");
    expect(active.some((step) => step.key === "checker")).toBe(true);
    expect(vm.progress.componentActivity?.checker).toContain("Running");
  });

  test("INSPECTING marks preflight active instead of all downstream complete", () => {
    const vm = buildTaskLifecycleViewModel(
      baseTask({
        status: "INSPECTING",
        runnerState: {
          ...zeroChangeRunnerState("preflight"),
          runnerInvoked: false,
          runId: "run-1",
        },
      }),
      "en",
    );
    const preflight = vm.progress.steps.find((step) => step.key === "preflight");
    const worker = vm.progress.steps.find((step) => step.key === "worker");
    expect(preflight?.visualState).toBe("active");
    expect(worker?.visualState).toBe("waiting");
  });

  test("completed waiting skipped blocked states render correctly", () => {
    expect(mapStepToVisualState("complete")).toBe("completed");
    expect(mapStepToVisualState("not_run")).toBe("waiting");
    expect(mapStepToVisualState("not_needed")).toBe("skipped");
    expect(mapStepToVisualState("blocked")).toBe("blocked");
    expect(formatProgressStepStatus("waiting", "en")).toBe("Waiting");
    expect(formatProgressStepStatus("skipped", "id")).toBe("Tidak diperlukan");
  });

  test("no fake percentage progress is rendered", () => {
    const vm = buildTaskLifecycleViewModel(baseTask(), "en");
    expect(containsFakePercentageProgress(JSON.stringify(vm.progress))).toBe(false);
    expect(progressPanelContainsFakePercentage(vm.progress)).toBe(false);
    expect(containsFakePercentageProgress("Running · 65% complete")).toBe(true);
  });

  test("corrections display as x / max in run summary", () => {
    const now = Date.parse("2026-01-01T00:02:24.000Z");
    const progress = buildRunProgressViewModel(
      baseTask({ status: "RUNNING" }),
      buildTaskLifecycleViewModel(baseTask({ status: "RUNNING" }), "en").orchestrationSteps,
      "en",
      now,
      0,
      2,
    );
    expect(progress.runSummary).toContain("0/2");
    expect(formatDuration(84_000)).toBe("1m 24s");
  });

  test("polling performs read-only status refresh eligibility", () => {
    expect(shouldPollTaskStatus("RUNNING")).toBe(true);
    expect(shouldPollTaskStatus("CHECKING")).toBe(true);
    expect(isTerminalPollBoundary("PASS")).toBe(true);
    expect(isTerminalPollBoundary("FAILED")).toBe(true);
    expect(isTerminalPollBoundary("BLOCKED")).toBe(true);
    expect(isTerminalPollBoundary("AWAITING_APPROVAL")).toBe(true);
    expect(shouldPollTaskStatus("PASS")).toBe(false);
  });

  test("delayed-run warning does not mutate run state", () => {
    const staleUpdatedAt = new Date(Date.now() - RUN_ACTIVITY_DELAY_THRESHOLD_MS - 5_000).toISOString();
    const before = baseTask({
      status: "RUNNING",
      updatedAt: staleUpdatedAt,
    });
    const progress = buildRunProgressViewModel(
      before,
      buildTaskLifecycleViewModel(before, "en").orchestrationSteps,
      "en",
    );
    expect(progress.delayedWarning).toContain("delayed");
    expect(before.status).toBe("RUNNING");
    expect(before.runnerState?.correctionCount ?? 0).toBe(0);
  });

  test("English and Indonesian progress copy resolve correctly", () => {
    const recent = new Date().toISOString();
    const enVm = buildTaskLifecycleViewModel(
      baseTask({ status: "RUNNING", updatedAt: recent }),
      "en",
    );
    const idVm = buildTaskLifecycleViewModel(
      baseTask({ status: "RUNNING", updatedAt: recent }),
      "id",
    );
    expect(enVm.progress.longRunningMessage).toContain("Still working");
    expect(idVm.progress.longRunningMessage).toContain("Proses masih berjalan");
    expect(enVm.progress.componentActivity?.worker).toContain("Worker — Running");
    expect(idVm.progress.componentActivity?.worker).toContain("Worker — Berjalan");
  });
});
