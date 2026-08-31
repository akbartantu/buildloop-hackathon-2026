import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { DeliveryHandoff } from "@/lib/delivery-artifact";
import {
  buildDeliveryHandoffViewModel,
  buildGitApplyCommands,
  canShowDeliveryHandoff,
} from "@/lib/delivery-handoff-presentation";
import { applyHumanApproval } from "@/lib/human-approval";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import type { TaskRecord } from "@/lib/tasks-schema";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";

function sampleHandoff(overrides: Partial<DeliveryHandoff> = {}): DeliveryHandoff {
  return {
    mode: "MANUAL_HANDOFF",
    taskId: "00000000-0000-4000-8000-000000000099",
    runId: "run-handoff",
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

function commitApprovedTask(handoff?: DeliveryHandoff): TaskRecord {
  const resolvedHandoff = handoff ?? sampleHandoff();
  const contract = buildContract(PASS_DEMO_GOAL);
  return {
    id: "00000000-0000-4000-8000-000000000099",
    workspace: "buildloop-demo",
    goal: PASS_DEMO_GOAL,
    status: "CLOSED",
    contract,
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("PASS demo"),
      runnerInvoked: true,
      filesChanged: 1,
      commandsExecuted: 0,
      commit: false,
      push: false,
      commitApproved: true,
      runId: resolvedHandoff.runId,
      deliveryHandoff: resolvedHandoff,
      humanApprovals: [
        {
          decision: "APPROVE_COMMIT",
          action: "COMMIT",
          actorUserId: "user-1",
          runId: resolvedHandoff.runId,
          note: null,
          createdAt: "2026-08-31T07:30:00.000Z",
        },
      ],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: new Date().toISOString(),
    projectId: null,
    sourceCommitSha: null,
  };
}

function passAwaitingApprovalTask(handoff: DeliveryHandoff = sampleHandoff()): TaskRecord {
  const contract = buildContract(PASS_DEMO_GOAL);
  return {
    id: "00000000-0000-4000-8000-000000000088",
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
      orchestration: { phase: "PASS", finalVerdict: "PASS" },
      deliveryHandoff: handoff,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: new Date().toISOString(),
    projectId: null,
    sourceCommitSha: "abc1234567890abcdef1234567890abcdef12345678",
  };
}

function deliveryHandoffVisible(task: TaskRecord): boolean {
  return canShowDeliveryHandoff({ runnerState: task.runnerState ?? null });
}

function buildApprovedHandoffViewModel(task: TaskRecord) {
  const handoff = task.runnerState?.deliveryHandoff;
  if (!handoff) {
    throw new Error("Expected delivery handoff on task.");
  }
  return buildDeliveryHandoffViewModel({
    handoff,
    targetBranch: "main",
    sourceCommitSha: task.sourceCommitSha,
    sourceCommitDrift: false,
    locale: "en",
  });
}

describe("delivery handoff presentation", () => {
  test("manual delivery handoff is available after commit approval", () => {
    expect(canShowDeliveryHandoff({ commitApproved: true, handoff: sampleHandoff() })).toBe(true);
    expect(canShowDeliveryHandoff({ commitApproved: false, handoff: sampleHandoff() })).toBe(false);
  });

  test("reject/revision paths do not expose approved delivery state", () => {
    const task = commitApprovedTask();
    task.runnerState!.commitApproved = false;
    task.runnerState!.deliveryHandoff = sampleHandoff();
    expect(
      canShowDeliveryHandoff({
        runnerState: {
          ...task.runnerState!,
          commitApproved: false,
        },
      }),
    ).toBe(false);
  });

  test("copyable apply commands reference the generated patch filename", () => {
    const commands = buildGitApplyCommands({
      patchFilename: "buildloop-BL-2026-0099.patch",
      targetBranch: "main",
      changedFiles: ["README.md"],
      commitMessage: "feat: update readme",
      commitDescription: "Verified change.",
    });

    expect(commands.applyCommands).toContain("git apply buildloop-BL-2026-0099.patch");
    expect(commands.applyCommands).toContain("git add README.md");
    expect(commands.applyCommands).toContain('git commit -m \'feat: update readme\'');
  });

  test("git add uses verified file paths only", () => {
    const commands = buildGitApplyCommands({
      patchFilename: "buildloop-BL-2026-0099.patch",
      targetBranch: "main",
      changedFiles: ["src/lib/task-run-progress.ts", "README.md"],
      commitMessage: "feat: timing",
      commitDescription: "Verified.",
    });

    expect(commands.applyCommands).toContain("git add src/lib/task-run-progress.ts");
    expect(commands.applyCommands).toContain("git add README.md");
  });

  test("branch placeholders/fallbacks are correct when branch is unknown", () => {
    const commands = buildGitApplyCommands({
      patchFilename: "buildloop-BL-2026-0099.patch",
      targetBranch: "",
      changedFiles: ["README.md"],
      commitMessage: "feat: update",
      commitDescription: "Verified.",
    });

    expect(commands.applyCommands).toContain("git checkout <target-branch>");
    expect(commands.pushCommand).toContain("git push origin <target-branch>");
  });

  test("shell quoting escapes unsafe filenames and commit text", () => {
    const commands = buildGitApplyCommands({
      patchFilename: "buildloop-BL-2026-0099.patch",
      targetBranch: "feature/hand-off",
      changedFiles: ["src/file with spaces.ts"],
      commitMessage: "feat: don't break",
      commitDescription: "Verified \"change\".",
    });

    expect(commands.applyCommands).toContain("git add 'src/file with spaces.ts'");
    expect(commands.applyCommands).toContain("'feat: don'\\''t break'");
  });

  test("view model never claims commit was executed", () => {
    const viewModel = buildDeliveryHandoffViewModel({
      handoff: sampleHandoff(),
      targetBranch: "main",
      sourceCommitSha: "abc1234567890abcdef1234567890abcdef12345678",
      sourceCommitDrift: false,
      locale: "en",
    });

    expect(viewModel.remoteActions.find((item) => item.label === "Git commit")?.value).toContain(
      "Not executed",
    );
    expect(viewModel.pushNote).toContain("not approved");
  });

  test("commit approval still does not execute Git commit", () => {
    const task = commitApprovedTask();
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    expect(task.runnerState?.commit).toBe(false);
    expect(lifecycle.delivery.commit).not.toBe("EXECUTED");
  });

  test("push merge deploy remain not approved", () => {
    const task = commitApprovedTask();
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    expect(task.runnerState?.push).toBe(false);
    expect(lifecycle.delivery.push).not.toBe("APPROVED");
    expect(lifecycle.delivery.merge).not.toBe("APPROVED");
    expect(lifecycle.delivery.deploy).not.toBe("APPROVED");
  });

  test("source drift warning is shown when repository changed", () => {
    const viewModel = buildDeliveryHandoffViewModel({
      handoff: sampleHandoff(),
      targetBranch: "main",
      sourceCommitSha: "abc1234567890abcdef1234567890abcdef12345678",
      sourceCommitDrift: true,
      locale: "en",
    });

    expect(viewModel.sourceDriftWarning).toContain("Repository has changed");
  });
});

describe("delivery handoff regression guard J", () => {
  test("27 approve commit still exposes the verified delivery package", () => {
    const task = commitApprovedTask();
    expect(deliveryHandoffVisible(task)).toBe(true);

    const viewModel = buildApprovedHandoffViewModel(task);
    expect(viewModel.title).toContain("Verified delivery package");
    expect(viewModel.changedFiles).toEqual(["README.md"]);
    expect(viewModel.verifiedAgainstSha).toBeTruthy();
    expect(viewModel.intro.toLowerCase()).toContain("did not execute");
  });

  test("28 download patch remains available for safe PASS results", () => {
    const handoff = sampleHandoff();
    const viewModel = buildApprovedHandoffViewModel(commitApprovedTask(handoff));

    expect(viewModel.patchAvailable).toBe(true);
    expect(handoff.patch).toContain("README.md");
    expect(viewModel.patchFilename).toBe("buildloop-BL-2026-0099.patch");
    expect(viewModel.blockedReason).toBeNull();
  });

  test("29 suggested commit message remains available", () => {
    const viewModel = buildApprovedHandoffViewModel(commitApprovedTask());
    expect(viewModel.suggestedCommitMessage).toBe("feat: update readme subtitle");
    expect(viewModel.suggestedCommitMessage.length).toBeGreaterThan(0);
  });

  test("30 suggested commit description remains available", () => {
    const viewModel = buildApprovedHandoffViewModel(commitApprovedTask());
    expect(viewModel.suggestedCommitDescription).toBe("Apply verified BuildLoop result.");
    expect(viewModel.suggestedCommitDescription.length).toBeGreaterThan(0);
  });

  test("31 git apply/commit commands remain copyable", () => {
    const viewModel = buildApprovedHandoffViewModel(commitApprovedTask());

    expect(viewModel.applyCommands).toContain("git apply buildloop-BL-2026-0099.patch");
    expect(viewModel.applyCommands).toContain("git add README.md");
    expect(viewModel.applyCommands).toContain("git commit -m");
    expect(viewModel.applyCommands.length).toBeGreaterThan(20);
  });

  test("32 push remains manual and not approved automatically", () => {
    const task = commitApprovedTask();
    const viewModel = buildApprovedHandoffViewModel(task);
    const lifecycle = buildTaskLifecycleViewModel(task, "en");

    expect(viewModel.pushCommand).toContain("git push origin");
    expect(viewModel.pushNote.toLowerCase()).toContain("not approved");
    expect(task.runnerState?.push).toBe(false);
    expect(lifecycle.delivery.push).not.toBe("APPROVED");
    expect(lifecycle.delivery.push).not.toBe("EXECUTED");
    expect(viewModel.remoteActions.find((item) => item.label === "Push")?.value.toLowerCase()).toContain(
      "not approved",
    );
  });

  test("33 request revision does not expose an approved delivery package", () => {
    const task = passAwaitingApprovalTask();
    expect(deliveryHandoffVisible(task)).toBe(false);

    const result = applyHumanApproval({
      task: {
        status: task.status,
        contract: task.contract,
        runnerState: task.runnerState,
      },
      decision: "REQUEST_REVISION",
      action: "COMMIT",
      actorUserId: "user-1",
      note: "Preserve README content.",
    });

    expect(result.runnerState.commitApproved).toBeUndefined();
    expect(result.runnerState.revisionRequested).toBe(true);
    expect(result.runnerState.deliveryHandoff).toBeDefined();
    expect(
      deliveryHandoffVisible({
        ...task,
        status: result.status,
        runnerState: result.runnerState,
      }),
    ).toBe(false);
  });

  test("34 reject changes does not expose an approved delivery package", () => {
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
      note: "Scope drift.",
    });

    expect(result.status).toBe("CLOSED");
    expect(result.runnerState.rejected).toBe(true);
    expect(result.runnerState.commitApproved).toBeUndefined();
    expect(
      deliveryHandoffVisible({
        ...task,
        status: result.status,
        runnerState: result.runnerState,
      }),
    ).toBe(false);
  });

  test("35 request additional review does not expose an approved delivery package", () => {
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
      reviewType: "security",
      note: "Verify auth boundary.",
    });

    expect(result.status).toBe("AWAITING_APPROVAL");
    expect(result.runnerState.escalated).toBe(true);
    expect(result.runnerState.commitApproved).toBeUndefined();
    expect(
      deliveryHandoffVisible({
        ...task,
        status: result.status,
        runnerState: result.runnerState,
      }),
    ).toBe(false);
  });

  test("36 existing persisted delivery handoff records load correctly after approval UX changes", () => {
    const task = commitApprovedTask();
    task.runnerState!.humanApprovals = [
      {
        decision: "APPROVE_COMMIT",
        action: "COMMIT",
        actorUserId: "user-1",
        runId: "run-handoff",
        note: null,
        createdAt: "2026-08-31T07:30:00.000Z",
      },
      {
        decision: "REQUEST_REVISION",
        action: "COMMIT",
        actorUserId: "user-1",
        runId: "run-previous",
        note: "Earlier revision note from approval UX.",
        createdAt: "2026-08-30T12:00:00.000Z",
      },
    ];

    const restoredRunner = JSON.parse(JSON.stringify(task.runnerState)) as typeof task.runnerState;
    expect(restoredRunner?.deliveryHandoff?.patch).toContain("README.md");
    expect(restoredRunner?.deliveryHandoff?.baselineSha).toBe(sampleHandoff().baselineSha);
    expect(restoredRunner?.humanApprovals).toHaveLength(2);
    expect(restoredRunner?.humanApprovals?.[1]?.note).toContain("Earlier revision note");

    expect(
      canShowDeliveryHandoff({
        runnerState: restoredRunner,
      }),
    ).toBe(true);

    const viewModel = buildDeliveryHandoffViewModel({
      handoff: restoredRunner!.deliveryHandoff!,
      targetBranch: "main",
      sourceCommitSha: task.sourceCommitSha,
      sourceCommitDrift: true,
      locale: "en",
    });
    expect(viewModel.sourceDriftWarning).toContain("Repository has changed");
    expect(viewModel.patchAvailable).toBe(true);
  });

  test("approve commit path preserves delivery handoff after applyHumanApproval", () => {
    const task = passAwaitingApprovalTask();
    const result = applyHumanApproval({
      task: {
        status: task.status,
        contract: task.contract,
        runnerState: task.runnerState,
      },
      decision: "APPROVE_COMMIT",
      action: "COMMIT",
      actorUserId: "user-1",
    });

    expect(result.runnerState.commitApproved).toBe(true);
    expect(result.runnerState.deliveryHandoff?.patch).toContain("README.md");
    expect(
      deliveryHandoffVisible({
        ...task,
        status: result.status,
        runnerState: result.runnerState,
      }),
    ).toBe(true);
  });
});

describe("Firestore mapper delivery handoff", () => {
  test("preserves delivery metadata through orchestrationPayload round-trip", async () => {
    const { firestoreRecordToStoredRun, storedRunToFirestoreRecord } = await import(
      "@/orchestrator/persistence/firestore-mapper"
    );

    const handoff = sampleHandoff();
    const original = {
      run: {
        id: "run-handoff",
        taskId: handoff.taskId,
        contractId: handoff.taskId,
        contractVersion: 1,
        status: "AWAITING_APPROVAL",
        verdict: "PASS",
        verdictReason: "Checks passed",
        sourceRevision: handoff.baselineSha,
        workerId: "demo-worker",
        attemptNumber: handoff.attemptNumber,
        counters: {
          workerCalls: 1,
          checkerCalls: 1,
          correctionCount: 0,
          filesChanged: 1,
          commandsExecuted: 0,
        },
        startedAt: "2026-08-30T12:00:00.000Z",
        completedAt: "2026-08-30T12:01:00.000Z",
      },
      evidence: [],
      workerReports: [],
      decisionLog: [],
      orchestrationEvidence: {
        securityReviewInvoked: false,
        securityFindings: [],
        approvalType: null,
        policyDecision: null,
        plannerOutput: null,
      },
      deliveryHandoff: handoff,
    };

    const record = storedRunToFirestoreRecord(original as never);
    const restored = firestoreRecordToStoredRun(record);
    expect(restored.deliveryHandoff?.patch).toBe(handoff.patch);
    expect(restored.deliveryHandoff?.baselineSha).toBe(handoff.baselineSha);
    expect(restored.deliveryHandoff?.changedFiles).toEqual(["README.md"]);
  });
});
