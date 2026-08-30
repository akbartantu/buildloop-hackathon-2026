import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";
import {
  analyzeChecks,
  buildTaskLifecycleViewModel,
  deliveryActionLabel,
  taskHasRun,
} from "@/lib/task-lifecycle";
import { applyHumanApproval } from "@/lib/human-approval";
import { executionApprovalGrantsCommit } from "@/orchestrator/approval/model";
import { createApprovalRequest } from "@/orchestrator/approval/model";

function baseTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  const contract = buildContract(PASS_DEMO_GOAL);
  return {
    id: "00000000-0000-4000-8000-000000000001",
    workspace: "buildloop-demo",
    goal: PASS_DEMO_GOAL,
    status: "AWAITING_APPROVAL",
    contract,
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("PASS"),
      runnerInvoked: true,
      filesChanged: 1,
      runId: "run-1",
      correctionCount: 1,
      evidence: [
        { category: "preflight", name: "policy", status: "pass", summary: "ok" },
        { category: "acceptance", name: "a", status: "pass", summary: "ok" },
        { category: "scope", name: "scope_skip", status: "skipped", summary: "n/a" },
      ],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("task lifecycle projection", () => {
  test("I6 CLOSED task with run is not shown as orchestrator not started", () => {
    const approved = applyHumanApproval({
      task: {
        status: "AWAITING_APPROVAL",
        contract: buildContract(PASS_DEMO_GOAL),
        runnerState: {
          ...zeroChangeRunnerState("PASS"),
          runnerInvoked: true,
          runId: "run-1",
          correctionCount: 1,
          evidence: [{ category: "check", name: "x", status: "pass", summary: "ok" }],
        },
      },
      decision: "APPROVE_COMMIT",
      action: "COMMIT",
      actorUserId: "user-1",
    });

    const task = baseTask({
      status: approved.status,
      runnerState: approved.runnerState,
    });
    const vm = buildTaskLifecycleViewModel(task);

    expect(taskHasRun(task)).toBe(true);
    expect(vm.showOrchestratorNotStarted).toBe(false);
    expect(vm.hasRun).toBe(true);
    expect(vm.runCompleted).toBe(true);
  });

  test("I8 worker attempt vs correction count use distinct semantics", () => {
    const task = baseTask({
      runnerState: {
        ...zeroChangeRunnerState("PASS"),
        runnerInvoked: true,
        correctionCount: 1,
        evidence: [],
      },
    });
    const vm = buildTaskLifecycleViewModel(task);
    expect(vm.workerAttemptNumber).toBe(2);
    expect(vm.correctionsUsed).toBe(1);
    expect(vm.correctionLimit).toBe(2);
  });

  test("I3 all required satisfied allows PASS with skipped optional check", () => {
    const task = baseTask({
      runnerState: {
        ...zeroChangeRunnerState("PASS"),
        runnerInvoked: true,
        correctionCount: 0,
        evidence: [
          { category: "a", name: "one", status: "pass", summary: "ok" },
          { category: "b", name: "two", status: "pass", summary: "ok" },
          { category: "c", name: "three", status: "skipped", summary: "optional" },
        ],
      },
    });
    const checks = analyzeChecks(task);
    const vm = buildTaskLifecycleViewModel(task);

    expect(checks.allRequiredSatisfied).toBe(true);
    expect(checks.skipped).toBe(1);
    expect(vm.implementationVerdict).toBe("PASS");
    expect(checks.friendlySummary).toContain("tidak perlu dijalankan");
  });

  test("I1 failed required check prevents PASS verdict", () => {
    const task = baseTask({
      status: "AWAITING_APPROVAL",
      runnerState: {
        ...zeroChangeRunnerState("note"),
        runnerInvoked: true,
        evidence: [
          { category: "a", name: "one", status: "pass", summary: "ok" },
          { category: "b", name: "two", status: "fail", summary: "bad" },
        ],
      },
    });
    const vm = buildTaskLifecycleViewModel(task);
    expect(vm.implementationVerdict).toBeNull();
    expect(analyzeChecks(task).allRequiredSatisfied).toBe(false);
  });

  test("I4 approved commit is not executed commit", () => {
    const task = baseTask({
      status: "CLOSED",
      runnerState: {
        ...zeroChangeRunnerState("PASS"),
        runnerInvoked: true,
        commitApproved: true,
        commit: false,
        push: false,
        correctionCount: 1,
        evidence: [{ category: "a", name: "x", status: "pass", summary: "ok" }],
      },
    });
    const vm = buildTaskLifecycleViewModel(task);
    expect(vm.delivery.commit).toBe("APPROVED");
    expect(vm.deliveryLabels.commit).toContain("belum dijalankan");
  });

  test("I5 commit approval does not grant push", () => {
    const task = baseTask({
      status: "CLOSED",
      runnerState: {
        ...zeroChangeRunnerState("PASS"),
        runnerInvoked: true,
        commitApproved: true,
        commit: false,
        push: false,
      },
    });
    const vm = buildTaskLifecycleViewModel(task);
    expect(vm.delivery.push).toBe("NOT_APPROVED");
    expect(vm.delivery.merge).toBe("NOT_APPROVED");
    expect(vm.delivery.deploy).toBe("NOT_APPROVED");
  });

  test("I9 cross-page consistency for completed PASS with approval", () => {
    const task = baseTask({
      status: "CLOSED",
      runnerState: {
        ...zeroChangeRunnerState("PASS demo"),
        runnerInvoked: true,
        runId: "run-abc",
        correctionCount: 1,
        commitApproved: true,
        commit: false,
        evidence: [
          { category: "preflight", name: "p", status: "pass", summary: "ok" },
          { category: "acceptance", name: "a", status: "pass", summary: "ok" },
          { category: "scope", name: "s", status: "skipped", summary: "skip" },
        ],
        decisionLog: [
          { rule: "CHECKS_PASSED", summary: "PASS", nextStatus: "AWAITING_APPROVAL", verdict: "PASS" },
          { rule: "human_gate", summary: "approved", nextStatus: "CLOSED", verdict: "APPROVE_COMMIT" },
        ],
      },
    });
    const vm = buildTaskLifecycleViewModel(task);

    expect(vm.implementationVerdict).toBe("PASS");
    expect(vm.executionCompleteLabel).toBe("Eksekusi task selesai");
    expect(vm.orchestrationSteps.find((s) => s.key === "decision")?.state).toBe("complete");
    expect(vm.orchestrationSteps.find((s) => s.key === "correction")?.state).toBe("complete");
    expect(vm.showOrchestratorNotStarted).toBe(false);
    expect(vm.plainLanguageSummary).toContain("Git commit belum dijalankan");
  });

  test("I10 execution approval does not grant commit", () => {
    const request = createApprovalRequest({
      id: crypto.randomUUID(),
      runId: "run-1",
      action: "execute",
      requestedBy: "test",
      impactSummary: "run",
    });
    expect(
      executionApprovalGrantsCommit({
        ...request,
        status: "approved",
        decidedBy: "u",
        decidedAt: new Date().toISOString(),
        decisionReason: "ok",
      }),
    ).toBe(false);
  });

  test("correction step shows not_needed when no correction used", () => {
    const task = baseTask({
      status: "CLOSED",
      runnerState: {
        ...zeroChangeRunnerState("PASS"),
        runnerInvoked: true,
        correctionCount: 0,
        commitApproved: true,
        evidence: [{ category: "a", name: "x", status: "pass", summary: "ok" }],
      },
    });
    const vm = buildTaskLifecycleViewModel(task);
    expect(vm.orchestrationSteps.find((s) => s.key === "correction")?.state).toBe("not_needed");
  });

  test("deliveryActionLabel covers approved-not-executed copy", () => {
    expect(deliveryActionLabel("APPROVED", "Commit")).toBe("Commit disetujui, belum dijalankan");
  });
});

describe("lifecycle invariants blocked preflight", () => {
  test("blocked preflight marks downstream as not run", () => {
    const task = baseTask({
      status: "BLOCKED",
      blockedReasons: [
        {
          rule: "GIT_WRITE",
          matchedText: "commit",
          explanation: "blocked",
          protectedTarget: "git",
        },
      ],
      runnerState: zeroChangeRunnerState("blocked"),
    });
    const vm = buildTaskLifecycleViewModel(task);
    expect(vm.implementationVerdict).toBe("BLOCKED");
    expect(vm.orchestrationSteps.find((s) => s.key === "preflight")?.state).toBe("blocked");
    expect(vm.orchestrationSteps.find((s) => s.key === "worker")?.state).toBe("not_run");
  });
});
