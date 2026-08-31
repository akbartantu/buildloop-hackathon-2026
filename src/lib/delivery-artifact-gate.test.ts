import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { DeliveryHandoff } from "@/lib/delivery-artifact";
import {
  DeliveryArtifactAccessError,
  isDeliveryArtifactAuthorized,
  readAuthorizedDeliveryPatch,
  sanitizeRunnerStateForClient,
  sanitizeTaskRecordForClient,
} from "@/lib/delivery-artifact-gate";
import {
  buildDeliveryHandoffViewModel,
  canShowDeliveryHandoff,
} from "@/lib/delivery-handoff-presentation";
import { applyHumanApproval } from "@/lib/human-approval";
import { toTaskRecord, type TaskRowShape } from "@/lib/tasks/task-record";
import type { TaskRecord } from "@/lib/tasks-schema";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";

function sampleHandoff(overrides: Partial<DeliveryHandoff> = {}): DeliveryHandoff {
  return {
    mode: "MANUAL_HANDOFF",
    taskId: "00000000-0000-4000-8000-000000000099",
    runId: "run-current",
    baselineSha: "abc1234567890abcdef1234567890abcdef12345678",
    attemptNumber: 1,
    checkerVerdict: "PASS",
    createdAt: "2026-08-30T12:00:00.000Z",
    changedFiles: ["README.md"],
    files: [{ path: "README.md", changeType: "modified" }],
    patchFilename: "buildloop-BL-2026-0099.patch",
    patch: "diff --git a/README.md b/README.md\n+verified\n",
    patchSha256: "abc",
    blocked: false,
    suggestedCommitMessage: "feat: update readme subtitle",
    suggestedCommitDescription: "Apply verified BuildLoop result.",
    ...overrides,
  };
}

function passAwaitingApprovalTask(handoff = sampleHandoff()): TaskRecord {
  const contract = buildContract(PASS_DEMO_GOAL);
  return {
    id: handoff.taskId,
    workspace: "buildloop-demo",
    goal: PASS_DEMO_GOAL,
    status: "AWAITING_APPROVAL",
    contract,
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("PASS demo"),
      runnerInvoked: true,
      filesChanged: 1,
      runId: handoff.runId,
      changeArtifact: undefined,
      orchestration: { phase: "PASS", finalVerdict: "PASS" },
      deliveryHandoff: handoff,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: new Date().toISOString(),
    projectId: null,
    sourceCommitSha: null,
  };
}

function approvedTaskForRun(handoff = sampleHandoff()): TaskRecord {
  const base = passAwaitingApprovalTask(handoff);
  const result = applyHumanApproval({
    task: {
      status: base.status,
      contract: base.contract,
      runnerState: base.runnerState,
    },
    decision: "APPROVE_COMMIT",
    action: "COMMIT",
    actorUserId: "user-1",
  });
  return {
    ...base,
    status: result.status,
    runnerState: result.runnerState,
  };
}

describe("delivery artifact approval gate K", () => {
  test("37 PASS without commit approval cannot download patch", () => {
    const task = passAwaitingApprovalTask();
    expect(canShowDeliveryHandoff({ runnerState: task.runnerState })).toBe(false);

    const sanitized = sanitizeTaskRecordForClient(task);
    expect(sanitized.runnerState?.deliveryHandoff?.patch).toBeNull();
    expect(sanitized.runnerState?.deliveryHandoff?.suggestedCommitMessage).toBe("");
  });

  test("38 PASS without commit approval does not expose apply commands", () => {
    const task = passAwaitingApprovalTask();
    expect(canShowDeliveryHandoff({ runnerState: task.runnerState })).toBe(false);

    const handoff = task.runnerState?.deliveryHandoff;
    if (!handoff) {
      throw new Error("Expected handoff");
    }
    const viewModel = buildDeliveryHandoffViewModel({
      handoff,
      targetBranch: "main",
      sourceCommitSha: null,
      sourceCommitDrift: false,
      locale: "en",
    });
    expect(viewModel.patchAvailable).toBe(true);

    const clientHandoff = sanitizeRunnerStateForClient(task.runnerState)?.deliveryHandoff;
    expect(clientHandoff?.patch).toBeNull();
    expect(() => readAuthorizedDeliveryPatch(task.runnerState)).toThrow(DeliveryArtifactAccessError);
  });

  test("39 APPROVE_COMMIT for current run unlocks delivery package", () => {
    const task = approvedTaskForRun();
    expect(isDeliveryArtifactAuthorized(task.runnerState)).toBe(true);
    expect(canShowDeliveryHandoff({ runnerState: task.runnerState })).toBe(true);

    const clientTask = sanitizeTaskRecordForClient(task);
    expect(clientTask.runnerState?.deliveryHandoff?.patch).toContain("README.md");
    expect(readAuthorizedDeliveryPatch(task.runnerState)).toContain("verified");

    const viewModel = buildDeliveryHandoffViewModel({
      handoff: task.runnerState!.deliveryHandoff!,
      targetBranch: "main",
      sourceCommitSha: null,
      sourceCommitDrift: false,
      locale: "en",
    });
    expect(viewModel.patchAvailable).toBe(true);
    expect(viewModel.suggestedCommitMessage).toContain("feat:");
    expect(viewModel.applyCommands).toContain("git apply");
  });

  test("40 approval from previous run does not unlock current run artifact", () => {
    const staleHandoff = sampleHandoff({ runId: "run-current" });
    const task = passAwaitingApprovalTask(staleHandoff);
    task.runnerState!.commitApproved = true;
    task.runnerState!.humanApprovals = [
      {
        decision: "APPROVE_COMMIT",
        action: "COMMIT",
        actorUserId: "user-1",
        runId: "run-previous",
        note: null,
        createdAt: "2026-08-30T11:00:00.000Z",
      },
    ];

    expect(isDeliveryArtifactAuthorized(task.runnerState)).toBe(false);
    expect(canShowDeliveryHandoff({ runnerState: task.runnerState })).toBe(false);
    expect(sanitizeTaskRecordForClient(task).runnerState?.deliveryHandoff?.patch).toBeNull();
  });

  test("41 request revision re-locks delivery for the subsequent run", () => {
    const firstRun = passAwaitingApprovalTask(sampleHandoff({ runId: "run-1" }));
    const revision = applyHumanApproval({
      task: {
        status: firstRun.status,
        contract: firstRun.contract,
        runnerState: firstRun.runnerState,
      },
      decision: "REQUEST_REVISION",
      action: "COMMIT",
      actorUserId: "user-1",
      note: "Revise copy only.",
    });

    expect(revision.runnerState.commitApproved).toBeUndefined();

    const nextRunHandoff = sampleHandoff({ runId: "run-2", patch: "diff --git a/README.md b/README.md\n+next\n" });
    const nextRun: TaskRecord = {
      ...firstRun,
      status: "AWAITING_APPROVAL",
      runnerState: {
        ...revision.runnerState,
        runId: "run-2",
        deliveryHandoff: nextRunHandoff,
        revisionRequested: false,
      },
    };

    expect(isDeliveryArtifactAuthorized(nextRun.runnerState)).toBe(false);
    expect(sanitizeTaskRecordForClient(nextRun).runnerState?.deliveryHandoff?.patch).toBeNull();
  });

  test("42 reject never unlocks delivery", () => {
    const task = passAwaitingApprovalTask();
    const result = applyHumanApproval({
      task: {
        status: task.status,
        contract: task.contract,
        runnerState: task.runnerState,
      },
      decision: "REJECT_CHANGES",
      action: "COMMIT",
      actorUserId: "user-1",
    });

    expect(isDeliveryArtifactAuthorized(result.runnerState)).toBe(false);
    expect(() => readAuthorizedDeliveryPatch(result.runnerState)).toThrow(DeliveryArtifactAccessError);
  });

  test("43 additional review never unlocks delivery", () => {
    const task = passAwaitingApprovalTask();
    const result = applyHumanApproval({
      task: {
        status: task.status,
        contract: task.contract,
        runnerState: task.runnerState,
      },
      decision: "ESCALATE_REVIEW",
      action: "COMMIT",
      actorUserId: "user-1",
      reviewType: "technical",
      note: "Need review.",
    });

    expect(isDeliveryArtifactAuthorized(result.runnerState)).toBe(false);
    expect(canShowDeliveryHandoff({ runnerState: result.runnerState })).toBe(false);
  });

  test("44 direct artifact access without current-run commit approval is rejected", () => {
    const task = passAwaitingApprovalTask();
    expect(() => readAuthorizedDeliveryPatch(task.runnerState)).toThrow(DeliveryArtifactAccessError);

    const row: TaskRowShape = {
      id: task.id,
      workspace: task.workspace,
      goal: task.goal,
      status: task.status,
      contract: task.contract,
      blocked_reasons: task.blockedReasons,
      runner_state: task.runnerState,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      locked_at: task.lockedAt,
      project_id: task.projectId,
      source_commit_sha: task.sourceCommitSha,
    };
    const clientRecord = toTaskRecord(row);
    expect(clientRecord.runnerState?.deliveryHandoff?.patch).toBeNull();
  });
});
