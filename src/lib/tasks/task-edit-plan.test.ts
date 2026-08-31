import { afterEach, describe, expect, test } from "bun:test";

import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import { buildContract } from "@/lib/task-contract";
import { canUpdateDraft, getContractVersion } from "@/lib/task-lifecycle-ops";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import { applyDraftUpdate } from "@/lib/tasks/task-mutations";

const CLEVIA_GOAL =
  "CLEVIA-001 — Initialize the Clevia frontend foundation and responsive dashboard shell using mock data only.";

describe("edit plan task identity", () => {
  test("applyDraftUpdate preserves task id and increments contract version", async () => {
    const base = {
      id: "00000000-0000-4000-8000-000000000030",
      userId: "00000000-0000-4000-8000-000000000099",
      workspace: "https://github.com/akbartantu/clevia",
      goal: CLEVIA_GOAL,
      status: "DRAFT" as const,
      contract: {
        ...buildContract(CLEVIA_GOAL),
        contractVersion: 1,
      },
      blockedReasons: [],
      runnerState: null,
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
      lockedAt: null,
      projectId: "11111111-1111-4111-8111-111111111111",
      sourceCommitSha: "a10183eb66a20fa0df619233b3e85231d2c193d9",
    };

    const first = await applyDraftUpdate(
      base,
      {
        goal: CLEVIA_GOAL,
        acceptanceCriteria: [
          "Approved frontend baseline is initialized within the approved task scope.",
          "Protected paths must not be modified without explicit human approval.",
        ],
      },
      {},
      { incrementVersion: true },
    );

    expect(first.task.id).toBe(base.id);
    expect(first.task.sourceCommitSha).toBe(base.sourceCommitSha);
    expect(getContractVersion(first.task.contract)).toBe(2);
    expect(first.task.contract.contractHistory?.length).toBe(1);

    const second = await applyDraftUpdate(
      first.task,
      {
        goal: CLEVIA_GOAL,
        acceptanceCriteria: [
          "Approved frontend baseline is initialized within the approved task scope.",
          "Responsive shell, navigation, and dashboard use mock data only.",
          "Protected paths must not be modified without explicit human approval.",
        ],
      },
      {},
      { incrementVersion: true },
    );

    expect(second.task.id).toBe(base.id);
    expect(getContractVersion(second.task.contract)).toBe(3);
    expect(second.task.contract.contractHistory?.length).toBe(2);
  });

  test("updateDraftTask repository path keeps one task row across repeated edits", async () => {
    const repo = createDevTaskRepository();
    const userId = DEV_AUTH_BYPASS_USER_ID;

    const created = await repo.createTask({
      userId,
      goal: CLEVIA_GOAL,
    });

    expect(canUpdateDraft(created)).toBe(true);
    expect(created.status).toBe("DRAFT");

    const updated = await repo.updateDraftTask({
      id: created.id,
      userId,
      goal: created.goal,
      acceptanceCriteria: [
        "Approved frontend baseline is initialized within the approved task scope.",
        "Protected paths must not be modified without explicit human approval.",
      ],
    });
    expect(updated.id).toBe(created.id);
    expect(getContractVersion(updated.contract)).toBe(2);

    const updatedAgain = await repo.updateDraftTask({
      id: created.id,
      userId,
      goal: created.goal,
      acceptanceCriteria: [
        "Approved frontend baseline is initialized within the approved task scope.",
        "Responsive shell, navigation, and dashboard use mock data only.",
        "Protected paths must not be modified without explicit human approval.",
      ],
    });
    expect(updatedAgain.id).toBe(created.id);
    expect(getContractVersion(updatedAgain.contract)).toBe(3);

    const listed = await repo.listTasks(userId);
    expect(listed.filter((task) => task.id === created.id)).toHaveLength(1);
    expect(listed.filter((task) => task.goal === created.goal).length).toBe(1);

    await repo.resetForTests();
  });
});

describe("edit plan form wiring", () => {
  afterEach(async () => {
    await createDevTaskRepository().resetForTests();
  });

  test("task form uses updateDraftTask in edit mode instead of createTask", async () => {
    const source = await Bun.file(new URL("../../components/site/pages/task-form-page.tsx", import.meta.url)).text();
    expect(source).toContain("updateDraftTaskMutation.mutateAsync");
    expect(source).toContain('search: { tab: "contract" }');
    expect(source).toContain("canUpdateDraft(sourceTask)");
  });
});
