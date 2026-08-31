import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { createApprovalRequest } from "../approval/model";
import { DeterministicChecker } from "../checker/deterministic-checker";
import type { LockedContract } from "../contract/schema";
import { decide } from "../decision/engine";
import { DecisionLog } from "../decision/log";
import { isOperationalWorkerError } from "../gemini/retry-policy";
import { computeManifestRevision } from "../manifest/revision";
import { runPreflight } from "../preflight/index";
import { evaluatePolicy } from "../policy/evaluator";
import { extractApprovedProtectedPaths } from "@/lib/protected-path-approval";
import { loadProjectGovernance } from "../policy/project-policy";
import { runSecurityReview } from "../agents/security-reviewer/reviewer";
import { defaultWorktreePath, runWorkspacePreflight } from "../preflight/workspace";
import {
  createIsolatedWorktree,
  removeWorktree,
  summarizeGitDiff,
  cleanupSandboxDirectory,
  publicGitHubRunClonePath,
} from "../workspace/git-workspace";
import { buildChangeArtifact } from "@/lib/change-artifact";
import type { ChangeArtifact } from "@/lib/change-artifact";
import { buildDeliveryHandoff } from "@/lib/delivery-artifact";
import type { DeliveryHandoff } from "@/lib/delivery-artifact";
import { getSandboxRoot } from "../workspace/sandbox-root";
import { isPublicGitHubRepoUrl, validatePublicGitHubUrl } from "@/lib/repository/public-github-url";
import {
  PASS_DEMO_ACCEPTANCE,
  PASS_DEMO_GOAL,
  BLOCKED_DEMO_GOAL,
} from "../scenarios/pass";
import { createDraftContract, lockContract } from "../contract/schema";
import {
  formatProtectedPathApprovalEvidenceDetails,
  type CheckerEvidence,
  type RunSnapshot,
  type RunStatus,
  type Verdict,
  type WorkerReport,
} from "../types";
import { countUniqueChangedFiles } from "../run-files";
import type { CodingWorker } from "../worker/types";
import { DemoPassWorker } from "../worker/demo-worker";
import { CheckpointStore } from "../persistence/store-factory";
import type { RuntimeRunStore } from "../persistence/store-factory";
import { isPersistableActiveRunStatus } from "@/lib/task-run-progress";

export type BootstrapRunResult = {
  run: RunSnapshot;
  evidence: CheckerEvidence[];
  workerReports: WorkerReport[];
  decisionLog: ReturnType<DecisionLog["list"]>;
  orchestrationEvidence: {
    securityReviewInvoked: boolean;
    securityFindings: Array<{ severity: string; finding: string; evidence: string }>;
    approvalType: string | null;
    policyDecision: string | null;
    plannerOutput: string | null;
  };
  changeArtifact?: ChangeArtifact | null;
  deliveryHandoff?: DeliveryHandoff | null;
};

export type RunStatusChangeHandler = (input: {
  status: RunStatus;
  runId: string;
  phase?: string;
}) => void | Promise<void>;

export type BootstrapOrchestratorOptions = {
  workspaceRoot: string;
  workspaceName?: string;
  allowDirtyWorkspace?: boolean;
  worker?: CodingWorker;
  store?: RuntimeRunStore;
  checkpointStore?: CheckpointStore;
  sourceCommitSha?: string;
  runSandboxId?: string;
  humanRevisionInstruction?: string;
  approvedProtectedPaths?: string[];
  onRunStatusChange?: RunStatusChangeHandler;
};

export class BootstrapOrchestrator {
  private readonly workspaceRoot: string;
  private readonly workspaceName: string;
  private readonly allowDirtyWorkspace: boolean;
  private readonly worker: CodingWorker;
  private readonly checker = new DeterministicChecker();
  private readonly decisionLog = new DecisionLog();
  private readonly checkpointStore: CheckpointStore;
  private readonly runtimeStore: RuntimeRunStore | null;
  private readonly sourceCommitSha?: string;
  private readonly runSandboxId?: string;
  private readonly humanRevisionInstruction?: string;
  private readonly approvedProtectedPaths: string[];
  private readonly onRunStatusChange?: RunStatusChangeHandler;

  constructor(options: BootstrapOrchestratorOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.workspaceName = options.workspaceName ?? "buildloop-demo";
    this.allowDirtyWorkspace = options.allowDirtyWorkspace ?? false;
    this.worker = options.worker ?? new DemoPassWorker();
    this.checkpointStore = options.checkpointStore ?? new CheckpointStore(options.workspaceRoot);
    this.runtimeStore = options.store ?? null;
    if (options.sourceCommitSha) {
      this.sourceCommitSha = options.sourceCommitSha;
    }
    if (options.runSandboxId) {
      this.runSandboxId = options.runSandboxId;
    }
    if (options.humanRevisionInstruction) {
      this.humanRevisionInstruction = options.humanRevisionInstruction;
    }
    this.approvedProtectedPaths = options.approvedProtectedPaths ?? [];
    if (options.onRunStatusChange) {
      this.onRunStatusChange = options.onRunStatusChange;
    }
  }

  private async notifyRunStatus(runId: string, status: RunStatus, phase?: string): Promise<void> {
    if (!this.onRunStatusChange || !isPersistableActiveRunStatus(status)) {
      return;
    }
    await this.onRunStatusChange({
      status,
      runId,
      ...(phase !== undefined ? { phase } : {}),
    });
  }

  async executeContractRun(contract: LockedContract): Promise<BootstrapRunResult> {
    return this.executeRun({ contract, scenario: "real" });
  }

  async runPassDemo(): Promise<BootstrapRunResult> {
    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: PASS_DEMO_GOAL,
        inScope: ["src/components/site/app-shell.tsx"],
        outOfScope: ["Deployment", "Credential", "Auth provider"],
        acceptanceCriteria: [...PASS_DEMO_ACCEPTANCE],
        allowedPaths: ["src/components/site/**"],
      }),
    );

    return this.executeRun({
      contract,
      scenario: "pass",
    });
  }

  async runBlockedDemo(): Promise<BootstrapRunResult> {
    return this.runBlockedDemoForGoal(BLOCKED_DEMO_GOAL);
  }

  async runBlockedDemoForGoal(goal: string): Promise<BootstrapRunResult> {
    const contract = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal,
        inScope: ["infrastructure/**"],
        outOfScope: ["Safe UI copy"],
        acceptanceCriteria: ["Should never execute."],
        allowedPaths: ["src/**"],
      }),
    );

    return this.executeRun({
      contract,
      scenario: "blocked",
    });
  }

  private async executeRun(input: {
    contract: LockedContract;
    scenario: "pass" | "blocked" | "real";
  }): Promise<BootstrapRunResult> {
    const runId = crypto.randomUUID();
    let sandboxRoot = isPublicGitHubRepoUrl(this.workspaceName)
      ? path.join(getSandboxRoot(this.workspaceRoot), "sandbox", runId)
      : path.join(this.workspaceRoot, ".buildloop", "sandbox", runId);
    let gitRepoPath: string | null = null;
    let runClonePath: string | null = null;
    await rm(sandboxRoot, { recursive: true, force: true });
    await mkdir(sandboxRoot, { recursive: true });

    const cloneOptions =
      isPublicGitHubRepoUrl(this.workspaceName) && this.sourceCommitSha
        ? {
            sandboxRoot: getSandboxRoot(this.workspaceRoot),
            runId: this.runSandboxId ?? runId,
            commitSha: this.sourceCommitSha,
          }
        : isPublicGitHubRepoUrl(this.workspaceName)
          ? {
              sandboxRoot: getSandboxRoot(this.workspaceRoot),
              runId: this.runSandboxId ?? runId,
            }
          : {};

    if (cloneOptions.runId && isPublicGitHubRepoUrl(this.workspaceName)) {
      const validated = validatePublicGitHubUrl(this.workspaceName);
      if (validated.ok) {
        runClonePath = publicGitHubRunClonePath(
          validated.normalizedUrl,
          getSandboxRoot(this.workspaceRoot),
          cloneOptions.runId,
        );
      }
    }

    const { revision: sourceRevisionAtStart } = await computeManifestRevision(this.workspaceRoot);
    let status: RunStatus = "APPROVED_FOR_EXECUTION";
    let verdict: Verdict = null;
    let verdictReason: string | null = null;
    let attemptNumber = 0;
    let correctionCount = 0;
    let workerCalls = 0;
    let checkerCalls = 0;
    const workerReports: WorkerReport[] = [];
    const evidence: CheckerEvidence[] = [];
    const startedAt = new Date().toISOString();
    const projectPolicy = await loadProjectGovernance(this.workspaceRoot);
    let securityReviewInvoked = false;
    let securityFindings: Array<{ severity: string; finding: string; evidence: string }> = [];

    status = "INSPECTING";
    await this.notifyRunStatus(runId, status, "preflight_start");
    const workspacePreflight = await runWorkspacePreflight({
      runId,
      contract: input.contract,
      workspaceRoot: this.workspaceRoot,
      workspaceName: this.workspaceName,
      allowDirty: this.allowDirtyWorkspace,
      cloneOptions,
    });
    evidence.push(...workspacePreflight.evidence);

    const preflight = runPreflight({ runId, contract: input.contract });
    evidence.push(...preflight.evidence);

    const preflightSafe = workspacePreflight.safe && preflight.safe;

    if (workspacePreflight.baseline) {
      gitRepoPath = workspacePreflight.baseline.repoPath;
      const worktreePath = defaultWorktreePath(this.workspaceRoot, runId, this.workspaceName);
      try {
        sandboxRoot = await createIsolatedWorktree(gitRepoPath, worktreePath, runId);
        workspacePreflight.baseline.worktreePath = sandboxRoot;
      } catch (error) {
        const message = error instanceof Error ? error.message : "worktree failed";
        evidence.push({
          id: crypto.randomUUID(),
          runId,
          attemptNumber: 0,
          category: "preflight",
          name: "worktree_setup_failed",
          status: "fail",
          summary: "Gagal membuat isolated Git worktree.",
          details: message,
          affectedFiles: [],
          severity: "error",
          createdAt: new Date().toISOString(),
        });
      }
    }

    let decision = decide({
      currentStatus: status,
      preflightSafe,
      checkerResult: null,
      correctionCount,
      maximumCorrections: input.contract.maximumCorrections,
      allowedCommands: input.contract.allowedCommands,
      sourceStale: false,
    });

    this.recordDecision(runId, attemptNumber, status, decision);
    await this.persistCheckpoint({
      runId,
      taskId: input.contract.taskId,
      status,
      attemptNumber,
      phase: "preflight_complete",
      evidence,
      workerCalls,
      checkerCalls,
      correctionCount,
      startedAt,
      contract: input.contract,
    });
    status = decision.nextStatus;
    verdict = decision.verdict;
    verdictReason = decision.verdictReason;
    await this.notifyRunStatus(runId, status, "preflight_complete");

    if (decision.verdict === "BLOCKED") {
      if (runClonePath) {
        await cleanupSandboxDirectory(runClonePath).catch(() => undefined);
      }
      return this.finish({
        runId,
        contract: input.contract,
        status,
        verdict,
        verdictReason,
        sourceRevisionAtStart,
        attemptNumber,
        workerCalls,
        checkerCalls,
        correctionCount,
        workerReports,
        evidence,
        startedAt,
        securityReviewInvoked: false,
        securityFindings: [],
      });
    }

    while (status === "RUNNING" || status === "NEEDS_CORRECTION" || decision.shouldInvokeWorker) {
      if (decision.shouldCorrect) {
        const lastReport = workerReports.at(-1);
        const lastOperational =
          lastReport?.error &&
          isOperationalWorkerError(lastReport.error.code, lastReport.error.message);
        if (!lastOperational) {
          correctionCount += 1;
        }
      }

      attemptNumber += 1;
      status = "RUNNING";
      await this.notifyRunStatus(runId, status, "worker_start");
      const isFirstWorkerCall = workerCalls === 0;
      workerCalls += 1;

      let workerReport: WorkerReport;
      try {
        workerReport = await this.worker.execute({
          contract: input.contract,
          sandboxRoot,
          workspaceRoot: this.workspaceRoot,
          sourceRevision: sourceRevisionAtStart,
          attemptNumber,
          approvedProtectedPaths: this.approvedProtectedPaths,
          ...(decision.correctionInstruction
            ? {
                correctionInstruction: decision.correctionInstruction,
                priorEvidenceSummary: decision.correctionInstruction,
              }
            : {}),
          ...(this.humanRevisionInstruction && isFirstWorkerCall
            ? { humanRevisionInstruction: this.humanRevisionInstruction }
            : {}),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown worker error";
        workerReport = {
          workerId: this.worker.id,
          attemptNumber,
          filesChanged: [],
          commandsRequested: [],
          commandsExecuted: [],
          summary: "Worker execution failed.",
          patchSummary: message,
          error: { code: "WORKER_CRASH", message },
        };
      }
      workerReports.push(workerReport);
      await this.persistCheckpoint({
        runId,
        taskId: input.contract.taskId,
        status: "RUNNING",
        attemptNumber,
        phase: "worker_complete",
        evidence,
        workerCalls,
        checkerCalls,
        correctionCount,
        startedAt,
        contract: input.contract,
        workerReports,
      });

      status = "CHECKING";
      await this.notifyRunStatus(runId, status, "checker_start");
      checkerCalls += 1;
      const { revision: sourceRevisionNow } = await computeManifestRevision(this.workspaceRoot);
      const checkerResult = await this.checker.run({
        runId,
        attemptNumber,
        contract: input.contract,
        sandboxRoot,
        workspaceRoot: this.workspaceRoot,
        workerReport,
        sourceRevisionAtStart,
        sourceRevisionNow,
        skipCommandExecution: input.scenario !== "real",
        ...(workspacePreflight.baseline?.headSha
          ? { baselineSha: workspacePreflight.baseline.headSha }
          : {}),
      });
      evidence.push(...checkerResult.evidence);

      const changedFiles = workerReport.filesChanged;
      let runtimeEscalation: "AWAITING_APPROVAL" | "BLOCKED" | null = null;

      if (workerReport.error?.code === "PROTECTED_PATH_APPROVAL_REQUIRED") {
        runtimeEscalation = "AWAITING_APPROVAL";
        const protectedPath = workerReport.error.path?.replace(/\\/g, "/");
        const protectedOperation = workerReport.error.operation;
        evidence.push({
          id: crypto.randomUUID(),
          runId,
          attemptNumber,
          category: "preflight",
          name: "protected_path_approval_required",
          status: "fail",
          summary: workerReport.error.message,
          details:
            protectedPath !== undefined
              ? formatProtectedPathApprovalEvidenceDetails({
                  path: protectedPath,
                  ...(protectedOperation ? { operation: protectedOperation } : {}),
                })
              : "PROTECTED_PATH_APPROVAL_REQUIRED",
          affectedFiles: protectedPath ? [protectedPath] : changedFiles,
          severity: "warning",
          createdAt: new Date().toISOString(),
        });
      }

      const runtimePolicy = evaluatePolicy({
        goal: input.contract.goal,
        changedFiles,
        policy: projectPolicy,
        approvalRequiredPaths: input.contract.approvalRequiredPaths ?? [],
        approvedProtectedPaths: this.approvedProtectedPaths,
      });

      if (runtimePolicy.decision === "BLOCKED") {
        runtimeEscalation = "BLOCKED";
        evidence.push({
          id: crypto.randomUUID(),
          runId,
          attemptNumber,
          category: "preflight",
          name: "runtime_escalation_blocked",
          status: "blocked",
          summary: runtimePolicy.reason,
          details: runtimePolicy.matchedRules.join(", "),
          affectedFiles: changedFiles,
          severity: "critical",
          createdAt: new Date().toISOString(),
        });
      } else if (runtimePolicy.decision === "HUMAN_APPROVAL_REQUIRED" && !runtimeEscalation) {
        runtimeEscalation = "AWAITING_APPROVAL";
        evidence.push({
          id: crypto.randomUUID(),
          runId,
          attemptNumber,
          category: "preflight",
          name: "runtime_escalation_approval",
          status: "fail",
          summary: runtimePolicy.reason,
          details: runtimePolicy.matchedRules.join(", "),
          affectedFiles: changedFiles,
          severity: "warning",
          createdAt: new Date().toISOString(),
        });
      }

      let securityReviewVerdict = null;
      if (checkerResult.passed && !runtimeEscalation) {
        const securityReview = runSecurityReview({
          runId,
          attemptNumber,
          goal: input.contract.goal,
          changedFiles,
          checkerSecurityFlag: runtimePolicy.requiresSecurityReview,
        });
        if (securityReview.invoked) {
          securityReviewInvoked = true;
          securityFindings = securityReview.findings.map((f) => ({
            severity: f.severity,
            finding: f.finding,
            evidence: f.evidence,
          }));
          evidence.push(...securityReview.evidence);
          securityReviewVerdict = securityReview.verdict;
        }
      }

      await this.persistCheckpoint({
        runId,
        taskId: input.contract.taskId,
        status: "CHECKING",
        attemptNumber,
        phase: "checker_complete",
        evidence,
        workerCalls,
        checkerCalls,
        correctionCount,
        startedAt,
        contract: input.contract,
        workerReports,
      });

      decision = decide({
        currentStatus: status,
        preflightSafe: true,
        checkerResult,
        correctionCount,
        maximumCorrections: input.contract.maximumCorrections,
        allowedCommands: input.contract.allowedCommands,
        sourceStale:
          !this.allowDirtyWorkspace && sourceRevisionAtStart !== sourceRevisionNow,
        securityReviewVerdict,
        runtimeEscalation,
      });

      this.recordDecision(runId, attemptNumber, status, decision);
      status = decision.nextStatus;
      verdict = decision.verdict;
      verdictReason = decision.verdictReason;
      await this.notifyRunStatus(runId, status, "decision_complete");

      if (checkerResult.operationalFailure) {
        break;
      }

      if (!decision.shouldInvokeWorker) break;
    }

    let changeArtifact: ChangeArtifact | null = null;
    let deliveryHandoff: DeliveryHandoff | null = null;

    if (gitRepoPath && workspacePreflight.baseline && sandboxRoot && workerCalls > 0) {
      try {
        const diff = await summarizeGitDiff(
          gitRepoPath,
          workspacePreflight.baseline.headSha,
          sandboxRoot,
        );
        evidence.push({
          id: crypto.randomUUID(),
          runId,
          attemptNumber,
          category: "scope",
          name: "git_diff_summary",
          status: diff.changedFiles.length > 0 ? "pass" : "skipped",
          summary: `${diff.changedFiles.length} file berubah dari baseline ${diff.baselineSha.slice(0, 8)}.`,
          details: JSON.stringify(diff),
          affectedFiles: diff.changedFiles,
          severity: "info",
          createdAt: new Date().toISOString(),
        });

        const lastWorkerFiles =
          workerReports.at(-1)?.filesChanged.map((file) => file.replace(/\\/g, "/")) ?? [];
        const gitChangedSet = new Set(diff.changedFiles);
        const unverifiedWorkerFiles = lastWorkerFiles.filter((file) => !gitChangedSet.has(file));
        let workspaceDiffVerified = true;

        if (verdict === "PASS" && lastWorkerFiles.length > 0) {
          if (diff.changedFiles.length === 0 || unverifiedWorkerFiles.length > 0) {
            workspaceDiffVerified = false;
            verdict = "FAILED";
            status = "FAILED";
            verdictReason =
              "Worker reported file changes that Git could not verify against the workspace baseline.";
            evidence.push({
              id: crypto.randomUUID(),
              runId,
              attemptNumber,
              category: "scope",
              name: "workspace_diff_verification",
              status: "fail",
              summary: "Worker-reported file changes could not be verified in the final workspace diff.",
              details: JSON.stringify({
                workerFiles: lastWorkerFiles,
                verifiedFiles: diff.changedFiles,
                unverifiedFiles: unverifiedWorkerFiles,
              }),
              affectedFiles: unverifiedWorkerFiles,
              severity: "error",
              createdAt: new Date().toISOString(),
            });
          }
        }

        if (diff.changedFiles.length > 0) {
          changeArtifact = await buildChangeArtifact({
            worktreePath: sandboxRoot,
            baselineSha: workspacePreflight.baseline.headSha,
            attemptNumber,
            allowedPaths: input.contract.allowedPaths,
            protectedPaths: input.contract.protectedAreas,
            diffSummary: diff,
            checkerVerified: verdict === "PASS",
          });

          if (verdict === "PASS" && workspaceDiffVerified) {
            deliveryHandoff = await buildDeliveryHandoff({
              taskId: input.contract.taskId,
              runId,
              contractGoal: input.contract.goal,
              worktreePath: sandboxRoot,
              baselineSha: workspacePreflight.baseline.headSha,
              attemptNumber,
              checkerVerdict: verdict,
              allowedPaths: input.contract.allowedPaths,
              protectedPaths: input.contract.protectedAreas,
              diffSummary: diff,
            });
          }
        }
      } catch {
        // Non-fatal — manifest revision remains authoritative for non-git workspaces.
      }
    }

    if (gitRepoPath && workspacePreflight.baseline?.worktreePath) {
      await removeWorktree(gitRepoPath, workspacePreflight.baseline.worktreePath).catch(() => undefined);
    }

    if (runClonePath) {
      await cleanupSandboxDirectory(runClonePath).catch(() => undefined);
    }

    return this.finish({
      runId,
      contract: input.contract,
      status,
      verdict,
      verdictReason,
      sourceRevisionAtStart,
      attemptNumber,
      workerCalls,
      checkerCalls,
      correctionCount,
      workerReports,
      evidence,
      startedAt,
      securityReviewInvoked,
      securityFindings,
      changeArtifact,
      deliveryHandoff,
    });
  }

  private async persistCheckpoint(input: {
    runId: string;
    taskId: string;
    status: string;
    attemptNumber: number;
    phase: string;
    evidence: CheckerEvidence[];
    workerCalls: number;
    checkerCalls: number;
    correctionCount: number;
    startedAt: string;
    contract: LockedContract;
    workerReports?: WorkerReport[];
  }) {
    await this.checkpointStore.save({
      runId: input.runId,
      taskId: input.taskId,
      status: input.status,
      attemptNumber: input.attemptNumber,
      phase: input.phase,
      evidenceCount: input.evidence.length,
      workerCalls: input.workerCalls,
      checkerCalls: input.checkerCalls,
      correctionCount: input.correctionCount,
      updatedAt: new Date().toISOString(),
      payload: {
        evidence: input.evidence,
        workerReports: input.workerReports ?? [],
        decisionLog: this.decisionLog.list(input.runId),
        run: {
          id: input.runId,
          taskId: input.taskId,
          contractId: input.contract.id,
          contractVersion: input.contract.version,
          status: input.status as RunStatus,
          verdict: null,
          verdictReason: null,
          sourceRevision: "",
          workerId: this.worker.id,
          attemptNumber: input.attemptNumber,
          counters: {
            workerCalls: input.workerCalls,
            checkerCalls: input.checkerCalls,
            correctionCount: input.correctionCount,
            filesChanged: countUniqueChangedFiles(input.workerReports ?? []),
            commandsExecuted: (input.workerReports ?? []).flatMap((r) => r.commandsExecuted).length,
          },
          startedAt: input.startedAt,
          completedAt: null,
        },
      },
    });
  }

  private recordDecision(
    runId: string,
    attemptNumber: number,
    previousStatus: RunStatus,
    decision: ReturnType<typeof decide>,
  ) {
    this.decisionLog.createEntry({
      runId,
      attemptNumber,
      previousStatus,
      nextStatus: decision.nextStatus,
      verdict: decision.verdict,
      rule: decision.rule,
      evidenceIds: [],
      summary: decision.verdictReason ?? decision.rule,
    });
  }

  private finish(input: {
    runId: string;
    contract: LockedContract;
    status: RunStatus;
    verdict: Verdict;
    verdictReason: string | null;
    sourceRevisionAtStart: string;
    attemptNumber: number;
    workerCalls: number;
    checkerCalls: number;
    correctionCount: number;
    workerReports: WorkerReport[];
    evidence: CheckerEvidence[];
    startedAt: string;
    securityReviewInvoked: boolean;
    securityFindings: Array<{ severity: string; finding: string; evidence: string }>;
    changeArtifact?: ChangeArtifact | null;
    deliveryHandoff?: DeliveryHandoff | null;
  }): BootstrapRunResult {
    const filesChanged = countUniqueChangedFiles(input.workerReports);
    const commandsExecuted = input.workerReports.flatMap((report) => report.commandsExecuted).length;

    const run: RunSnapshot = {
      id: input.runId,
      taskId: input.contract.taskId,
      contractId: input.contract.id,
      contractVersion: input.contract.version,
      status: input.status,
      verdict: input.verdict,
      verdictReason: input.verdictReason,
      sourceRevision: input.sourceRevisionAtStart,
      workerId: this.worker.id,
      attemptNumber: input.attemptNumber,
      counters: {
        workerCalls: input.workerCalls,
        checkerCalls: input.checkerCalls,
        correctionCount: input.correctionCount,
        filesChanged,
        commandsExecuted,
      },
      startedAt: input.startedAt,
      completedAt: new Date().toISOString(),
    };

    if (input.status === "AWAITING_APPROVAL" && input.verdict === "PASS") {
      this.decisionLog.createEntry({
        runId: input.runId,
        attemptNumber: input.attemptNumber,
        previousStatus: input.status,
        nextStatus: "AWAITING_APPROVAL",
        verdict: "PASS",
        rule: "AWAITING_HUMAN_APPROVAL",
        evidenceIds: [],
        summary: "Commit, push, merge, and deploy require separate approval.",
      });
    }

    return {
      run,
      evidence: input.evidence,
      workerReports: input.workerReports,
      decisionLog: this.decisionLog.list(input.runId),
      orchestrationEvidence: {
        securityReviewInvoked: input.securityReviewInvoked,
        securityFindings: input.securityFindings,
        approvalType: null,
        policyDecision: null,
        plannerOutput: null,
      },
      changeArtifact: input.changeArtifact ?? null,
      deliveryHandoff: input.deliveryHandoff ?? null,
    };
  }
}

export function createExecutionApproval(runId: string) {
  return createApprovalRequest({
    id: crypto.randomUUID(),
    runId,
    action: "execute",
    requestedBy: "bootstrap-orchestrator",
    impactSummary: "Allow orchestrator to invoke worker within locked contract scope.",
  });
}
