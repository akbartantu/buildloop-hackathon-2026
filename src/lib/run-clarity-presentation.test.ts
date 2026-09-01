import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import type { TaskRecord } from "@/lib/tasks-schema";
import {
  buildHumanGatedDeliveryStrip,
  buildSafetyGuarantees,
  deliveryStripImpliesUnexecutedGitActions,
  shouldShowHumanGatedDeliveryStrip,
} from "@/lib/run-clarity-presentation";
import { lifecycleStageVisualStates } from "@/components/site/lifecycle-progress-panel";
import {
  deliveryStripStepKeys,
  deliveryStripUsesCompactDesktopLayout,
  deliveryStripUsesSingleContinuousRow,
  humanGatedDeliveryStripUsesExternalHeadingOnly,
} from "@/components/site/human-gated-delivery-strip";
import { buildEvidenceSummaryViewModel } from "@/lib/evidence-summary";
import { runtimeDiagnosticsDisplayKeys } from "@/components/site/runtime-diagnostics-panel";
import { sanitizePersistedRuntimeDiagnostics } from "@/lib/runtime-diagnostics";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";

function passTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    workspace: "buildloop-demo",
    goal: PASS_DEMO_GOAL,
    status: "AWAITING_APPROVAL",
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
    ...overrides,
  };
}

describe("run clarity presentation", () => {
  test("lifecycle stages render correct statuses for RUNNING and CHECKING", () => {
    const running = buildTaskLifecycleViewModel(passTask({ status: "RUNNING" }), "en");
    const checking = buildTaskLifecycleViewModel(passTask({ status: "CHECKING" }), "en");
    const runningStates = lifecycleStageVisualStates(running.progress);
    const checkingStates = lifecycleStageVisualStates(checking.progress);

    expect(runningStates).toContain("active");
    expect(runningStates).toContain("waiting");
    expect(checkingStates.some((state) => state === "active" || state === "completed")).toBe(true);
  });

  test("PASS FAILED BLOCKED and skipped states are distinguishable", () => {
    const passVm = buildTaskLifecycleViewModel(passTask(), "en");
    const failedVm = buildTaskLifecycleViewModel(
      passTask({
        status: "FAILED",
        runnerState: {
          ...passTask().runnerState!,
          evidence: [{ category: "test", name: "test_bun_test", status: "fail", summary: "fail" }],
        },
      }),
      "en",
    );
    const blockedVm = buildTaskLifecycleViewModel(passTask({ status: "BLOCKED", blockedReasons: ["SCOPE"] }), "en");

    expect(passVm.progress.steps.some((step) => step.visualState === "completed")).toBe(true);
    expect(failedVm.progress.steps.some((step) => step.visualState === "failed")).toBe(true);
    expect(blockedVm.progress.steps.some((step) => step.visualState === "blocked")).toBe(true);
    expect(
      passVm.progress.steps.some(
        (step) => step.key === "correction" && step.visualState === "skipped",
      ),
    ).toBe(true);
  });

  test("safety guarantees use actual approval and action state", () => {
    const awaiting = buildTaskLifecycleViewModel(passTask(), "en");
    const guarantees = buildSafetyGuarantees(awaiting, "en");
    expect(guarantees.map((row) => row.label)).toEqual([
      "No Git commit executed",
      "No Push executed",
      "No Merge executed",
      "No Deploy executed",
    ]);

    const executed = buildTaskLifecycleViewModel(
      passTask({
        status: "CLOSED",
        runnerState: {
          ...passTask().runnerState!,
          commit: true,
          push: true,
        },
      }),
      "en",
    );
    const executedGuarantees = buildSafetyGuarantees(executed, "en");
    expect(executedGuarantees[0]?.label).toBe("Git commit executed");
    expect(executedGuarantees[1]?.label).toBe("Push executed");
  });

  test("commit approved but not executed copy is correct", () => {
    const task = passTask({
      status: "CLOSED",
      runnerState: {
        ...passTask().runnerState!,
        runId: "run-pass",
        commitApproved: true,
        humanApprovals: [
          {
            decision: "APPROVE_COMMIT",
            action: "COMMIT",
            actorUserId: "user-1",
            runId: "run-pass",
            note: null,
            createdAt: "2026-01-01T00:03:00.000Z",
          },
        ],
      },
    });
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const guarantees = buildSafetyGuarantees(lifecycle, "en");
    expect(guarantees[0]?.label).toBe("Git commit approved, not executed");
  });

  test("human-gated delivery strip does not imply execution on PASS awaiting approval", () => {
    const task = passTask();
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const strip = buildHumanGatedDeliveryStrip(task, lifecycle, "en");
    expect(deliveryStripStepKeys(strip)).toEqual([
      "task",
      "approval",
      "worker",
      "checker",
      "verdict",
      "delivery",
    ]);
    expect(strip.find((step) => step.key === "delivery")?.statusLabel).toContain("human-gated");
    expect(deliveryStripImpliesUnexecutedGitActions(strip)).toBe(true);
  });

  test("human-gated delivery strip uses external heading only and compact desktop layout", () => {
    expect(humanGatedDeliveryStripUsesExternalHeadingOnly()).toBe(true);
    expect(deliveryStripUsesSingleContinuousRow()).toBe(true);
    expect(deliveryStripUsesCompactDesktopLayout()).toBe(true);
  });

  test("old runs without runtime diagnostics still render evidence summary", () => {
    const task = passTask();
    delete task.runnerState!.runtimeDiagnostics;
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const summary = buildEvidenceSummaryViewModel(task, lifecycle, "en");
    expect(summary?.runtimeDiagnostics).toBeNull();
    expect(summary?.headline).toBeTruthy();
  });

  test("runtime diagnostics render only whitelisted fields", () => {
    const sanitized = sanitizePersistedRuntimeDiagnostics({
      provider: "Gemini",
      model: "gemini-3.6-flash",
      finishReason: "STOP",
      prompt: "hidden",
      rawResponse: "hidden",
    });
    const keys = runtimeDiagnosticsDisplayKeys(sanitized!, "en");
    expect(keys).not.toContain("prompt");
    expect(keys).not.toContain("rawResponse");
    expect(keys).toContain("provider");
  });

  test("delivery strip appears only for pass-like completed runs", () => {
    const passLike = buildTaskLifecycleViewModel(passTask(), "en");
    const running = buildTaskLifecycleViewModel(passTask({ status: "RUNNING" }), "en");
    expect(shouldShowHumanGatedDeliveryStrip(passLike)).toBe(true);
    expect(shouldShowHumanGatedDeliveryStrip(running)).toBe(false);
  });
});
