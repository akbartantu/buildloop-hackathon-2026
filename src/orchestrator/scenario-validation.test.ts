import { describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BootstrapOrchestrator } from "@/orchestrator/bootstrap/orchestrator";
import { planAndEvaluateTask } from "@/lib/task-planning";
import { runSecurityReview } from "@/orchestrator/agents/security-reviewer/reviewer";
import { evaluatePolicy } from "@/orchestrator/policy/evaluator";
import { resolveProjectPolicy } from "@/orchestrator/policy/policy-schema";

const workspaceRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

describe("Local scenario validation", () => {
  test("Scenario A — autonomous safe work auto-approved", async () => {
    const planned = await planAndEvaluateTask({
      goal: "Update README subtitle to mention governed autonomous software delivery.",
      taskId: "11111111-1111-1111-1111-111111111111",
      workspaceRoot,
    });
    expect(planned.status).toBe("APPROVED_FOR_EXECUTION");
    expect(planned.approvalType).toBe("AUTO_APPROVED_BY_POLICY");
    expect(planned.runnerState.orchestration?.phase).toBe("AUTO_APPROVED");
  });

  test("Scenario B — self-correction via pass demo", async () => {
    const orchestrator = new BootstrapOrchestrator({
      workspaceRoot,
      allowDirtyWorkspace: true,
    });
    const result = await orchestrator.runPassDemo();
    expect(result.run.counters.workerCalls).toBeGreaterThan(0);
    expect(result.run.counters.correctionCount).toBe(1);
    expect(result.run.verdict).toBe("PASS");
  }, 120_000);

  test("Scenario C — security review for auth changes", () => {
    const review = runSecurityReview({
      runId: "scenario-c",
      attemptNumber: 1,
      goal: "Build authentication sign in flow",
      changedFiles: ["src/lib/auth/signin.ts"],
    });
    expect(review.invoked).toBe(true);
    expect(review.evidence.length).toBeGreaterThan(0);
  });

  test("Scenario D — human escalation for dependency change", () => {
    const policy = resolveProjectPolicy(null);
    const result = evaluatePolicy({
      goal: "Add lodash dependency to package.json",
      policy,
    });
    expect(result.decision).toBe("HUMAN_APPROVAL_REQUIRED");
  });

  test("Scenario E — BLOCKED credential action", async () => {
    const orchestrator = new BootstrapOrchestrator({
      workspaceRoot,
      allowDirtyWorkspace: true,
    });
    const result = await orchestrator.runBlockedDemo();
    expect(result.run.verdict).toBe("BLOCKED");
    expect(result.run.counters.workerCalls).toBe(0);
    expect(result.run.counters.filesChanged).toBe(0);
  }, 120_000);
});
