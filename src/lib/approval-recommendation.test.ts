import { describe, expect, test } from "bun:test";

import {
  deriveApprovalRecommendation,
  shouldRenderTabIcon,
} from "@/lib/approval-recommendation";
import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";

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
      note: "Worker completed changes.",
      evidence: [
        { category: "preflight", name: "policy", status: "pass", summary: "ok" },
        { category: "acceptance", name: "a", status: "pass", summary: "ok" },
        {
          category: "protected_path",
          name: "protected_path_unchanged",
          status: "pass",
          summary: "No protected path changes detected.",
        },
      ],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: new Date().toISOString(),
    projectId: null,
    sourceCommitSha: null,
    ...overrides,
  };
}

function recommendationFor(task: TaskRecord, locale: "en" | "id" = "en") {
  const lifecycle = buildTaskLifecycleViewModel(task, locale);
  return { lifecycle, recommendation: lifecycle.approval };
}

describe("approval recommendation regression", () => {
  test("R1 final PASS + all required checks → RECOMMENDED_APPROVE", () => {
    const { recommendation } = recommendationFor(baseTask());
    expect(recommendation.kind).toBe("RECOMMENDED_APPROVE");
    expect(recommendation.canRecommendApprove).toBe(true);
    expect(recommendation.label).toContain("recommends approval");
  });

  test("R2 historical failure resolved by correction → APPROVE without unresolved failure summary", () => {
    const task = baseTask({
      runnerState: {
        ...baseTask().runnerState!,
        correctionCount: 1,
        decisionLog: [
          {
            rule: "CORRECTION_ALLOWED",
            summary: "Approval guidance belum lengkap.",
            nextStatus: "NEEDS_CORRECTION",
            verdict: null,
          },
          {
            rule: "CHECKS_PASSED",
            summary: "PASS",
            nextStatus: "AWAITING_APPROVAL",
            verdict: "PASS",
          },
        ],
        evidence: [
          { category: "acceptance", name: "a", status: "pass", summary: "ok" },
          {
            category: "protected_path",
            name: "protected_path_unchanged",
            status: "pass",
            summary: "No protected path changes detected.",
          },
        ],
      },
    });
    const { recommendation } = recommendationFor(task);
    expect(recommendation.kind).toBe("RECOMMENDED_APPROVE");
    expect(recommendation.finalChecksSummary).toBe("All final checks passed.");
    expect(recommendation.unresolvedIssues).toHaveLength(0);
    expect(recommendation.historicalCorrection?.issueCount).toBe(1);
    expect(recommendation.historicalCorrection?.summary).toContain("fixed automatically");
  });

  test("R3 final required check failed → FIX_FIRST", () => {
    const task = baseTask({
      status: "AWAITING_APPROVAL",
      runnerState: {
        ...baseTask().runnerState!,
        evidence: [
          { category: "acceptance", name: "a", status: "pass", summary: "ok" },
          {
            category: "acceptance",
            name: "b",
            status: "fail",
            summary: "Teks workspace masih belum menjelaskan kapan approval diperlukan.",
          },
        ],
      },
    });
    const { recommendation, lifecycle } = recommendationFor(task);
    expect(lifecycle.implementationVerdict).toBeNull();
    expect(recommendation.kind).toBe("FIX_FIRST");
    expect(recommendation.canRecommendApprove).toBe(false);
    expect(recommendation.unresolvedIssues.length).toBeGreaterThan(0);
  });

  test("R4 missing required evidence → not APPROVE", () => {
    const task = baseTask({
      runnerState: {
        ...baseTask().runnerState!,
        evidence: [],
      },
    });
    const { recommendation } = recommendationFor(task);
    expect(recommendation.kind).toBe("HUMAN_REVIEW_REQUIRED");
    expect(recommendation.canRecommendApprove).toBe(false);
  });

  test("R5 protected path violation → not APPROVE", () => {
    const task = baseTask({
      status: "BLOCKED",
      runnerState: {
        ...baseTask().runnerState!,
        evidence: [
          {
            category: "protected_path",
            name: "package_json",
            status: "blocked",
            summary: "Protected path modified.",
          },
        ],
      },
    });
    const { recommendation } = recommendationFor(task);
    expect(recommendation.kind).toBe("HUMAN_REVIEW_REQUIRED");
    expect(recommendation.canRecommendApprove).toBe(false);
  });

  test("R6 worker note PASS but checker/deterministic fails → not APPROVE", () => {
    const task = baseTask({
      runnerState: {
        ...baseTask().runnerState!,
        note: "PASS — worker claims success",
        evidence: [
          { category: "acceptance", name: "a", status: "fail", summary: "Criteria not met." },
        ],
      },
    });
    const { recommendation, lifecycle } = recommendationFor(task);
    expect(lifecycle.implementationVerdict).toBeNull();
    expect(recommendation.kind).toBe("FIX_FIRST");
    expect(recommendation.canRecommendApprove).toBe(false);
  });

  test("R7 approve commit only → push/merge/deploy remain unapproved", () => {
    const task = baseTask({
      status: "CLOSED",
      runnerState: {
        ...baseTask().runnerState!,
        commitApproved: true,
        commit: false,
        push: false,
      },
    });
    const { lifecycle } = recommendationFor(task);
    expect(lifecycle.delivery.commit).toBe("APPROVED");
    expect(lifecycle.delivery.push).toBe("NOT_APPROVED");
    expect(lifecycle.delivery.merge).toBe("NOT_APPROVED");
    expect(lifecycle.delivery.deploy).toBe("NOT_APPROVED");
  });

  test("R8 approved but not executed commit → permission vs execution distinguished", () => {
    const task = baseTask({
      status: "CLOSED",
      runnerState: {
        ...baseTask().runnerState!,
        commitApproved: true,
        commit: false,
      },
    });
    const { recommendation, lifecycle } = recommendationFor(task);
    expect(lifecycle.deliveryLabels.commit).toContain("not executed");
    expect(recommendation.commitAutomationNote).toContain("not available");
    expect(recommendation.overviewSummary).toContain("not executed");
  });

  test("R9 completed tab renders one status indicator — hide duplicate tab icon", () => {
    expect(shouldRenderTabIcon("complete")).toBe(false);
    expect(shouldRenderTabIcon("current")).toBe(true);
    expect(shouldRenderTabIcon("upcoming")).toBe(true);
  });

  test("R10 Overview, Evidence, Approval derive recommendation from same lifecycle projection", () => {
    const task = baseTask();
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const direct = deriveApprovalRecommendation(task, lifecycle, "en");
    expect(lifecycle.approval).toEqual(direct);
    expect(lifecycle.approval.overviewSummary).toBe(direct.overviewSummary);
  });
});

describe("deriveApprovalRecommendation direct", () => {
  test("FAILED status yields FIX_FIRST", () => {
    const task = baseTask({ status: "FAILED" });
    const lifecycle = buildTaskLifecycleViewModel(task);
    const rec = deriveApprovalRecommendation(task, lifecycle);
    expect(rec.kind).toBe("FIX_FIRST");
  });
});
