import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { deriveApprovalRecommendation } from "@/lib/approval-recommendation";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";
import {
  collectApprovalUiCopy,
  containsIndonesianApprovalUiCopy,
  formatHumanGateSubmitLabel,
  presentHumanApprovalOutcome,
} from "@/lib/human-approval-presentation";

function awaitingApprovalTask(): TaskRecord {
  const contract = buildContract(PASS_DEMO_GOAL);
  return {
    id: "00000000-0000-4000-8000-000000000788",
    workspace: "buildloop-demo",
    goal: PASS_DEMO_GOAL,
    status: "AWAITING_APPROVAL",
    contract,
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("PASS demo"),
      runnerInvoked: true,
      filesChanged: 1,
      commandsExecuted: 0,
      commit: false,
      push: false,
      runId: "run-pass-788",
      correctionCount: 0,
      orchestration: {
        phase: "PASS",
        approvalType: "AUTO_APPROVED_BY_POLICY",
        finalVerdict: "PASS",
        workerInvoked: true,
        securityReviewInvoked: false,
      },
      evidence: [
        { category: "acceptance", name: "readme_goal_reflected", status: "pass", summary: "ok" },
      ],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: new Date().toISOString(),
    projectId: null,
    sourceCommitSha: null,
  };
}

describe("human approval presentation", () => {
  test("approve commit submit label is English in EN mode", () => {
    const label = formatHumanGateSubmitLabel("APPROVE_COMMIT", "en");
    expect(label).toBe("Approve commit");
    expect(containsIndonesianApprovalUiCopy(label)).toBe(false);
  });

  test("approve commit submit label is Indonesian in ID mode", () => {
    expect(formatHumanGateSubmitLabel("APPROVE_COMMIT", "id")).toBe("Setujui commit");
  });

  test("awaiting approval outcome is English in EN mode", () => {
    const outcome = presentHumanApprovalOutcome(awaitingApprovalTask(), "en");
    expect(outcome?.kind).toBe("pending");
    expect(outcome?.title).toBe("Awaiting human approval");
    expect(outcome?.description.toLowerCase()).toContain("commit");
    expect(containsIndonesianApprovalUiCopy(`${outcome?.title} ${outcome?.description}`)).toBe(
      false,
    );
  });

  test("awaiting approval outcome is Indonesian in ID mode", () => {
    const outcome = presentHumanApprovalOutcome(awaitingApprovalTask(), "id");
    expect(outcome?.title).toContain("Menunggu approval");
  });

  test("English approval UI copy has no Indonesian leaks for recommended approve", () => {
    const task = awaitingApprovalTask();
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const recommendation = deriveApprovalRecommendation(task, lifecycle, "en");
    const lines = collectApprovalUiCopy({
      task,
      locale: "en",
      recommendation,
    });

    for (const line of lines) {
      expect(containsIndonesianApprovalUiCopy(line)).toBe(false);
    }

    expect(lines.join("\n")).toContain("Why does BuildLoop recommend this?");
    expect(lines.join("\n")).toContain("Approve commit");
    expect(lines.join("\n")).not.toContain("Setujui commit");
    expect(lines.join("\n")).not.toContain("Kenapa BuildLoop merekomendasikannya?");
  });

  test("Indonesian approval UI copy includes localized gate labels", () => {
    const lines = collectApprovalUiCopy({
      task: awaitingApprovalTask(),
      locale: "id",
    });
    expect(lines.join("\n")).toContain("Setujui commit");
    expect(lines.join("\n")).toContain("Kenapa BuildLoop merekomendasikannya?");
  });

  test("English gate labels use Request additional review instead of Escalate", () => {
    const lines = collectApprovalUiCopy({
      task: awaitingApprovalTask(),
      locale: "en",
    });
    expect(lines.join("\n")).toContain("Request additional review");
    expect(lines.join("\n")).not.toContain("Escalate review");
  });
});
