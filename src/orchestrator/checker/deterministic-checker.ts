import { readFile } from "node:fs/promises";
import path from "node:path";

import { safeLogSummary } from "@/lib/redaction";
import { isOperationalWorkerError } from "../gemini/retry-policy";
import { isDocumentationOnlyScope } from "../contract/derive-task-contract";
import type { LockedContract } from "../contract/schema";
import type { CheckerEvidence, WorkerReport } from "../types";
import { PASS_DEMO_TARGET_RELATIVE } from "../scenarios/pass";
import { captureFileUnifiedDiff, isDependencyManifest } from "../workspace/git-workspace";
import { runSafeCommand } from "./command-runner";
import { detectProjectCommands, partitionContractCommandsByApplicability, commandSkipReason } from "./project-commands";
import {
  assessContentDestructiveChange,
  assessDiffDestructiveChange,
  contractExpectsBoundedAdditiveEdit,
  shouldFlagUnexpectedDestructiveChange,
  UNEXPECTED_DESTRUCTIVE_CHANGE_SUMMARY,
} from "./unexpected-destructive-change";

export type CheckerInput = {
  runId: string;
  attemptNumber: number;
  contract: LockedContract;
  sandboxRoot: string;
  workspaceRoot: string;
  workerReport: WorkerReport | null;
  sourceRevisionAtStart: string;
  sourceRevisionNow: string;
  skipCommandExecution?: boolean;
  /** Baseline commit for git diff comparison in bounded-edit guard. */
  baselineSha?: string;
  /** Fixture baseline file contents keyed by relative path (tests and non-git sandboxes). */
  baselineFileContents?: Record<string, string>;
};

export type CheckerResult = {
  evidence: CheckerEvidence[];
  blocked: boolean;
  failed: boolean;
  passed: boolean;
  operationalFailure?: boolean;
};

function globMatch(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (pattern.includes("*")) {
    const regex = new RegExp(
      `^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
    );
    return regex.test(normalized);
  }
  return normalized === pattern;
}

function matchesProtected(filePath: string, protectedAreas: string[]): boolean {
  return protectedAreas.some((pattern) => globMatch(filePath, pattern));
}

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    normalized.includes(".test.") ||
    normalized.startsWith("tests/") ||
    normalized.endsWith("_test.ts")
  );
}

function contractAuthorizesTestChanges(contract: LockedContract): boolean {
  const scopeText = [...contract.inScope, contract.goal, ...contract.acceptanceCriteria]
    .join(" ")
    .toLowerCase();
  return /\btests?\b/.test(scopeText);
}

const CREDENTIAL_PATTERN =
  /\b(api[_-]?key|secret|password|token|credential|private key|service account)\b/i;

export class DeterministicChecker {
  async run(input: CheckerInput): Promise<CheckerResult> {
    const evidence: CheckerEvidence[] = [];
    const now = new Date().toISOString();
    let blocked = false;
    let failed = false;
    let operationalFailure = false;

    const push = (item: Omit<CheckerEvidence, "id" | "runId" | "attemptNumber" | "createdAt">) => {
      evidence.push({
        id: crypto.randomUUID(),
        runId: input.runId,
        attemptNumber: input.attemptNumber,
        createdAt: now,
        ...item,
      });
      if (item.status === "blocked") blocked = true;
      if (item.status === "fail") failed = true;
    };

    if (input.sourceRevisionAtStart !== input.sourceRevisionNow) {
      push({
        category: "manifest",
        name: "source_revision_consistency",
        status: "fail",
        summary: "Workspace manifest revision changed during run.",
        details: `start=${input.sourceRevisionAtStart} now=${input.sourceRevisionNow}`,
        affectedFiles: [],
        severity: "warning",
      });
    }

    const changedFiles = input.workerReport?.filesChanged ?? [];

    if (input.workerReport?.error) {
      if (input.workerReport.error.code === "PROTECTED_PATH_APPROVAL_REQUIRED") {
        // Governance approval pause — not a coding failure.
      } else {
      const workerMessage = input.workerReport.error.message;
      const workerCode = input.workerReport.error.code;
      const pathViolation = /out-of-scope or protected path/i.test(workerMessage);
      const operational =
        isOperationalWorkerError(workerCode, workerMessage) ||
        (workerCode === "WORKER_ERROR" && changedFiles.length === 0 && !pathViolation);
      if (operational) {
        operationalFailure = true;
        push({
          category: "worker",
          name: "worker_operational_error",
          status: "fail",
          summary: "Worker operational failure (API/service unavailable).",
          details: `${workerCode}: ${workerMessage}`,
          affectedFiles: changedFiles,
          severity: "critical",
        });
        return {
          evidence,
          blocked: false,
          failed: true,
          passed: false,
          operationalFailure: true,
        };
      }
      push({
        category: "worker",
        name: "worker_error",
        status: "fail",
        summary: pathViolation
          ? "Worker attempted changes outside the approved scope."
          : "Worker reported an execution error before producing file changes.",
        details: `${workerCode}: ${workerMessage}`,
        affectedFiles: changedFiles,
        severity: "error",
      });
      }
    }

    if (input.workerReport && changedFiles.length === 0 && !input.workerReport.error) {
      push({
        category: "worker",
        name: "zero_file_changes",
        status: "fail",
        summary: "Worker reported completion without changing any files.",
        details: input.workerReport.summary,
        affectedFiles: [],
        severity: "error",
      });
    }

    push({
      category: "scope",
      name: "worker_invocation",
      status: input.workerReport ? "pass" : "skipped",
      summary: input.workerReport ? "Worker report received." : "No worker report (preflight-only run).",
      details: input.workerReport?.summary ?? "Worker not invoked.",
      affectedFiles: changedFiles,
      severity: "info",
    });

    for (const file of changedFiles) {
      const allowed = input.contract.allowedPaths.some((pattern) => globMatch(file, pattern));
      push({
        category: "scope",
        name: `scope_${file}`,
        status: allowed ? "pass" : "fail",
        summary: allowed ? "Change within allowed paths." : "Change outside allowed paths.",
        details: `file=${file}`,
        affectedFiles: [file],
        severity: allowed ? "info" : "error",
      });

      const protectedHit = matchesProtected(file, input.contract.protectedAreas);
      if (protectedHit) {
        push({
          category: "protected_path",
          name: `protected_${file}`,
          status: "blocked",
          summary: "Protected path modified.",
          details: `file=${file}`,
          affectedFiles: [file],
          severity: "critical",
        });
      }

      if (isDependencyManifest(file)) {
        push({
          category: "dependency",
          name: `dependency_${file}`,
          status: "blocked",
          summary: "Dependency manifest changed — requires explicit approval.",
          details: `file=${file}`,
          affectedFiles: [file],
          severity: "critical",
        });
      }

      if (isTestFile(file) && !contractAuthorizesTestChanges(input.contract)) {
        push({
          category: "scope",
          name: `unauthorized_test_change_${file}`,
          status: "fail",
          summary: "Test file changed without explicit contract authorization.",
          details: `file=${file}`,
          affectedFiles: [file],
          severity: "error",
        });
      }
    }

    for (const file of changedFiles) {
      const absolute = path.join(input.sandboxRoot, file);
      let content = "";
      try {
        content = await readFile(absolute, "utf8");
      } catch {
        continue;
      }
      if (CREDENTIAL_PATTERN.test(content)) {
        push({
          category: "credential",
          name: `credential_pattern_${file}`,
          status: "blocked",
          summary: "Credential-like pattern detected in changed file.",
          details: `file=${file}`,
          affectedFiles: [file],
          severity: "critical",
        });
      }
    }

    if (changedFiles.length > 0 && contractExpectsBoundedAdditiveEdit(input.contract)) {
      await this.checkUnexpectedDestructiveChanges(input, changedFiles, push);
    }

    if (changedFiles.includes(PASS_DEMO_TARGET_RELATIVE)) {
      await this.checkPassAcceptance(input, push);
    }

    for (const criterion of input.contract.acceptanceCriteria) {
      if (criterion.toLowerCase().includes("protected path")) {
        const anyProtected = changedFiles.some((file) =>
          matchesProtected(file, input.contract.protectedAreas),
        );
        push({
          category: "acceptance",
          name: "protected_path_unchanged",
          status: anyProtected ? "fail" : "pass",
          summary: anyProtected
            ? "Protected path changed."
            : "No protected path changes detected.",
          details: criterion,
          affectedFiles: changedFiles,
          severity: anyProtected ? "error" : "info",
        });
      }
    }

    if (
      isDocumentationOnlyScope(input.contract.allowedPaths) &&
      changedFiles.length > 0 &&
      !input.workerReport?.error
    ) {
      await this.checkDocumentationAcceptance(input, changedFiles, push);
    }

    await this.runRequiredCommands(input, push);

    const hasFailure = evidence.some((item) => item.status === "fail" || item.status === "blocked");
    const passed = !blocked && !hasFailure && evidence.some((item) => item.status === "pass");

    return {
      evidence,
      blocked,
      failed: hasFailure && !blocked,
      passed,
      operationalFailure,
    };
  }

  private async checkDocumentationAcceptance(
    input: CheckerInput,
    changedFiles: string[],
    push: (item: Omit<CheckerEvidence, "id" | "runId" | "attemptNumber" | "createdAt">) => void,
  ) {
    const onlyDocPaths = changedFiles.every((file) =>
      input.contract.allowedPaths.some((pattern) => globMatch(file, pattern)),
    );
    push({
      category: "acceptance",
      name: "documentation_scope_only",
      status: onlyDocPaths ? "pass" : "fail",
      summary: onlyDocPaths
        ? "Only approved documentation paths were modified."
        : "Changes include files outside approved documentation scope.",
      details: input.contract.goal,
      affectedFiles: changedFiles,
      severity: onlyDocPaths ? "info" : "error",
    });

    if (changedFiles.includes("README.md")) {
      const absolute = path.join(input.sandboxRoot, "README.md");
      let content = "";
      try {
        content = await readFile(absolute, "utf8");
      } catch {
        push({
          category: "acceptance",
          name: "readme_present",
          status: "fail",
          summary: "README.md is missing after worker execution.",
          details: input.contract.goal,
          affectedFiles: ["README.md"],
          severity: "error",
        });
        return;
      }

      const goal = input.contract.goal.toLowerCase();
      const normalized = content.toLowerCase();
      const mentionsDelivery =
        normalized.includes("governed") ||
        normalized.includes("autonomous") ||
        normalized.includes("software delivery") ||
        normalized.includes("buildloop");
      const goalKeyword =
        goal.includes("readme") || goal.includes("subtitle") || goal.includes("delivery");
      push({
        category: "acceptance",
        name: "readme_goal_reflected",
        status: mentionsDelivery || !goalKeyword ? "pass" : "fail",
        summary: mentionsDelivery
          ? "README reflects the requested documentation change."
          : "README does not appear to include the requested subtitle change.",
        details: input.contract.goal,
        affectedFiles: ["README.md"],
        severity: mentionsDelivery ? "info" : "error",
      });
    }
  }

  private async runRequiredCommands(
    input: CheckerInput,
    push: (item: Omit<CheckerEvidence, "id" | "runId" | "attemptNumber" | "createdAt">) => void,
  ) {
    if (!input.workerReport || input.workerReport.error) {
      return;
    }
    if (input.skipCommandExecution || process.env["BUILDLOOP_SKIP_COMMAND_CHECKS"] === "1") {
      push({
        category: "command",
        name: "required_commands",
        status: "skipped",
        summary: "Command execution skipped for demo/fixture run.",
        details: "Checker command execution disabled for this scenario.",
        affectedFiles: [],
        severity: "info",
      });
      return;
    }

    const detected = await detectProjectCommands(input.sandboxRoot);
    const { applicable: commands, skipped } = partitionContractCommandsByApplicability(
      input.contract.allowedCommands,
      detected,
    );

    for (const command of skipped) {
      const category = categorizeCommand(command);
      push({
        category,
        name: `${category}_${command.replace(/\s+/g, "_")}_not_applicable`,
        status: "skipped",
        summary: `Command not applicable for this workspace: ${command}`,
        details: commandSkipReason(command, detected),
        command,
        affectedFiles: [],
        severity: "info",
      });
    }

    if (commands.length === 0) {
      if (skipped.length === 0) {
        push({
          category: "command",
          name: "required_commands",
          status: "skipped",
          summary: "No required commands configured for this contract.",
          details: "Checker skipped command execution.",
          affectedFiles: [],
          severity: "info",
        });
      }
      return;
    }

    for (const command of commands) {
      const result = await runSafeCommand(command, {
        cwd: input.sandboxRoot,
        contractAllowlist: input.contract.allowedCommands,
        timeoutMs: process.env["BUILDLOOP_TEST_COMMAND_TIMEOUT_MS"]
          ? Number(process.env["BUILDLOOP_TEST_COMMAND_TIMEOUT_MS"])
          : 120_000,
      });

      const category = categorizeCommand(command);
      const evidenceItem: Omit<CheckerEvidence, "id" | "runId" | "attemptNumber" | "createdAt"> = {
        category,
        name: `${category}_${command.replace(/\s+/g, "_")}`,
        status: result.success ? "pass" : "fail",
        summary: result.success
          ? `Command succeeded: ${command}`
          : result.timedOut
            ? `Command timed out: ${command}`
            : `Command failed: ${command}`,
        details: safeLogSummary(
          `exit=${result.exitCode ?? "null"} stdout=${result.stdoutSummary} stderr=${result.stderrSummary}`,
          1000,
        ),
        command,
        affectedFiles: [],
        severity: result.success ? "info" : "error",
      };
      if (result.exitCode !== null) {
        evidenceItem.exitCode = result.exitCode;
      }
      push(evidenceItem);
    }
  }

  private async checkUnexpectedDestructiveChanges(
    input: CheckerInput,
    changedFiles: string[],
    push: (item: Omit<CheckerEvidence, "id" | "runId" | "attemptNumber" | "createdAt">) => void,
  ) {
    for (const file of changedFiles) {
      const absolute = path.join(input.sandboxRoot, file);
      let updatedContent = "";
      try {
        updatedContent = await readFile(absolute, "utf8");
      } catch {
        continue;
      }

      let assessment = null;
      const baselineFromFixture = input.baselineFileContents?.[file];
      if (baselineFromFixture !== undefined) {
        assessment = assessContentDestructiveChange(baselineFromFixture, updatedContent);
      } else if (input.baselineSha) {
        try {
          const { diff, isBinary } = await captureFileUnifiedDiff(
            input.sandboxRoot,
            input.baselineSha,
            file,
          );
          if (isBinary || !diff.trim()) {
            continue;
          }
          assessment = assessDiffDestructiveChange(diff);
        } catch {
          continue;
        }
      } else {
        continue;
      }

      if (shouldFlagUnexpectedDestructiveChange(input.contract, assessment)) {
        push({
          category: "acceptance",
          name: `unexpected_destructive_change_${file}`,
          status: "fail",
          summary: UNEXPECTED_DESTRUCTIVE_CHANGE_SUMMARY,
          details: `file=${file} removed=${assessment.removed} added=${assessment.added} retained=${Math.round(assessment.retainedLineRatio * 100)}%`,
          affectedFiles: [file],
          severity: "error",
        });
      }
    }
  }

  private async checkPassAcceptance(
    input: CheckerInput,
    push: (item: Omit<CheckerEvidence, "id" | "runId" | "attemptNumber" | "createdAt">) => void,
  ) {
    const absolute = path.join(input.sandboxRoot, PASS_DEMO_TARGET_RELATIVE);
    let content = "";
    try {
      content = await readFile(absolute, "utf8");
    } catch {
      push({
        category: "acceptance",
        name: "workspace_copy_present",
        status: "fail",
        summary: "Workspace copy file missing in sandbox.",
        details: PASS_DEMO_TARGET_RELATIVE,
        affectedFiles: [],
        severity: "error",
      });
      return;
    }

    const workspaceCopy = extractWorkspaceCopy(content);
    if (!workspaceCopy) {
      push({
        category: "acceptance",
        name: "workspace_copy_present",
        status: "fail",
        summary: "Workspace explanation paragraph not found.",
        details: PASS_DEMO_TARGET_RELATIVE,
        affectedFiles: [PASS_DEMO_TARGET_RELATIVE],
        severity: "error",
      });
      return;
    }

    const hasSandbox = /sandbox/i.test(workspaceCopy);
    push({
      category: "acceptance",
      name: "workspace_mentions_sandbox",
      status: hasSandbox ? "pass" : "fail",
      summary: hasSandbox
        ? "Workspace copy mentions sandbox."
        : "Workspace copy does not mention sandbox.",
      details: workspaceCopy,
      affectedFiles: [PASS_DEMO_TARGET_RELATIVE],
      severity: hasSandbox ? "info" : "error",
    });

    const hasApproval = /approval|persetujuan/i.test(workspaceCopy);
    push({
      category: "acceptance",
      name: "workspace_mentions_approval",
      status: hasApproval ? "pass" : "fail",
      summary: hasApproval
        ? "Workspace copy mentions approval for sensitive actions."
        : "Workspace copy missing approval guidance.",
      details: workspaceCopy,
      affectedFiles: [PASS_DEMO_TARGET_RELATIVE],
      severity: hasApproval ? "info" : "error",
    });
  }
}

export function extractWorkspaceCopy(content: string): string | null {
  const patterns = [
    /<p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">\s*([\s\S]*?)\s*<\/p>/,
    /<p className="mt-5 max-w-2xl border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">\s*([\s\S]*?)\s*<\/p>/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match?.[1]) {
      return match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  }

  const commentMatch = /<!-- workspace-copy -->\s*([\s\S]*?)(?:\n|$)/.exec(content);
  return commentMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function categorizeCommand(command: string): CheckerEvidence["category"] {
  if (/typecheck/i.test(command)) return "typecheck";
  if (/\btest\b/i.test(command)) return "test";
  if (/lint/i.test(command)) return "command";
  if (/build/i.test(command)) return "build";
  return "command";
}
