import { describe, expect, test } from "bun:test";

import { createDevTaskRepository, devTaskUserId } from "@/lib/tasks/dev-task-repository";
import { detectSourceCommitDrift } from "@/lib/task-lifecycle-ops";

describe("task contract refresh lifecycle", () => {
  test("refresh updates source commit and unlocks contract", async () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
    let projectSha = "abc1234567890abcdef1234567890abcdef123456";
    const repo = createDevTaskRepository({
      getProject: async () => ({
        repositoryUrl: "https://github.com/owner/repo",
        connectedCommitSha: projectSha,
      }),
    });

    const userId = devTaskUserId();
    const created = await repo.createTask({
      userId,
      goal: "Update README subtitle to mention governed autonomous software delivery.",
      projectId,
    });

    expect(created.sourceCommitSha).toBe(projectSha);
    if (created.status === "CONTRACT_READY" || created.status === "DRAFT") {
      await repo.lockContract({ id: created.id, userId });
    }

    projectSha = "def4567890abcdef4567890abcdef4567890abcd";
    expect(detectSourceCommitDrift(created, projectSha)).toBe(true);

    const refreshed = await repo.refreshContract({ id: created.id, userId });
    expect(refreshed.sourceCommitSha).toBe(projectSha);
    expect(refreshed.lockedAt).toBeNull();
    expect(refreshed.status).toBe("CONTRACT_READY");
  });
});
