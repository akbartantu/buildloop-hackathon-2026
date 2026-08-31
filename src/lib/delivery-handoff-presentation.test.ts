import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { DeliveryHandoff } from "@/lib/delivery-artifact";
import {
  buildDeliveryHandoffViewModel,
  buildGitApplyCommands,
  canShowDeliveryHandoff,
} from "@/lib/delivery-handoff-presentation";
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
      runId: "run-handoff",
      deliveryHandoff: handoff ?? sampleHandoff(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: new Date().toISOString(),
    projectId: null,
    sourceCommitSha: null,
  };
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
    expect(canShowDeliveryHandoff({ commitApproved: false, handoff: task.runnerState?.deliveryHandoff })).toBe(
      false,
    );
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
