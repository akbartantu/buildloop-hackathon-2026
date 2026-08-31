import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import {
  archiveCurrentRun,
  canRerunFailedTask,
  canRerunBlockedTask,
  captureContractInputs,
  contractInputsEqual,
  hasUnchangedContractInputs,
  requiresContractRefreshBeforeRerun,
} from "@/lib/task-rerun";
import { isOrchestrationEligible } from "@/lib/task-lifecycle-ops";
import { getContractHandoff } from "@/lib/contract-handoff";
import { listPrimaryAction } from "@/lib/task-list";

function failedTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  const contract = buildContract("Update README subtitle");
  return {
    id: "00000000-0000-4000-8000-000000000010",
    workspace: "buildloop-demo",
    goal: contract.goal,
    status: "FAILED",
    contract,
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("FAILED"),
      runnerInvoked: true,
      runId: "run-failed-1",
      correctionCount: 2,
      lockedContractInputs: captureContractInputs(contract),
      evidence: [{ category: "typecheck", name: "typecheck", status: "fail", summary: "fail" }],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:02:00.000Z",
    lockedAt: "2026-01-01T00:00:30.000Z",
    projectId: null,
    sourceCommitSha: null,
    ...overrides,
  };
}

describe("task re-run", () => {
  test("FAILED run can be re-run when contract inputs are unchanged", () => {
    const task = failedTask();
    expect(canRerunFailedTask(task)).toBe(true);
    expect(isOrchestrationEligible(task)).toBe(true);
    expect(listPrimaryAction("FAILED", "en", task)?.label).toBe("Re-run task");
    expect(getContractHandoff(task, { running: false, approving: false }).primaryAction).toBe("run");
  });

  test("archive preserves previous run evidence in runHistory", () => {
    const task = failedTask();
    const prepared = archiveCurrentRun(task);
    expect(prepared.runHistory).toHaveLength(1);
    expect(prepared.runHistory?.[0]?.runId).toBe("run-failed-1");
    expect(prepared.runHistory?.[0]?.evidence).toHaveLength(1);
    expect(prepared.evidence).toBeUndefined();
    expect(prepared.runId).toBeUndefined();
  });

  test("rerun via repository creates new run under same task and keeps history", async () => {
    const repo = createDevTaskRepository();
    const created = await repo.createTask({
      userId: DEV_AUTH_BYPASS_USER_ID,
      goal: "Update README subtitle to mention governed autonomous software delivery.",
      acceptanceCriteria: ["Only README.md is modified."],
    });
    const approved =
      created.status === "APPROVED_FOR_EXECUTION"
        ? created
        : await repo.lockContract({ id: created.id, userId: DEV_AUTH_BYPASS_USER_ID });

    const lockedInputs =
      approved.runnerState?.lockedContractInputs ?? captureContractInputs(approved.contract);

    const failed = await repo.updateAfterRun({
      id: created.id,
      status: "FAILED",
      runnerState: {
        ...zeroChangeRunnerState("FAILED"),
        runnerInvoked: true,
        runId: "run-original",
        lockedContractInputs: lockedInputs,
        evidence: [{ category: "test", name: "test", status: "fail", summary: "failed" }],
      },
    });

    const prepared = archiveCurrentRun(failed);
    await repo.prepareForRerun({
      id: created.id,
      status: "APPROVED_FOR_EXECUTION",
      runnerState: prepared,
    });

    const after = await repo.updateAfterRun({
      id: created.id,
      status: "AWAITING_APPROVAL",
      runnerState: {
        ...zeroChangeRunnerState("PASS"),
        runnerInvoked: true,
        runId: "run-second",
        runHistory: prepared.runHistory,
        lockedContractInputs: prepared.lockedContractInputs,
        evidence: [{ category: "test", name: "test", status: "pass", summary: "ok" }],
        orchestration: { phase: "PASS", finalVerdict: "PASS" },
      },
    });

    expect(after.id).toBe(created.id);
    expect(after.runnerState?.runId).toBe("run-second");
    expect(after.runnerState?.runHistory).toHaveLength(1);
    expect(after.runnerState?.runHistory?.[0]?.runId).toBe("run-original");
    expect(after.runnerState?.runHistory?.[0]?.evidence?.[0]?.status).toBe("fail");
  });

  test("changed contract inputs require refresh before rerun", () => {
    const task = failedTask({
      contract: {
        ...buildContract("Changed goal text"),
        contractVersion: 2,
      } as TaskRecord["contract"],
    });
    expect(hasUnchangedContractInputs(task)).toBe(false);
    expect(requiresContractRefreshBeforeRerun(task)).toBe(true);
    expect(canRerunFailedTask(task)).toBe(false);
  });

  test("unchanged contract inputs compare deterministically", () => {
    const contract = buildContract("Same goal");
    const left = captureContractInputs(contract);
    const right = captureContractInputs({ ...contract, inScope: [...contract.inScope] });
    expect(contractInputsEqual(left, right)).toBe(true);
  });

  test("BLOCKED does not offer silent re-run", () => {
    const blocked = failedTask({
      status: "BLOCKED",
      blockedReasons: [{ rule: "policy", matchedText: "deploy", explanation: "Blocked", protectedTarget: null }],
      runnerState: zeroChangeRunnerState("blocked"),
    });
    expect(canRerunBlockedTask(blocked)).toBe(false);
    expect(canRerunFailedTask(blocked)).toBe(false);
    expect(getContractHandoff(blocked, { running: false, approving: false }).primaryAction).not.toBe("run");
  });
});
