import { afterEach, describe, expect, test } from "bun:test";

import { buildDeliveryHandoffViewModel } from "@/lib/delivery-handoff-presentation";
import {
  DeliveryArtifactAccessError,
  resolveAuthorizedDeliveryHandoff,
  sanitizeTaskRecordForClient,
} from "@/lib/delivery-artifact-gate";
import { applyHumanApproval } from "@/lib/human-approval";
import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { DeliveryHandoff } from "@/lib/delivery-artifact";
import type { TaskRecord } from "@/lib/tasks-schema";

function sampleHandoff(overrides: Partial<DeliveryHandoff> = {}): DeliveryHandoff {
  return {
    mode: "MANUAL_HANDOFF",
    taskId: "00000000-0000-4000-8000-000000000099",
    runId: "run-current",
    baselineSha: "abc1234567890abcdef1234567890abcdef12345678",
    attemptNumber: 1,
    checkerVerdict: "PASS",
    createdAt: "2026-08-30T12:00:00.000Z",
    changedFiles: ["docs/buildloop-demo-proof.md"],
    files: [{ path: "docs/buildloop-demo-proof.md", changeType: "added" }],
    patchFilename: "buildloop-BL-2026-2EED.patch",
    patch:
      "diff --git a/docs/buildloop-demo-proof.md b/docs/buildloop-demo-proof.md\nnew file mode 100644\n--- /dev/null\n+++ b/docs/buildloop-demo-proof.md\n@@ -0,0 +1,3 @@\n+# Demo\n+proof\n",
    patchSha256: "abc",
    blocked: false,
    suggestedCommitMessage: "docs: add BuildLoop human approval demo proof",
    suggestedCommitDescription: "Apply verified BuildLoop result for demo proof documentation.",
    ...overrides,
  };
}

function passTask(handoff = sampleHandoff()): TaskRecord {
  return {
    id: handoff.taskId,
    workspace: "buildloop-demo",
    goal: "Create docs/buildloop-demo-proof.md with demo proof text.",
    status: "AWAITING_APPROVAL",
    contract: buildContract("Create docs/buildloop-demo-proof.md with demo proof text."),
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("PASS"),
      runId: handoff.runId,
      deliveryHandoff: handoff,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: new Date().toISOString(),
    projectId: null,
    sourceCommitSha: null,
  };
}

function approvedTask(handoff = sampleHandoff()): TaskRecord {
  const base = passTask(handoff);
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
  return { ...base, status: result.status, runnerState: result.runnerState };
}

describe("delivery authorization read flow", () => {
  const repo = createDevTaskRepository();

  afterEach(async () => {
    await repo.resetForTests();
  });

  test("1 PASS without approval redacts client task and rejects authorized read", () => {
    const task = passTask();
    const client = sanitizeTaskRecordForClient(task);
    expect(client.runnerState?.deliveryHandoff?.patch).toBeNull();
    expect(() => resolveAuthorizedDeliveryHandoff(task)).toThrow(DeliveryArtifactAccessError);
  });

  test("2 current-run APPROVE_COMMIT returns exact persisted patch and commit metadata", () => {
    const task = approvedTask();
    const authorized = resolveAuthorizedDeliveryHandoff(task);
    expect(authorized.patch).toContain("+++ b/docs/buildloop-demo-proof.md");
    expect(authorized.patchFilename).toBe("buildloop-BL-2026-2EED.patch");
    expect(authorized.suggestedCommitMessage).toContain("docs:");
    expect(authorized.suggestedCommitDescription.length).toBeGreaterThan(0);
  });

  test("3 UI view model after authorization exposes download and non-empty commit command", () => {
    const task = approvedTask();
    const authorized = resolveAuthorizedDeliveryHandoff(task);
    const viewModel = buildDeliveryHandoffViewModel({
      handoff: { ...task.runnerState!.deliveryHandoff!, ...authorized, patch: authorized.patch },
      targetBranch: "main",
      sourceCommitSha: null,
      sourceCommitDrift: false,
      locale: "en",
    });
    expect(viewModel.patchAvailable).toBe(true);
    expect(viewModel.applyCommands).toContain("git apply");
    expect(viewModel.applyCommands).toContain("git commit -m 'docs:");
    expect(viewModel.applyCommands).not.toContain("git commit -m ''");
  });

  test("4 stale approval cannot read current run delivery", () => {
    const task = passTask();
    task.runnerState!.commitApproved = true;
    task.runnerState!.humanApprovals = [
      {
        decision: "APPROVE_COMMIT",
        action: "COMMIT",
        actorUserId: "user-1",
        runId: "run-old",
        note: null,
        createdAt: new Date().toISOString(),
      },
    ];
    expect(() => resolveAuthorizedDeliveryHandoff(task)).toThrow(DeliveryArtifactAccessError);
  });

  test("5 request revision denies authorized read for subsequent run", () => {
    const task = passTask(sampleHandoff({ runId: "run-2" }));
    expect(() => resolveAuthorizedDeliveryHandoff(task)).toThrow(DeliveryArtifactAccessError);
  });

  test("6 reject denies authorized read", () => {
    const task = passTask();
    const rejected = applyHumanApproval({
      task: { status: task.status, contract: task.contract, runnerState: task.runnerState },
      decision: "REJECT_CHANGES",
      action: "COMMIT",
      actorUserId: "user-1",
    });
    expect(() =>
      resolveAuthorizedDeliveryHandoff({ ...task, runnerState: rejected.runnerState }),
    ).toThrow(DeliveryArtifactAccessError);
  });

  test("7 additional review denies authorized read", () => {
    const task = passTask();
    const escalated = applyHumanApproval({
      task: { status: task.status, contract: task.contract, runnerState: task.runnerState },
      decision: "ESCALATE_REVIEW",
      action: "COMMIT",
      actorUserId: "user-1",
      reviewType: "technical",
      note: "Need review.",
    });
    expect(() =>
      resolveAuthorizedDeliveryHandoff({ ...task, runnerState: escalated.runnerState }),
    ).toThrow(DeliveryArtifactAccessError);
  });

  test(
    "8 unauthorized task owner mismatch is denied at repository boundary",
    async () => {
      const created = await repo.createTask({
        userId: DEV_AUTH_BYPASS_USER_ID,
        goal: "Create docs/buildloop-demo-proof.md with verified proof text.",
      });
      const handoff = sampleHandoff({ taskId: created.id });
      const approvedRunner = approvedTask(handoff).runnerState!;
      await repo.updateAfterRun({
        id: created.id,
        status: "AWAITING_APPROVAL",
        runnerState: approvedRunner,
      });

      await expect(
        repo.getAuthorizedDeliveryHandoff({ id: created.id, userId: "other-user" }),
      ).rejects.toThrow(DeliveryArtifactAccessError);
    },
    30_000,
  );

  test("9 missing persisted patch yields clear error and no fake apply command", () => {
    const task = approvedTask(sampleHandoff({ patch: null }));
    expect(() => resolveAuthorizedDeliveryHandoff(task)).toThrow(/unavailable/i);
    const viewModel = buildDeliveryHandoffViewModel({
      handoff: { ...task.runnerState!.deliveryHandoff!, patch: null },
      targetBranch: "main",
      sourceCommitSha: null,
      sourceCommitDrift: false,
      locale: "en",
      loadError: "Verified delivery package could not be loaded.",
    });
    expect(viewModel.patchAvailable).toBe(false);
    expect(viewModel.applyCommands).toBe("");
  });

  test("10 empty commit suggestion never renders git commit -m empty quotes", () => {
    const task = approvedTask(
      sampleHandoff({
        suggestedCommitMessage: "",
        suggestedCommitDescription: "",
      }),
    );
    const authorized = resolveAuthorizedDeliveryHandoff(task);
    expect(authorized.suggestedCommitMessage.length).toBeGreaterThan(0);
    const viewModel = buildDeliveryHandoffViewModel({
      handoff: { ...task.runnerState!.deliveryHandoff!, ...authorized, patch: authorized.patch },
      targetBranch: "main",
      sourceCommitSha: null,
      sourceCommitDrift: false,
    });
    expect(viewModel.applyCommands).not.toContain("git commit -m ''");
  });

  test("11 added untracked file patch includes /dev/null header", () => {
    const authorized = resolveAuthorizedDeliveryHandoff(approvedTask());
    expect(authorized.patch).toContain("--- /dev/null");
    expect(authorized.patch).toContain("docs/buildloop-demo-proof.md");
  });

  test("12 modified file handoff still resolves authorized patch", () => {
    const task = approvedTask(
      sampleHandoff({
        changedFiles: ["README.md"],
        files: [{ path: "README.md", changeType: "modified" }],
        patch: "diff --git a/README.md b/README.md\n+verified\n",
      }),
    );
    const authorized = resolveAuthorizedDeliveryHandoff(task);
    expect(authorized.patch).toContain("README.md");
  });

  test(
    "13 dev repository preserves patch through approval and authorized re-read",
    async () => {
      const created = await repo.createTask({
        userId: DEV_AUTH_BYPASS_USER_ID,
        goal: "Create docs/buildloop-demo-proof.md with verified proof text.",
      });
      const handoff = sampleHandoff({ taskId: created.id });
      const approvedRunner = approvedTask(handoff).runnerState!;
      await repo.updateAfterRun({
        id: created.id,
        status: "AWAITING_APPROVAL",
        runnerState: approvedRunner,
      });

      const authorized = await repo.getAuthorizedDeliveryHandoff({
        id: created.id,
        userId: DEV_AUTH_BYPASS_USER_ID,
      });
      expect(authorized.patch).toContain("docs/buildloop-demo-proof.md");
    },
    30_000,
  );

  test("14 authorized read is server-function scoped and not a public URL", () => {
    expect(typeof resolveAuthorizedDeliveryHandoff).toBe("function");
  });

  test(
    "15 recordHumanApproval via dev repository does not wipe persisted patch",
    async () => {
      const created = await repo.createTask({
        userId: DEV_AUTH_BYPASS_USER_ID,
        goal: "Create docs/buildloop-demo-proof.md with verified proof text.",
      });
      const handoff = sampleHandoff({ taskId: created.id });
      await repo.updateAfterRun({
        id: created.id,
        status: "AWAITING_APPROVAL",
        runnerState: passTask(handoff).runnerState!,
      });

      await repo.recordHumanApproval({
        id: created.id,
        userId: DEV_AUTH_BYPASS_USER_ID,
        decision: "APPROVE_COMMIT",
        action: "COMMIT",
        confirmedReview: true,
      });

      const authorized = await repo.getAuthorizedDeliveryHandoff({
        id: created.id,
        userId: DEV_AUTH_BYPASS_USER_ID,
      });
      expect(authorized.patch).toContain("docs/buildloop-demo-proof.md");
      expect(authorized.suggestedCommitMessage).toContain("docs:");
    },
    30_000,
  );
});
