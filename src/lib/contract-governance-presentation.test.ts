import { describe, expect, test } from "bun:test";

import { buildContract, PROTECTED_PATHS, REQUIRED_CHECKS, ALLOWED_ACTIONS, zeroChangeRunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import {
  buildContractGovernanceRows,
  formatContractGovernanceDisplayValue,
  formatContractGovernanceLabel,
} from "@/lib/contract-governance-presentation";
import {
  deliveryStripStepKeys,
  deliveryStripUsesSingleContinuousRow,
} from "@/components/site/human-gated-delivery-strip";
import { buildHumanGatedDeliveryStrip } from "@/lib/run-clarity-presentation";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import { PASS_DEMO_GOAL } from "@/orchestrator/scenarios/pass";

describe("contract governance presentation", () => {
  test("Indonesian labels are localized", () => {
    expect(formatContractGovernanceLabel("protectedPaths", "id")).toBe("Path yang dilindungi");
    expect(formatContractGovernanceLabel("requiredChecks", "id")).toBe("Pemeriksaan wajib");
    expect(formatContractGovernanceLabel("allowedActions", "id")).toBe("Tindakan yang diizinkan");
  });

  test("English locale remains English", () => {
    expect(formatContractGovernanceLabel("protectedPaths", "en")).toBe("Protected paths");
    expect(formatContractGovernanceLabel("requiredChecks", "en")).toBe("Required checks");
    expect(formatContractGovernanceLabel("allowedActions", "en")).toBe("Allowed actions");
    expect(formatContractGovernanceDisplayValue("typecheck", "en")).toBe("Project type check");
  });

  test("technical filenames and paths remain literal", () => {
    const contract = buildContract(PASS_DEMO_GOAL);
    const rows = buildContractGovernanceRows(contract, "id");
    expect(rows[0]?.value).toContain("package.json");
    expect(rows[0]?.value).toContain(".env*");
    expect(formatContractGovernanceDisplayValue("src/orchestrator/**", "id")).toBe("src/orchestrator/**");
  });

  test("technical command identifiers are not incorrectly translated", () => {
    expect(formatContractGovernanceDisplayValue("bun run typecheck", "id")).toBe("bun run typecheck");
    expect(formatContractGovernanceDisplayValue("typecheck", "id")).toBe("Validasi tipe proyek");
    expect(formatContractGovernanceDisplayValue("test yang relevan", "id")).toBe(
      "Pengujian otomatis yang relevan",
    );
    expect(formatContractGovernanceDisplayValue("protected-path check", "id")).toBe(
      "Pemeriksaan path terlindungi",
    );
  });

  test("default contract rows localize required checks and allowed actions in Indonesian", () => {
    const contract = buildContract(PASS_DEMO_GOAL);
    const rows = buildContractGovernanceRows(contract, "id");
    expect(rows[1]?.value).toContain("Validasi tipe proyek");
    expect(rows[1]?.value).toContain("Pengujian otomatis yang relevan");
    expect(rows[1]?.value).toContain("Pemeriksaan path terlindungi");
    expect(rows[2]?.value).toContain("Membaca file project");
  });

  test("canonical governance constants remain available for backend use", () => {
    expect(REQUIRED_CHECKS).toContain("typecheck");
    expect(ALLOWED_ACTIONS.length).toBeGreaterThan(0);
    expect(PROTECTED_PATHS).toContain("package.json");
  });
});

describe("human-gated delivery strip layout", () => {
  test("delivery strip retains all six stages in correct order", () => {
    const task: TaskRecord = {
      id: "00000000-0000-4000-8000-000000000020",
      workspace: "buildloop-demo",
      goal: PASS_DEMO_GOAL,
      status: "AWAITING_APPROVAL",
      contract: buildContract(PASS_DEMO_GOAL),
      blockedReasons: [],
      runnerState: {
        ...zeroChangeRunnerState("PASS"),
        runnerInvoked: true,
        evidence: [{ category: "scope", name: "worker_invocation", status: "pass", summary: "ok" }],
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
      lockedAt: "2026-01-01T00:00:30.000Z",
      projectId: null,
      sourceCommitSha: null,
    };
    const lifecycle = buildTaskLifecycleViewModel(task, "en");
    const steps = buildHumanGatedDeliveryStrip(task, lifecycle, "en");
    expect(deliveryStripStepKeys(steps)).toEqual([
      "task",
      "approval",
      "worker",
      "checker",
      "verdict",
      "delivery",
    ]);
  });

  test("delivery strip uses a single continuous row with horizontal scroll", () => {
    expect(deliveryStripUsesSingleContinuousRow()).toBe(true);
  });
});
