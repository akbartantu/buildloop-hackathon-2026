import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import {
  formatApprovalTypeLabel,
  formatWorkContractApprovalLabel,
  formatWorkContractStatusLabel,
} from "@/lib/lifecycle-presentations";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";

const KNOWN_ID_LEAKS = [
  "Belum dijalankan",
  "Tidak diperlukan",
  "lolos,",
  "gagal",
  "Perbaikan otomatis",
  "Belum disetujui",
  "Detail teknis untuk developer",
  "AUTO_APPROVED_BY_POLICY",
  "AUTO_APPROVED",
  "pending · pending",
];

function baseFailedTask(): TaskRecord {
  const contract = buildContract(PASS_DEMO_GOAL);
  return {
    id: "00000000-0000-4000-8000-000000000002",
    workspace: "buildloop-demo",
    goal: PASS_DEMO_GOAL,
    status: "FAILED",
    contract,
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("FAILED"),
      runnerInvoked: true,
      correctionCount: 2,
      filesChanged: 1,
      runId: "run-failed",
      orchestration: {
        phase: "FAILED",
        approvalType: "AUTO_APPROVED_BY_POLICY",
        correctionCount: 2,
        finalVerdict: "FAILED",
        workerInvoked: true,
        securityReviewInvoked: false,
        contracts: [
          {
            id: "wc-1",
            goal: "Update README",
            status: "failed",
            approvalState: "execution_complete",
          },
        ],
      },
      evidence: [
        { category: "acceptance", name: "a", status: "pass", summary: "ok" },
        { category: "typecheck", name: "t", status: "fail", summary: "Command failed" },
      ],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: new Date().toISOString(),
    projectId: null,
    sourceCommitSha: null,
  };
}

describe("orchestration and evidence i18n", () => {
  test("English lifecycle view contains no known Indonesian leaks", () => {
    const vm = buildTaskLifecycleViewModel(baseFailedTask(), "en");
    const serialized = JSON.stringify({
      summary: vm.plainLanguageSummary,
      checks: vm.checks.friendlySummary,
      correction: vm.correction.userSummary,
      approval: vm.approval.label,
      approvalDesc: vm.approval.description,
      delivery: vm.deliveryLabels,
      steps: vm.orchestrationSteps,
    });
    for (const leak of KNOWN_ID_LEAKS) {
      expect(serialized).not.toContain(leak);
    }
    expect(vm.checks.friendlySummary).toMatch(/passed|failed|checks/i);
    expect(vm.correction.userSummary).toContain("Automatic correction");
  });

  test("Indonesian lifecycle view resolves localized copy", () => {
    const vm = buildTaskLifecycleViewModel(baseFailedTask(), "id");
    expect(vm.correction.userSummary).toContain("Perbaikan otomatis");
    expect(vm.deliveryLabels.commit).toContain("Belum disetujui");
  });

  test("raw policy enums map to human-readable labels", () => {
    expect(formatApprovalTypeLabel("AUTO_APPROVED_BY_POLICY", "en")).toBe(
      "Automatically approved by policy",
    );
    expect(formatApprovalTypeLabel("AUTO_APPROVED_BY_POLICY", "id")).toBe(
      "Disetujui otomatis oleh kebijakan",
    );
    expect(formatWorkContractStatusLabel("failed", "en")).toBe("FAILED");
    expect(formatWorkContractApprovalLabel("execution_complete", "en")).toBe("Execution recorded");
  });

  test("work contract status reflects persisted orchestration state", () => {
    const vm = buildTaskLifecycleViewModel(baseFailedTask(), "en");
    const contract = baseFailedTask().runnerState?.orchestration?.contracts?.[0];
    expect(contract?.status).toBe("failed");
    expect(contract?.approvalState).toBe("execution_complete");
    expect(formatWorkContractStatusLabel(contract!.status, "en")).toBe("FAILED");
    expect(formatWorkContractApprovalLabel(contract!.approvalState, "en")).toBe("Execution recorded");
    expect(vm.implementationVerdict).toBe("FAILED");
  });
});
