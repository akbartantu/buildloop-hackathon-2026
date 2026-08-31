import { describe, expect, test } from "bun:test";

import { detectSensitiveIntent } from "@/lib/sensitive-intent";
import { BLOCKED_DEMO_GOAL } from "@/orchestrator/scenarios/pass";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import { buildEvidenceSummaryViewModel } from "@/lib/evidence-summary";
import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import {
  containsIndonesianBlockedExplanation,
  formatBlockedReasonExplanation,
  formatBlockedReasonExplanationList,
  formatPrimaryBlockedExplanation,
} from "@/lib/blocked-reason-presentation";

const BLOCKED_PRODUCTION_GOAL =
  "Add automatic production deployment, store credentials in environment variables, and run it on the main branch.";

function blockedTask(reasons = detectSensitiveIntent(BLOCKED_PRODUCTION_GOAL)): TaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000015",
    workspace: "buildloop-demo",
    goal: BLOCKED_PRODUCTION_GOAL,
    status: "BLOCKED",
    contract: buildContract(BLOCKED_PRODUCTION_GOAL),
    blockedReasons: reasons,
    runnerState: {
      ...zeroChangeRunnerState(
        "Runner tidak dipanggil karena task dihentikan oleh pre-flight check.",
      ),
      orchestration: { phase: "BLOCKED" },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: null,
    projectId: null,
    sourceCommitSha: null,
  };
}

describe("blocked reason presentation", () => {
  test("PRODUCTION_DEPLOYMENT is English in EN mode", () => {
    const reason = detectSensitiveIntent(BLOCKED_PRODUCTION_GOAL).find(
      (item) => item.rule === "PRODUCTION_DEPLOYMENT",
    );
    expect(reason).toBeDefined();
    const explanation = formatBlockedReasonExplanation(reason!, "en");
    expect(explanation).toContain("deployment");
    expect(explanation).not.toContain("Task meminta");
    expect(containsIndonesianBlockedExplanation(explanation)).toBe(false);
  });

  test("PRODUCTION_DEPLOYMENT is Indonesian in ID mode", () => {
    const reason = detectSensitiveIntent(BLOCKED_PRODUCTION_GOAL).find(
      (item) => item.rule === "PRODUCTION_DEPLOYMENT",
    );
    const explanation = formatBlockedReasonExplanation(reason!, "id");
    expect(explanation).toContain("Task meminta deployment");
  });

  test("CREDENTIAL_HANDLING is English in EN mode", () => {
    const reason = detectSensitiveIntent(BLOCKED_PRODUCTION_GOAL).find(
      (item) => item.rule === "CREDENTIAL_HANDLING",
    );
    expect(reason).toBeDefined();
    const explanation = formatBlockedReasonExplanation(reason!, "en");
    expect(explanation.toLowerCase()).toContain("credential");
    expect(containsIndonesianBlockedExplanation(explanation)).toBe(false);
  });

  test("CREDENTIAL_HANDLING is Indonesian in ID mode", () => {
    const reason = detectSensitiveIntent(BLOCKED_PRODUCTION_GOAL).find(
      (item) => item.rule === "CREDENTIAL_HANDLING",
    );
    const explanation = formatBlockedReasonExplanation(reason!, "id");
    expect(explanation).toContain("credential atau secret");
  });

  test("MAIN_BRANCH_WRITE is English in EN mode", () => {
    const reason = detectSensitiveIntent(BLOCKED_PRODUCTION_GOAL).find(
      (item) => item.rule === "MAIN_BRANCH_WRITE",
    );
    expect(reason).toBeDefined();
    const explanation = formatBlockedReasonExplanation(reason!, "en");
    expect(explanation.toLowerCase()).toContain("main branch");
    expect(containsIndonesianBlockedExplanation(explanation)).toBe(false);
  });

  test("MAIN_BRANCH_WRITE is Indonesian in ID mode", () => {
    const reason = detectSensitiveIntent(BLOCKED_PRODUCTION_GOAL).find(
      (item) => item.rule === "MAIN_BRANCH_WRITE",
    );
    const explanation = formatBlockedReasonExplanation(reason!, "id");
    expect(explanation).toContain("branch utama");
  });

  test("multiple blocked reasons localize every list item in EN", () => {
    const reasons = detectSensitiveIntent(BLOCKED_PRODUCTION_GOAL);
    expect(reasons.length).toBeGreaterThan(1);

    const localized = formatBlockedReasonExplanationList(reasons, "en");
    expect(localized.length).toBe(reasons.length);
    for (const line of localized) {
      expect(containsIndonesianBlockedExplanation(line)).toBe(false);
    }
  });

  test("English lifecycle and evidence views contain no Indonesian blocked leaks", () => {
    const task = blockedTask();
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const evidence = buildEvidenceSummaryViewModel(task, lifecycle, "en");

    const serialized = JSON.stringify({
      summary: lifecycle.plainLanguageSummary,
      orchestration: lifecycle.orchestrationUserSummary,
      intro: evidence?.intro,
      whatFailed: evidence?.whatFailed,
      reasons: formatBlockedReasonExplanationList(task.blockedReasons, "en"),
      primary: formatPrimaryBlockedExplanation(task.blockedReasons, "en"),
    });

    expect(containsIndonesianBlockedExplanation(serialized)).toBe(false);
    expect(serialized).not.toContain("Task meminta");
    expect(serialized).not.toContain("Deployment tidak pernah");
  });

  test("blocked demo goal stays fully Indonesian in ID mode", () => {
    const reasons = detectSensitiveIntent(BLOCKED_DEMO_GOAL);
    const localized = formatBlockedReasonExplanationList(reasons, "id");
    expect(localized.some((line) => line.includes("Task meminta"))).toBe(true);
  });
});
