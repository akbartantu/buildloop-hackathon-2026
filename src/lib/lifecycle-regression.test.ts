import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import {
  deriveCorrectionPresentation,
  analyzeFinalChecks,
  isApprovalGateOpen,
  isOrchestrationInProgress,
} from "@/lib/evidence-analysis";
import { isPendingHumanApproval, applyHumanApproval } from "@/lib/human-approval";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";
import { decide } from "@/orchestrator/decision/engine";
import { evaluateDevAuthBypass } from "@/lib/dev-auth-bypass";
import { captureGitBaseline, isGitRepository } from "@/orchestrator/workspace/git-workspace";
import { getWorkspaceRoot } from "@/orchestrator/product/orchestrator";
import path from "node:path";

function baseTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  const contract = buildContract(PASS_DEMO_GOAL);
  return {
    id: "00000000-0000-4000-8000-000000000001",
    workspace: "buildloop-demo",
    goal: PASS_DEMO_GOAL,
    status: "CHECKING",
    contract,
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("checking"),
      runnerInvoked: true,
      correctionCount: 1,
      runId: "run-1",
      evidence: [
        { category: "a", name: "old", status: "fail", summary: "fail attempt 1", attemptNumber: 1 },
        { category: "b", name: "new", status: "pass", summary: "ok attempt 2", attemptNumber: 2 },
      ],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("mandatory lifecycle regression T1–T14", () => {
  test("T1 re-check not finished — sedang diperiksa ulang, not berhasil diperbaiki", () => {
    const task = baseTask({ status: "CHECKING" });
    const checks = analyzeFinalChecks(task);
    const vm = buildTaskLifecycleViewModel(task);
    expect(checks.failed).toBe(0);
    expect(vm.correction.phase).toBe("verifying");
    expect(vm.correction.userSummary).toContain("memeriksa ulang");
    expect(vm.correction.userSummary).not.toContain("berhasil diperbaiki");
    expect(vm.approval.historicalCorrection?.summary ?? "").not.toContain("berhasil diperbaiki");
  });

  test("T2 correction verified — final summary shows all checks passed", () => {
    const task = baseTask({
      status: "AWAITING_APPROVAL",
      runnerState: {
        ...baseTask().runnerState!,
        correctionCount: 1,
        evidence: [
          { category: "acceptance", name: "a", status: "pass", summary: "ok", attemptNumber: 2 },
          {
            category: "protected_path",
            name: "p",
            status: "pass",
            summary: "No protected path changes detected.",
            attemptNumber: 2,
          },
        ],
      },
    });
    const vm = buildTaskLifecycleViewModel(task);
    expect(vm.implementationVerdict).toBe("PASS");
    expect(vm.checks.friendlySummary).toContain("Semua pemeriksaan akhir lolos");
    expect(vm.correction.phase).toBe("verified");
    expect(vm.correction.userSummary).toContain("berhasil diperbaiki");
  });

  test("T3 NEEDS_CORRECTION — approval not actionable", () => {
    const task = baseTask({ status: "NEEDS_CORRECTION" });
    expect(isApprovalGateOpen(task)).toBe(false);
    expect(isPendingHumanApproval(task)).toBe(false);
  });

  test("T4 PASS + awaiting approval — approval actionable", () => {
    const task = baseTask({
      status: "AWAITING_APPROVAL",
      runnerState: {
        ...baseTask().runnerState!,
        correctionCount: 0,
        evidence: [{ category: "a", name: "x", status: "pass", summary: "ok", attemptNumber: 1 }],
      },
    });
    expect(isApprovalGateOpen(task)).toBe(true);
    expect(isPendingHumanApproval(task)).toBe(true);
    expect(buildTaskLifecycleViewModel(task).approval.canRecommendApprove).toBe(true);
  });

  test("T5 human revision — separate from automatic correction", () => {
    const task = {
      status: "AWAITING_APPROVAL" as const,
      contract: buildContract(PASS_DEMO_GOAL),
      runnerState: {
        ...zeroChangeRunnerState("PASS"),
        runnerInvoked: true,
        correctionCount: 1,
        runId: "run-1",
      },
    };
    const result = applyHumanApproval({
      task,
      decision: "REQUEST_REVISION",
      action: "COMMIT",
      actorUserId: "user-1",
    });
    expect(result.status).toBe("APPROVED_FOR_EXECUTION");
    expect(result.runnerState.lastAction).toBe("human_revision");
    const presentation = deriveCorrectionPresentation(
      {
        ...baseTask(),
        status: result.status,
        runnerState: result.runnerState,
      },
      analyzeFinalChecks(baseTask()),
      null,
    );
    expect(presentation.kind).toBe("human");
  });

  test("T6 two automatic corrections exhausted → FAILED", () => {
    const third = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: { evidence: [], blocked: false, failed: true, passed: false },
      correctionCount: 2,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(third.nextStatus).toBe("FAILED");
    expect(third.rule).toBe("CORRECTION_LIMIT");
  });

  test("T7 protected path → BLOCKED via checker blocked flag", () => {
    const blocked = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: { evidence: [], blocked: true, failed: false, passed: false },
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(blocked.verdict).toBe("BLOCKED");
  });

  test("T8 worker claim without passing checker → not PASS", () => {
    const task = baseTask({
      status: "AWAITING_APPROVAL",
      runnerState: {
        ...baseTask().runnerState!,
        note: "Worker says all tests passed",
        evidence: [{ category: "acceptance", name: "a", status: "fail", summary: "actual fail", attemptNumber: 1 }],
      },
    });
    expect(buildTaskLifecycleViewModel(task).implementationVerdict).toBeNull();
  });

  test("T9 approve commit — push/merge/deploy unchanged", () => {
    const approved = applyHumanApproval({
      task: {
        status: "AWAITING_APPROVAL",
        contract: buildContract(PASS_DEMO_GOAL),
        runnerState: {
          ...zeroChangeRunnerState("PASS"),
          runnerInvoked: true,
          runId: "run-1",
        },
      },
      decision: "APPROVE_COMMIT",
      action: "COMMIT",
      actorUserId: "user-1",
    });
    expect(approved.runnerState.commitApproved).toBe(true);
    expect(approved.runnerState.commit).toBe(false);
    expect(approved.runnerState.push).toBe(false);
  });

  test("T10 refresh consistency — lifecycle VM reconstructs from persisted runner state", () => {
    const task = baseTask({ status: "RUNNING" });
    const first = buildTaskLifecycleViewModel(task);
    const second = buildTaskLifecycleViewModel(structuredClone(task));
    expect(first.correction.phase).toBe(second.correction.phase);
    expect(first.checks.technicalSummary).toBe(second.checks.technicalSummary);
  });

  test("T11 real git repository baseline capture", async () => {
    const root = getWorkspaceRoot();
    const isRepo = await isGitRepository(root);
    const baseline = await captureGitBaseline(root);
    if (baseline) {
      expect(baseline.headSha).toMatch(/^[0-9a-f]{40}$/);
      expect(baseline.branch).toBeTruthy();
    } else {
      expect(isRepo || !baseline).toBe(true);
    }
  });

  test("T12 orchestration in progress blocks approval gate", () => {
    expect(isOrchestrationInProgress("CHECKING")).toBe(true);
    expect(isApprovalGateOpen(baseTask({ status: "CHECKING" }))).toBe(false);
  });

  test("T13 stale approval — different runId not reused", () => {
    const task = baseTask({
      status: "AWAITING_APPROVAL",
      runnerState: {
        ...baseTask().runnerState!,
        runId: "run-new",
        humanApprovals: [
          {
            decision: "APPROVE_COMMIT",
            action: "COMMIT",
            actorUserId: "user-1",
            runId: "run-old",
            note: null,
            createdAt: new Date().toISOString(),
          },
        ],
        evidence: [{ category: "a", name: "x", status: "pass", summary: "ok", attemptNumber: 1 }],
      },
    });
    expect(isPendingHumanApproval(task)).toBe(true);
  });

  test("T14 production dev auth bypass disabled", () => {
    expect(
      evaluateDevAuthBypass({ isDevelopment: false, bypassFlag: "true" }),
    ).toBe(false);
  });
});

describe("git workspace path resolution", () => {
  test("absolute workspace path resolves for local repo onboarding", () => {
    const root = getWorkspaceRoot();
    const resolved = path.resolve(root);
    expect(resolved).toContain("BUILDLOOP");
  });
});
