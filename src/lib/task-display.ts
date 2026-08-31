import type { TaskContract, TaskStatus } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { translate, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import { analyzeChecks } from "@/lib/task-lifecycle";

export function formatTaskRef(id: string): string {
  const year = new Date().getFullYear();
  const suffix = id.replace(/-/g, "").slice(-4).toUpperCase();
  return `BL-${year}-${suffix}`;
}

export function taskVersion(task: TaskRecord): string {
  return task.lockedAt ? "Version 1 · Locked" : "Version 1 · Draft";
}

export type DemoTab = "overview" | "contract" | "orchestration" | "evidence" | "approval";

export function suggestedTab(status: TaskStatus): DemoTab {
  if (status === "BLOCKED" || status === "FAILED") return "evidence";
  if (status === "CLOSED") return "approval";
  if (status === "AWAITING_APPROVAL" || status === "PASS") return "approval";
  if (
    ["RUNNING", "CHECKING", "NEEDS_CORRECTION", "INSPECTING"].includes(status)
  ) {
    return "orchestration";
  }
  if (status === "CONTRACT_READY" || status === "DRAFT") return "contract";
  return "overview";
}

export function nextActionLabel(status: TaskStatus, locale: Locale = DEFAULT_LOCALE): string {
  const key = `nextAction.${status}` as TranslationKey;
  const translated = translate(locale, key);
  if (translated !== key) {
    return translated;
  }
  return translate(locale, "nextAction.default");
}

export function contractSections(contract: TaskContract, locale: Locale = DEFAULT_LOCALE) {
  return {
    goal: contract.goal,
    willDo: contract.inScope,
    doneWhen: contract.acceptanceCriteria,
    wontDo: contract.outOfScope,
    limits: [
      translate(locale, "taskDetail.contractLimits.maxCorrections", { count: contract.maxAttempts }),
      translate(locale, "taskDetail.contractLimits.stopSensitive"),
      translate(locale, "taskDetail.contractLimits.sandboxUntilApproval"),
    ],
    sourcesUsed: contract.sourcesUsed ?? [],
    clarification: contract.clarification,
    planningSummary: contract.planningSummary,
  };
}

export function orchestrationPhase(status: TaskStatus): number {
  const phases: Record<string, number> = {
    APPROVED_FOR_EXECUTION: 0,
    INSPECTING: 1,
    RUNNING: 2,
    CHECKING: 3,
    NEEDS_CORRECTION: 2,
    PASS: 4,
    AWAITING_APPROVAL: 4,
    FAILED: 4,
    BLOCKED: 1,
  };
  return phases[status] ?? 0;
}

export const ORCHESTRATION_STEPS = [
  { key: "planning", label: "Planning", detail: "Planner decomposes goal into contracts" },
  { key: "preflight", label: "Preflight", detail: "Policy engine evaluates contract" },
  { key: "worker", label: "Worker", detail: "Implementation worker applies patch" },
  { key: "checker", label: "Checker", detail: "Functional checker verifies independently" },
  { key: "security", label: "Security Review", detail: "Security reviewer when triggered" },
  { key: "correction", label: "Correction", detail: "Bounded correction loop (max 2)" },
  { key: "decision", label: "Decision", detail: "Decision engine determines verdict" },
] as const;

export function countPassedChecks(task: TaskRecord): { passed: number; total: number } {
  const checks = analyzeChecks(task);
  return { passed: checks.passed, total: checks.total };
}
