import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  FileText,
  GitBranch,
  Layers,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DemoBulletList,
  DemoCollapsible,
  DemoKeyValueTable,
  DemoMetricCard,
  DemoPageHeader,
  DemoPanel,
  DemoSectionLabel,
  DemoStatusBanner,
} from "./demo-ui";
import {
  abbreviateCommitSha,
  isPublicGitHubTask,
  taskSourceBranch,
  taskSourceCommitSha,
  taskWorkspaceLabel,
} from "@/lib/repository/task-source-display";
import {
  contractNextStepsCopy,
  getContractHandoff,
  getTabProgress,
  handoffActionToTab,
  type ContractHandoffAction,
} from "@/lib/contract-handoff";
import {
  contractSections,
  formatTaskRef,
  suggestedTab,
  taskVersion,
  type DemoTab,
} from "@/lib/task-display";
import {
  getResolvedClarificationDecisions,
  hasUnresolvedClarification,
} from "@/lib/planning/clarification-state";
import { useProjects } from "@/hooks/use-projects";
import {
  canReviseTask,
  detectSourceCommitDrift,
  taskHasExecuted,
} from "@/lib/task-lifecycle-ops";
import type { TaskRecord } from "@/lib/tasks-schema";
import type { HumanGateDecision } from "@/lib/human-approval";
import {
  buildTaskLifecycleViewModel,
  type TaskLifecycleViewModel,
} from "@/lib/task-lifecycle";
import { shouldRenderTabIcon } from "@/lib/approval-recommendation";
import {
  HUMAN_GATE_DECISIONS,
  isPendingHumanApproval,
} from "@/lib/human-approval";
import {
  formatHumanGateOptionLabel,
  formatHumanGateSubmitLabel,
  formatHumanApprovalAuditEntry,
  formatHumanApprovalValidationError,
  presentHumanApprovalOutcome,
} from "@/lib/human-approval-presentation";
import {
  ADDITIONAL_REVIEW_TYPES,
  type AdditionalReviewType,
  requiresApprovalConfirmation,
  showsAdditionalReviewFields,
  showsRejectReasonField,
  showsRevisionNoteField,
  validateHumanApprovalForm,
} from "@/lib/human-approval-input";
import { isApprovalGateOpen, isOrchestrationInProgress } from "@/lib/evidence-analysis";
import {
  ProtectedPathApprovalOutcome,
  ProtectedPathApprovalPanel,
} from "@/components/site/protected-path-approval-panel";
import { isPendingProtectedPathApproval } from "@/lib/protected-path-approval-flow";
import { canRerunFailedTask, formatRunHistoryLabel, listTaskRunHistory } from "@/lib/task-rerun";
import { buildRunHistoryTimingViewModel } from "@/lib/run-timing-presentation";
import { isOrchestrationEligible } from "@/lib/task-lifecycle-ops";
import { cn } from "@/lib/utils";
import { TaskOverviewView } from "@/components/site/task-overview-view";
import { LifecycleProgressPanel } from "@/components/site/lifecycle-progress-panel";
import { ChangeEvidencePanel } from "@/components/site/change-evidence-panel";
import { AuthorizedDeliveryHandoffSection } from "@/components/site/authorized-delivery-handoff-section";
import { EvidenceSummaryPanel } from "@/components/site/evidence-summary-panel";
import { buildChangeEvidenceViewModel } from "@/lib/change-evidence-presentation";
import {
  canShowDeliveryHandoff,
} from "@/lib/delivery-handoff-presentation";
import { SemanticStatusBadge } from "@/components/site/semantic-status-badge";
import { checkEvidencePresentation, verdictPresentation } from "@/lib/status-presentation";
import { formatPlanningSourceLabel } from "@/lib/planning/planning-source";
import { friendlyStatusLabel } from "@/lib/task-overview";
import { useI18n } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/en";
import { translate, type Locale } from "@/i18n";
import { en, id } from "@/i18n";
import {
  formatBlockedReasonExplanationList,
  formatPrimaryBlockedExplanation,
} from "@/lib/blocked-reason-presentation";
import {
  formatApprovalTypeLabel,
  formatOrchestrationPhaseLabel,
  formatWorkContractApprovalLabel,
  formatWorkContractStatusLabel,
} from "@/lib/lifecycle-presentations";

type TaskDetailTabsProps = {
  task: TaskRecord;
  initialTab?: DemoTab;
  approving: boolean;
  running: boolean;
  submittingHumanApproval: boolean;
  error: string | null;
  onApprove: () => void;
  onRun: () => void;
  onSubmitHumanApproval: (input: {
    decision: HumanGateDecision;
    note?: string;
    reviewType?: AdditionalReviewType;
    confirmedReview?: boolean;
  }) => void;
  onEdit: () => void;
  onBack: () => void;
  onRefreshContract?: () => void;
  onReviseTask?: () => void;
  onProtectedPathApprove?: () => void;
  onProtectedPathReject?: () => void;
  submittingProtectedPathApproval?: boolean;
  refreshing?: boolean;
  revising?: boolean;
};

const TAB_VALUES: DemoTab[] = ["overview", "contract", "orchestration", "evidence", "approval"];

const TAB_ICONS = {
  overview: Layers,
  contract: FileText,
  orchestration: GitBranch,
  evidence: Shield,
  approval: ShieldCheck,
} as const;

export function TaskDetailTabs({
  task,
  initialTab,
  approving,
  running,
  submittingHumanApproval,
  error,
  onApprove,
  onRun,
  onSubmitHumanApproval,
  onEdit,
  onBack,
  onRefreshContract,
  onReviseTask,
  onProtectedPathApprove,
  onProtectedPathReject,
  submittingProtectedPathApproval = false,
  refreshing = false,
  revising = false,
}: TaskDetailTabsProps) {
  const { t, locale } = useI18n();
  const { source } = useProjects();
  const [tab, setTab] = useState<DemoTab>(() => initialTab ?? suggestedTab(task.status));
  const blocked = task.status === "BLOCKED";
  const locked = task.status === "APPROVED_FOR_EXECUTION" || Boolean(task.lockedAt);
  const canRun = isOrchestrationEligible(task);
  const sourceCommitDrift = detectSourceCommitDrift(task, source?.commitSha);
  const showRevise = canReviseTask(task) && !taskHasExecuted(task);
  const lifecycle = buildTaskLifecycleViewModel(task, locale);
  const taskRef = formatTaskRef(task.id);

  function goToTab(nextTab: DemoTab) {
    setTab(nextTab);
  }

  function handleHandoffAction(action: ContractHandoffAction) {
    const targetTab = handoffActionToTab(action);
    if (targetTab) {
      goToTab(targetTab);
      return;
    }
    if (action === "approve") {
      onApprove();
      return;
    }
    if (action === "run") {
      onRun();
      goToTab("orchestration");
    }
  }

  return (
    <div className="space-y-6">
      {sourceCommitDrift ? (
        <div className="space-y-3">
          <DemoStatusBanner
            status="BLOCKED"
            title={t("tasks.sourceCommitDrift")}
            description={t("tasks.sourceCommitDriftHelp")}
          />
          {onRefreshContract ? (
            <Button size="sm" onClick={onRefreshContract} disabled={refreshing}>
              {refreshing ? t("common.saving") : t("tasks.refreshContract")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {showRevise && onReviseTask ? (
        <DemoPanel title={t("tasks.reviseTask")}>
          <p className="text-sm text-muted-foreground">{t("tasks.lockedImmutable")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onReviseTask} disabled={revising}>
              {revising ? t("common.saving") : t("tasks.reviseTask")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              {t("tasks.duplicateAsNew")}
            </Button>
          </div>
        </DemoPanel>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as DemoTab)}>
        <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0">
          {TAB_VALUES.map((value, index) => {
            const item = {
              value,
              label: t(`taskDetail.tabs.${value}` as TranslationKey),
              step: index + 1,
              icon: TAB_ICONS[value],
            };
            const progress = getTabProgress(task.status, item.value);
            return (
              <TabsTrigger
                key={item.value}
                value={item.value}
                data-tour={`tab-${item.value}`}
                className={cn(
                  "relative rounded-none border-0 bg-transparent px-4 py-3 text-sm font-medium shadow-none",
                  "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
                  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:scale-x-0 after:bg-ring after:transition-transform data-[state=active]:after:scale-x-100",
                  progress === "complete" && "text-foreground/80",
                  progress === "upcoming" && "text-muted-foreground",
                )}
              >
                <span className="mr-2 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {progress === "complete" ? (
                    <CheckCircle2 className="size-3.5 text-status-pass" aria-hidden="true" />
                  ) : (
                    item.step
                  )}
                </span>
                {shouldRenderTabIcon(progress) ? (
                  <item.icon className="mr-2 size-4" aria-hidden="true" />
                ) : null}
                {item.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <TaskOverviewView
            task={task}
            running={running}
            approving={approving}
            onHandoffAction={handleHandoffAction}
            onGoToTab={goToTab}
          />
        </TabsContent>

        <TabsContent value="contract" className="mt-6 space-y-6">
          <DemoPageHeader
            title={t("taskDetail.contract.reviewTitle")}
            meta={`${taskRef} · ${taskVersion(task)}`}
          />

          <ContractReview
            task={task}
            locked={locked}
            blocked={blocked}
            running={running}
            approving={approving}
            locale={locale}
            onEdit={onEdit}
            onHandoffAction={handleHandoffAction}
          />
        </TabsContent>

        <TabsContent value="orchestration" className="mt-6 space-y-6">
          <OrchestrationView
            task={task}
            taskRef={taskRef}
            lifecycle={lifecycle}
            canRun={canRun}
            running={running}
            locale={locale}
            onRun={onRun}
          />
        </TabsContent>

        <TabsContent value="evidence" className="mt-6 space-y-6">
          <EvidenceView task={task} taskRef={taskRef} lifecycle={lifecycle} locale={locale} onEdit={onEdit} />
        </TabsContent>

        <TabsContent value="approval" className="mt-6 space-y-6">
          <ApprovalView
            task={task}
            taskRef={taskRef}
            lifecycle={lifecycle}
            submitting={submittingHumanApproval}
            submittingProtectedPathApproval={submittingProtectedPathApproval}
            error={error}
            locale={locale}
            sourceCommitDrift={sourceCommitDrift}
            onEdit={onEdit}
            onSubmit={onSubmitHumanApproval}
            {...(onProtectedPathApprove ? { onProtectedPathApprove } : {})}
            {...(onProtectedPathReject ? { onProtectedPathReject } : {})}
            onGoToTab={goToTab}
          />
        </TabsContent>
      </Tabs>

      {error ? <p className="text-sm text-status-blocked">{error}</p> : null}

      <div className="border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
          {t("taskDetail.backToTasks")}
        </Button>
      </div>
    </div>
  );
}

function ContractReview({
  task,
  locked,
  blocked,
  running,
  approving,
  locale,
  onEdit,
  onHandoffAction,
}: {
  task: TaskRecord;
  locked: boolean;
  blocked: boolean;
  running: boolean;
  approving: boolean;
  locale: Locale;
  onEdit: () => void;
  onHandoffAction: (action: ContractHandoffAction) => void;
}) {
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(locale, key, params);
  const sections = contractSections(task.contract, locale);
  const handoff = getContractHandoff(task, { running, approving }, locale);
  const unresolvedClarification = hasUnresolvedClarification(sections.clarification);
  const resolvedClarificationDecisions = getResolvedClarificationDecisions(sections.clarification);
  const primaryDisabled =
    (handoff.primaryAction === "run" && running) ||
    (handoff.primaryAction === "approve" && approving);

  return (
    <>
      <DemoPanel
        badge={
          locked ? (
            <div className="text-right">
              <span className="block rounded-md border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t("taskDetail.contract.lockedBadge")}
              </span>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {t("taskDetail.contract.lockedNote")}
              </span>
            </div>
          ) : (
            <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {t("taskDetail.contract.draftBadge")}
            </span>
          )
        }
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-5">
            <div>
              <DemoSectionLabel>{t("taskDetail.contract.goal")}</DemoSectionLabel>
              <p className="mt-2 text-sm leading-relaxed">{sections.goal}</p>
            </div>
            <div>
              <DemoSectionLabel>{t("taskDetail.contract.willDo")}</DemoSectionLabel>
              <DemoBulletList items={sections.willDo} />
            </div>
            <div>
              <DemoSectionLabel>{t("taskDetail.contract.doneWhen")}</DemoSectionLabel>
              <DemoBulletList items={sections.doneWhen} />
            </div>
          </div>
          <div className="space-y-5">
            <div>
              <DemoSectionLabel>{t("taskDetail.contract.wontDo")}</DemoSectionLabel>
              <DemoBulletList items={sections.wontDo} />
            </div>
            <div>
              <DemoSectionLabel>{t("taskDetail.contract.limits")}</DemoSectionLabel>
              <DemoBulletList items={sections.limits} />
            </div>
            {sections.sourcesUsed.length > 0 ? (
              <div>
                <DemoSectionLabel>{t("tasks.sourcesUsed")}</DemoSectionLabel>
                <DemoBulletList
                  items={sections.sourcesUsed.map((sourceItem) =>
                    formatPlanningSourceLabel(sourceItem),
                  )}
                />
              </div>
            ) : null}
            {unresolvedClarification && sections.clarification?.question ? (
              <div>
                <DemoSectionLabel>{t("tasks.clarificationNeeded")}</DemoSectionLabel>
                <p className="mt-2 text-sm text-foreground">{sections.clarification.question}</p>
                {sections.clarification.answer ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sections.clarification.answer}
                  </p>
                ) : null}
              </div>
            ) : resolvedClarificationDecisions.length > 0 ? (
              <div>
                <DemoSectionLabel>{t("tasks.clarificationDecisionsSummary")}</DemoSectionLabel>
                <DemoBulletList
                  items={resolvedClarificationDecisions.map(
                    (decision) => `${decision.label} → ${decision.answer}`,
                  )}
                />
              </div>
            ) : null}
          </div>
        </div>

        {!blocked && handoff.showApproveActions ? (
          <div className="mt-8 flex flex-wrap gap-3 border-t border-border pt-6">
            <Button variant="outline" onClick={onEdit}>
              {t("taskDetail.contract.editPlan")}
            </Button>
          </div>
        ) : null}
      </DemoPanel>

      {handoff.showNextSteps ? (
        <DemoPanel title={t("taskDetail.contract.nextStepsTitle")}>
          <p className="text-sm leading-relaxed text-foreground">{contractNextStepsCopy(locale)}</p>
          {handoff.statusNote ? (
            <p className="mt-3 text-sm text-muted-foreground">{handoff.statusNote}</p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {handoff.primaryAction !== "none" ? (
              <Button
                onClick={() => onHandoffAction(handoff.primaryAction)}
                disabled={primaryDisabled}
              >
                {handoff.primaryLabel}
              </Button>
            ) : null}
            {handoff.secondaryLabel && handoff.secondaryAction ? (
              <Button
                variant="outline"
                onClick={() => onHandoffAction(handoff.secondaryAction!)}
              >
                {handoff.secondaryLabel}
              </Button>
            ) : null}
          </div>
        </DemoPanel>
      ) : (
        <DemoPanel title={t("taskDetail.contract.nextStepsShort")}>
          {handoff.statusNote ? (
            <p className="text-sm text-muted-foreground">{handoff.statusNote}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {handoff.primaryAction !== "none" ? (
              <Button onClick={() => onHandoffAction(handoff.primaryAction)}>
                {handoff.primaryLabel}
              </Button>
            ) : null}
            {handoff.secondaryLabel && handoff.secondaryAction ? (
              <Button
                variant="outline"
                onClick={() => onHandoffAction(handoff.secondaryAction!)}
              >
                {handoff.secondaryLabel}
              </Button>
            ) : null}
          </div>
        </DemoPanel>
      )}

      <DemoCollapsible title={t("taskDetail.contract.technicalDetails")}>
        <div className="space-y-3 font-mono text-xs">
          <p>Protected paths: {task.contract.protectedPaths.join(", ")}</p>
          <p>Required checks: {task.contract.requiredChecks.join(", ")}</p>
          <p>Allowed actions: {task.contract.allowedActions.join("; ")}</p>
        </div>
      </DemoCollapsible>
    </>
  );
}

function OrchestrationView({
  task,
  taskRef,
  lifecycle,
  canRun,
  running,
  locale,
  onRun,
}: {
  task: TaskRecord;
  taskRef: string;
  lifecycle: TaskLifecycleViewModel;
  canRun: boolean;
  running: boolean;
  locale: Locale;
  onRun: () => void;
}) {
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(locale, key, params);
  const runner = task.runnerState;
  const activeRun = ["INSPECTING", "RUNNING", "CHECKING", "NEEDS_CORRECTION"].includes(task.status);
  const catalog = (locale === "id" ? id : en) as typeof en;
  const roleCards = [
    {
      title: t("taskDetail.orchestration.roles.orchestrator.title"),
      tone: "border-status-review/30 bg-status-review/5",
      items: [...catalog.taskDetail.orchestration.roles.orchestrator.items],
    },
    {
      title: t("taskDetail.orchestration.roles.worker.title"),
      tone: "border-status-pass/30 bg-status-pass/5",
      items: [...catalog.taskDetail.orchestration.roles.worker.items],
    },
    {
      title: t("taskDetail.orchestration.roles.checker.title"),
      tone: "border-status-review/40 bg-accent/40",
      items: [...catalog.taskDetail.orchestration.roles.checker.items],
    },
    {
      title: t("taskDetail.orchestration.roles.decision.title"),
      tone: "border-border bg-card",
      items: [...catalog.taskDetail.orchestration.roles.decision.items],
    },
  ];

  return (
    <>
      <DemoPageHeader
        title={t("taskDetail.orchestration.title")}
        meta={t("taskDetail.orchestration.meta", {
          taskRef,
          used: lifecycle.correctionsUsed,
          limit: lifecycle.correctionLimit,
          version: taskVersion(task),
        })}
      />

      {lifecycle.executionCompleteLabel ? (
        <DemoStatusBanner
          status="PASS"
          title={lifecycle.executionCompleteLabel}
          description={lifecycle.plainLanguageSummary}
        />
      ) : activeRun ? (
        <DemoStatusBanner
          status="RUNNING"
          title={
            lifecycle.progress.runSummary ??
            (lifecycle.correction.kind === "human"
              ? t("taskDetail.orchestration.revisionFromYou")
              : t("taskDetail.orchestration.autoCorrection"))
          }
          description={
            lifecycle.progress.longRunningMessage ??
            lifecycle.progress.delayedWarning ??
            lifecycle.orchestrationUserSummary
          }
        />
      ) : lifecycle.implementationVerdict === "PASS" ? (
        <DemoStatusBanner
          status="PASS"
          title={t("taskDetail.orchestration.passVerdict")}
          description={lifecycle.plainLanguageSummary}
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-4">
        {roleCards.map((card) => (
          <div key={card.title} className={cn("rounded-lg border p-4", card.tone)}>
            <p className="text-sm font-semibold text-foreground">{card.title}</p>
            <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              {card.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <DemoPanel title={t("taskDetail.orchestration.lifecycle")}>
        <LifecycleProgressPanel progress={lifecycle.progress} />
      </DemoPanel>

      {lifecycle.currentRunTiming ? (
        <DemoPanel title={t("timing.runTiming")}>
          <DemoKeyValueTable
            rows={[
              { label: t("timing.startedAt"), value: lifecycle.currentRunTiming.startedAtLabel },
              { label: t("timing.completedAt"), value: lifecycle.currentRunTiming.completedAtLabel },
              ...(lifecycle.currentRunTiming.showDuration
                ? [
                    {
                      label: lifecycle.currentRunTiming.durationIsElapsed
                        ? t("timing.elapsedDuration")
                        : t("timing.totalDuration"),
                      value: lifecycle.currentRunTiming.durationLabel ?? t("timing.notRecorded"),
                    },
                  ]
                : []),
            ]}
          />
        </DemoPanel>
      ) : null}

      {task.contract.workPlan && task.contract.workPlan.contracts.length > 0 ? (
        <DemoPanel title={t("taskDetail.orchestration.workContracts")}>
          <ol className="space-y-2">
            {task.contract.workPlan.contracts.map((contract) => {
              const orchestrationContract = runner?.orchestration?.contracts?.find(
                (item) => item.id === contract.id,
              );
              const status = orchestrationContract?.status ?? contract.status;
              const approval = orchestrationContract?.approvalState ?? contract.approvalState;
              return (
                <li
                  key={contract.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">
                    {contract.id} — {contract.goal}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {formatWorkContractApprovalLabel(approval, locale)} ·{" "}
                    {formatWorkContractStatusLabel(status, locale)}
                  </span>
                </li>
              );
            })}
          </ol>
          {runner?.orchestration?.plannerOutput ? (
            <p className="mt-3 text-xs text-muted-foreground">{runner.orchestration.plannerOutput}</p>
          ) : null}
        </DemoPanel>
      ) : null}

      {runner?.orchestration ? (
        <DemoPanel title={t("taskDetail.orchestration.orchestrationEvidence")}>
          <DemoKeyValueTable
            rows={[
              { label: "Phase", value: formatOrchestrationPhaseLabel(runner.orchestration.phase, locale) },
              {
                label: "Approval",
                value: formatApprovalTypeLabel(runner.orchestration.approvalType, locale),
              },
              { label: "Policy", value: runner.orchestration.policyDecision ?? "—" },
              {
                label: "Security review",
                value: runner.orchestration.securityReviewInvoked
                  ? t("taskDetail.orchestration.securityInvoked")
                  : t("taskDetail.orchestration.securitySkipped"),
              },
              {
                label: "Corrections",
                value: String(runner.orchestration.correctionCount ?? lifecycle.correctionsUsed),
              },
              {
                label: "Verdict",
                value: runner.orchestration.finalVerdict ?? lifecycle.implementationVerdict ?? "—",
              },
            ]}
          />
        </DemoPanel>
      ) : null}

      {isPublicGitHubTask(task) ? (
        <DemoPanel title={t("taskDetail.orchestration.repositorySource")}>
          <DemoKeyValueTable
            rows={[
              { label: "Repository", value: taskWorkspaceLabel(task) },
              { label: "Source", value: "Public GitHub" },
              { label: "Branch", value: taskSourceBranch(task) },
              { label: "Commit SHA", value: abbreviateCommitSha(taskSourceCommitSha(task)) },
              { label: "Worker", value: runner?.workerId ?? "—" },
            ]}
          />
        </DemoPanel>
      ) : null}

      {lifecycle.hasRun ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DemoMetricCard
            label={t("taskDetail.orchestration.autoCorrections")}
            value={`${lifecycle.correctionsUsed} / ${lifecycle.correctionLimit}`}
          />
          <DemoMetricCard
            label={t("taskDetail.orchestration.workerExecution")}
            value={`${lifecycle.workerAttemptNumber} / ${lifecycle.workerAttemptLimit}`}
          />
          <DemoMetricCard
            label={t("taskDetail.orchestration.filesChanged")}
            value={String(runner?.filesChanged ?? 0)}
            tone="pass"
          />
          <DemoMetricCard
            label={t("taskDetail.orchestration.checksFinal")}
            value={lifecycle.checks.friendlySummary}
            tone={lifecycle.checks.allRequiredSatisfied ? "pass" : "review"}
          />
        </div>
      ) : null}

      {canRun ? (
        <div className="flex flex-wrap gap-3">
          <Button onClick={onRun} disabled={running}>
            {running
              ? t("taskDetail.orchestration.running")
              : canRerunFailedTask(task)
                ? t("taskDetail.orchestration.rerunTask")
                : t("taskDetail.orchestration.runOrchestrator")}
          </Button>
        </div>
      ) : lifecycle.showOrchestratorNotStarted ? (
        <p className="text-sm text-muted-foreground">{t("taskDetail.orchestration.notStarted")}</p>
      ) : null}

      {listTaskRunHistory(task).length > 0 ? (
        <DemoPanel title={t("taskDetail.orchestration.runHistory")}>
          <ul className="space-y-3 text-sm">
            {listTaskRunHistory(task).map((entry) => {
              const timing = buildRunHistoryTimingViewModel(entry, locale);
              return (
                <li
                  key={entry.runId}
                  className="rounded-md border border-border px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {formatRunHistoryLabel(entry, locale)}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {entry.runId.slice(0, 8)}
                    </span>
                  </div>
                  <DemoKeyValueTable
                    rows={[
                      { label: t("timing.startedAt"), value: timing.startedAtLabel },
                      { label: t("timing.completedAt"), value: timing.completedAtLabel },
                      ...(timing.durationLabel
                        ? [{ label: t("timing.totalDuration"), value: timing.durationLabel }]
                        : []),
                    ]}
                  />
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                    {timing.compactTechnicalLine}
                  </p>
                </li>
              );
            })}
          </ul>
        </DemoPanel>
      ) : null}

      {runner?.decisionLog?.length ? (
        <DemoCollapsible title={t("taskDetail.orchestration.technicalActivity")}>
          <ul className="space-y-2 font-mono text-xs">
            {runner.decisionLog.map((entry) => (
              <li key={`${entry.rule}-${entry.summary}`}>
                {entry.rule}: {entry.summary} → {entry.nextStatus}
              </li>
            ))}
          </ul>
        </DemoCollapsible>
      ) : null}
    </>
  );
}

function EvidenceView({
  task,
  taskRef,
  lifecycle,
  locale,
  onEdit,
}: {
  task: TaskRecord;
  taskRef: string;
  lifecycle: TaskLifecycleViewModel;
  locale: Locale;
  onEdit: () => void;
}) {
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(locale, key, params);
  const runner = task.runnerState;
  const blocked = lifecycle.isBlocked;
  const changeEvidence = buildChangeEvidenceViewModel(runner?.changeArtifact, locale);

  if (blocked) {
    return (
      <>
        <DemoPageHeader
          title={task.goal}
          meta={taskRef}
          description={t("taskDetail.evidence.blockedDescription")}
        />
        <DemoStatusBanner
          status="BLOCKED"
          title={t("taskDetail.evidence.blockedTitle")}
          description={formatPrimaryBlockedExplanation(
            task.blockedReasons,
            locale,
            "taskDetail.evidence.blockedFallback",
          )}
          locale={locale}
        />
        {lifecycle.evidenceSummary ? (
          <EvidenceSummaryPanel
            summary={lifecycle.evidenceSummary}
            verdict="BLOCKED"
            locale={locale}
          />
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <DemoPanel title={t("taskDetail.evidence.summary")}>
            <DemoKeyValueTable
              rows={[
                { label: t("taskDetail.orchestration.filesChanged"), value: String(runner?.filesChanged ?? 0) },
                { label: "Commands executed", value: String(runner?.commandsExecuted ?? 0) },
                { label: "Commit", value: lifecycle.deliveryLabels.commit },
                { label: "Push", value: lifecycle.deliveryLabels.push },
              ]}
            />
          </DemoPanel>
          <DemoPanel title={t("taskDetail.evidence.reasons")}>
            <DemoBulletList
              items={
                task.blockedReasons.length
                  ? formatBlockedReasonExplanationList(task.blockedReasons, locale)
                  : [t("taskDetail.evidence.preflightFailed")]
              }
            />
          </DemoPanel>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button disabled>{t("taskDetail.evidence.requestDeveloperApproval")}</Button>
          <Button variant="outline" onClick={onEdit}>
            {t("taskDetail.evidence.editRequest")}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {lifecycle.isPassLike ? (
        <DemoStatusBanner
          status="PASS"
          title={lifecycle.executionCompleteLabel ?? t("lifecycle.summary.executionComplete")}
          description={lifecycle.plainLanguageSummary}
          locale={locale}
        />
      ) : lifecycle.implementationVerdict === "FAILED" ? (
        <DemoStatusBanner
          status="FAILED"
          title={lifecycle.evidenceSummary?.headline ?? t("taskDetail.evidence.runTitle")}
          description={lifecycle.evidenceSummary?.intro ?? lifecycle.plainLanguageSummary}
          locale={locale}
        />
      ) : (
        <DemoPageHeader
          title={t("taskDetail.evidence.runTitle")}
          meta={`${taskRef} · ${friendlyStatusLabel(task.status, locale)}`}
        />
      )}

      {lifecycle.evidenceSummary ? (
        <EvidenceSummaryPanel
          summary={lifecycle.evidenceSummary}
          verdict={lifecycle.implementationVerdict}
          locale={locale}
        />
      ) : (
        <DemoPanel title={t("taskDetail.evidence.currentStatus")}>
          <p className="text-sm leading-relaxed text-foreground">
            {lifecycle.correction.phase === "verifying"
              ? t("taskDetail.evidence.verifying")
              : lifecycle.correction.phase === "preparing"
                ? lifecycle.correction.userSummary
                : lifecycle.checks.total === 0
                  ? t("taskDetail.evidence.noFinalChecks")
                  : lifecycle.checks.friendlySummary}
          </p>
          {lifecycle.correction.kind === "automatic" && lifecycle.correction.userSummary ? (
            <p className="mt-3 text-sm text-muted-foreground">{lifecycle.correction.userSummary}</p>
          ) : null}
        </DemoPanel>
      )}

      {changeEvidence ? <ChangeEvidencePanel viewModel={changeEvidence} locale={locale} /> : null}

      {lifecycle.implementationVerdict === "PASS" && lifecycle.checks.allRequiredSatisfied ? (
        <DemoPanel title={t("taskDetail.evidence.finalResult")}>
          <p className="text-sm leading-relaxed text-foreground">
            {lifecycle.approval.finalChecksSummary}
          </p>
          {lifecycle.approval.historicalCorrection?.summary &&
          lifecycle.correction.phase === "verified" ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {lifecycle.approval.historicalCorrection.summary}
            </p>
          ) : null}
        </DemoPanel>
      ) : null}

      {lifecycle.approval.historicalCorrection &&
      lifecycle.correction.phase === "verified" &&
      lifecycle.implementationVerdict === "PASS" ? (
        <DemoPanel title={t("taskDetail.evidence.fixedIssues")}>
          <DemoBulletList
            items={lifecycle.approval.historicalCorrection.timeline.map(
              (entry) => `${entry.phase}: ${entry.detail}`,
            )}
          />
        </DemoPanel>
      ) : null}

      {lifecycle.attemptHistory.length > 0 ? (
        <DemoPanel title={t("timing.checkHistory")}>
          <ul className="space-y-3 text-sm">
            {lifecycle.attemptHistory.map((entry) => (
              <li
                key={entry.attemptNumber}
                className="rounded-md border border-border px-3 py-3"
              >
                <p className="font-medium text-foreground">{entry.title}</p>
                {entry.hasTiming ? (
                  <DemoKeyValueTable
                    rows={[
                      ...(entry.startedAtLabel
                        ? [{ label: t("timing.started"), value: entry.startedAtLabel }]
                        : []),
                      ...(entry.completedAtLabel
                        ? [{ label: t("timing.completed"), value: entry.completedAtLabel }]
                        : []),
                      ...(entry.durationLabel
                        ? [{ label: t("timing.duration"), value: entry.durationLabel }]
                        : []),
                    ]}
                  />
                ) : null}
                <p className="mt-1 text-foreground">
                  {entry.checksSummary} · {entry.outcome}
                </p>
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                  {entry.compactTechnicalLine}
                </p>
              </li>
            ))}
          </ul>
        </DemoPanel>
      ) : null}

      {lifecycle.attemptHistory.length > 0 ? (
        <DemoCollapsible title={t("timing.technicalHistory")}>
          <ul className="space-y-2 font-mono text-xs text-muted-foreground">
            {lifecycle.attemptHistory.map((entry) => (
              <li key={`tech-${entry.attemptNumber}`}>{entry.compactTechnicalLine}</li>
            ))}
          </ul>
        </DemoCollapsible>
      ) : null}

      {lifecycle.evidenceHistory.length > 0 ? (
        <DemoCollapsible title={t("taskDetail.evidence.checkHistory")}>
          <ul className="space-y-2 font-mono text-xs">
            {lifecycle.evidenceHistory.map((entry) => (
              <li key={entry.attemptNumber}>
                {entry.label}: {entry.checks} → {entry.outcome}
              </li>
            ))}
          </ul>
        </DemoCollapsible>
      ) : null}

      <DemoCollapsible title={t("taskDetail.evidence.technicalDetails")}>
        <DemoKeyValueTable
          rows={[
            {
              label: "Implementation verdict",
              value: lifecycle.implementationVerdict ? (
                <SemanticStatusBadge
                  presentation={
                    verdictPresentation(lifecycle.implementationVerdict, locale)!
                  }
                />
              ) : (
                task.status
              ),
            },
            {
              label: "Checks",
              value: lifecycle.checks.technicalSummary,
            },
            { label: t("taskDetail.orchestration.filesChanged"), value: String(runner?.filesChanged ?? 0) },
            {
              label: "Worker attempt",
              value: `${lifecycle.workerAttemptNumber} of ${lifecycle.workerAttemptLimit}`,
            },
            {
              label: "Corrections used",
              value: `${lifecycle.correctionsUsed} of ${lifecycle.correctionLimit}`,
            },
            { label: "Commit", value: lifecycle.deliveryLabels.commit },
            { label: "Push", value: lifecycle.deliveryLabels.push },
            { label: "Merge", value: lifecycle.deliveryLabels.merge },
            { label: "Deploy", value: lifecycle.deliveryLabels.deploy },
          ]}
        />

        {lifecycle.evidenceSummary?.technicalDetails.length ? (
          <div className="mt-4 border-t border-border pt-4">
            <DemoSectionLabel>{t("taskDetail.evidence.checkHistory")}</DemoSectionLabel>
            <ul className="mt-3 space-y-3">
              {lifecycle.evidenceSummary.technicalDetails.map((item) => {
                const checkPresentation = checkEvidencePresentation(item.status, locale);
                return (
                  <li
                    key={`${item.category}-${item.name}-${item.status}`}
                    className={cn("border-l-2 pl-3", checkPresentation.borderClass)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <SemanticStatusBadge presentation={checkPresentation} />
                      <span className="text-sm font-medium text-foreground">{item.title}</span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">{item.userLine}</p>
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {item.category} · {item.name} · {item.status}
                    </p>
                    {item.command ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Command: {item.command}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : runner?.evidence?.length ? (
          <div className="mt-4 border-t border-border pt-4">
            <DemoSectionLabel>{t("taskDetail.evidence.checkHistory")}</DemoSectionLabel>
            <ul className="mt-3 space-y-3">
              {runner.evidence.map((item) => (
                <li key={`${item.category}-${item.name}`} className="border-l-2 border-border pl-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em]">
                    {item.category} · {item.status}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed">{item.summary}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t("taskDetail.evidence.noRunEvidence")}</p>
        )}
      </DemoCollapsible>
    </>
  );
}

function ApprovalView({
  task,
  taskRef,
  lifecycle,
  submitting,
  submittingProtectedPathApproval,
  error,
  locale,
  sourceCommitDrift,
  onEdit,
  onSubmit,
  onProtectedPathApprove,
  onProtectedPathReject,
  onGoToTab,
}: {
  task: TaskRecord;
  taskRef: string;
  lifecycle: TaskLifecycleViewModel;
  submitting: boolean;
  submittingProtectedPathApproval: boolean;
  error: string | null;
  locale: Locale;
  sourceCommitDrift: boolean;
  onEdit: () => void;
  onSubmit: (input: {
    decision: HumanGateDecision;
    note?: string;
    reviewType?: AdditionalReviewType;
    confirmedReview?: boolean;
  }) => void;
  onProtectedPathApprove?: () => void;
  onProtectedPathReject?: () => void;
  onGoToTab: (tab: DemoTab) => void;
}) {
  const { activeProject } = useProjects();
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(locale, key, params);
  const runner = task.runnerState;
  const outcome = presentHumanApprovalOutcome(task, locale);
  const pending = isPendingHumanApproval(task);
  const gateOpen = isApprovalGateOpen(task);
  const recommendation = lifecycle.approval;
  const deliveryHandoff = runner?.deliveryHandoff;
  const showDelivery =
    canShowDeliveryHandoff({
      runnerState: runner ?? null,
    }) && deliveryHandoff;
  const [decision, setDecision] = useState<HumanGateDecision>("APPROVE_COMMIT");
  const [confirmedReview, setConfirmedReview] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [reviewType, setReviewType] = useState<AdditionalReviewType | "">("");
  const [formError, setFormError] = useState<string | null>(null);

  function approvalFormInput() {
    return {
      decision,
      note: decisionNote,
      ...(reviewType ? { reviewType } : {}),
      ...(requiresApprovalConfirmation(decision) ? { confirmedReview } : {}),
    };
  }

  function canSubmitApproval(): boolean {
    if (submitting) {
      return false;
    }
    return validateHumanApprovalForm(approvalFormInput()) === null;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateHumanApprovalForm(approvalFormInput());
    if (validationError) {
      setFormError(formatHumanApprovalValidationError(validationError, locale));
      return;
    }
    setFormError(null);
    const trimmedNote = decisionNote.trim();
    onSubmit({
      decision,
      ...(trimmedNote ? { note: trimmedNote } : {}),
      ...(decision === "ESCALATE_REVIEW" && reviewType ? { reviewType } : {}),
      ...(decision === "APPROVE_COMMIT" ? { confirmedReview: true } : {}),
    });
  }

  function handleDecisionChange(nextDecision: HumanGateDecision) {
    setDecision(nextDecision);
    setFormError(null);
    if (!requiresApprovalConfirmation(nextDecision)) {
      setConfirmedReview(false);
    }
    if (!showsRevisionNoteField(nextDecision) && !showsRejectReasonField(nextDecision)) {
      setDecisionNote("");
    }
    if (!showsAdditionalReviewFields(nextDecision)) {
      setReviewType("");
    }
  }

  function recommendationBannerStatus(): "PASS" | "FAILED" | "AWAITING_APPROVAL" | "NEEDS HUMAN REVIEW" | "BLOCKED" {
    if (runner?.commitApproved) return "PASS";
    if (recommendation.kind === "RECOMMENDED_APPROVE") return "PASS";
    if (recommendation.kind === "FIX_FIRST") return "FAILED";
    if (task.status === "BLOCKED") return "BLOCKED";
    return "NEEDS HUMAN REVIEW";
  }

  if (isPendingProtectedPathApproval(task)) {
    return (
      <>
        <DemoPageHeader
          title={t("taskDetail.approval.title")}
          meta={`${taskRef} · ${friendlyStatusLabel(task.status, locale)}`}
        />
        <ProtectedPathApprovalPanel
          task={task}
          locale={locale}
          submitting={submittingProtectedPathApproval}
          error={error}
          onApprove={() => onProtectedPathApprove?.()}
          onReject={() => onProtectedPathReject?.()}
        />
      </>
    );
  }

  const protectedPathOutcome = <ProtectedPathApprovalOutcome task={task} locale={locale} />;

  if (isOrchestrationInProgress(task.status)) {
    return (
      <>
        <DemoPageHeader
          title={t("taskDetail.approval.title")}
          meta={`${taskRef} · ${friendlyStatusLabel(task.status, locale)}`}
        />
        <DemoPanel title={t("taskDetail.approval.notReadyTitle")}>
          <p className="text-sm text-foreground">{t("taskDetail.approval.notReadyBody")}</p>
          <Button className="mt-4" variant="outline" onClick={() => onGoToTab("orchestration")}>
            {t("taskDetail.approval.viewProgress")}
          </Button>
        </DemoPanel>
      </>
    );
  }

  if (task.status === "BLOCKED") {
    return (
      <>
        <DemoPageHeader
          title={t("taskDetail.approval.title")}
          meta={`${taskRef} · ${friendlyStatusLabel(task.status, locale)}`}
        />
        {protectedPathOutcome}
        <DemoStatusBanner
          status="BLOCKED"
          title={recommendation.label}
          description={recommendation.description}
        />
        {recommendation.unresolvedIssues.length ? (
          <DemoPanel title={t("taskDetail.approval.reasons")}>
            <DemoBulletList items={recommendation.unresolvedIssues} />
          </DemoPanel>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => onGoToTab("evidence")}>
            {t("taskDetail.approval.viewDetails")}
          </Button>
          <Button variant="outline" onClick={onEdit}>
            {t("taskDetail.evidence.editRequest")}
          </Button>
        </div>
      </>
    );
  }

  if (!pending && outcome && outcome.kind !== "pending") {
    const commitExecuted = lifecycle.delivery.commit === "EXECUTED";
    return (
      <>
        <DemoPageHeader
          title={t("taskDetail.approval.title")}
          meta={`${taskRef} · ${friendlyStatusLabel(task.status)}`}
        />
        <DemoStatusBanner
          status={outcome.kind === "commit_approved" ? "PASS" : "NEEDS HUMAN REVIEW"}
          title={outcome.title}
          description={outcome.description}
        />

        {outcome.kind === "commit_approved" ? (
          <>
            <DemoPanel title={t("taskDetail.approval.execution")}>
              <p className="text-sm text-foreground">
                {commitExecuted
                  ? t("taskDetail.approval.commitExecuted")
                  : t("taskDetail.approval.commitNotExecuted")}
              </p>
              {recommendation.commitAutomationNote ? (
                <p className="mt-2 text-sm text-muted-foreground">{recommendation.commitAutomationNote}</p>
              ) : null}
            </DemoPanel>

            <DemoPanel title={t("taskDetail.approval.remainingPermissions")}>
              <DemoBulletList
                items={[
                  `Push: ${lifecycle.deliveryLabels.push}`,
                  `Merge: ${lifecycle.deliveryLabels.merge}`,
                  `Deploy: ${lifecycle.deliveryLabels.deploy}`,
                ]}
              />
            </DemoPanel>

            {showDelivery ? (
              <AuthorizedDeliveryHandoffSection
                task={task}
                locale={locale}
                activeProject={activeProject}
                sourceCommitDrift={sourceCommitDrift}
              />
            ) : null}
          </>
        ) : null}

        {runner?.pendingAdditionalReview ? (
          <DemoPanel title={t("taskDetail.approval.additionalReviewType")}>
            <DemoKeyValueTable
              rows={[
                {
                  label: t("taskDetail.approval.additionalReviewType"),
                  value: t(`taskDetail.approval.reviewTypes.${runner.pendingAdditionalReview.reviewType}`),
                },
                {
                  label: t("taskDetail.approval.additionalReviewNote"),
                  value: runner.pendingAdditionalReview.note,
                },
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              {t("taskDetail.approval.additionalReviewNotRouted")}
            </p>
          </DemoPanel>
        ) : null}

        {recommendation.historicalCorrection ? (
          <DemoPanel title={t("taskDetail.approval.autoCorrection")}>
            <p className="text-sm text-foreground">{recommendation.historicalCorrection.summary}</p>
          </DemoPanel>
        ) : null}

        {runner?.humanApprovals?.length ? (
          <DemoCollapsible title={t("taskDetail.approval.auditTrail")}>
            <ul className="space-y-3 text-sm">
              {runner.humanApprovals.map((entry) => {
                const audit = formatHumanApprovalAuditEntry(entry, locale);
                return (
                  <li
                    key={`${entry.decision}-${entry.createdAt}`}
                    className="rounded-md border border-border px-3 py-3"
                  >
                    <p className="font-medium text-foreground">{audit.decisionLabel}</p>
                    <p className="text-sm text-muted-foreground">{audit.timestamp}</p>
                    {audit.reviewTypeLabel ? (
                      <p className="mt-2 text-sm text-foreground">
                        {t("taskDetail.approval.auditReviewType")}: {audit.reviewTypeLabel}
                      </p>
                    ) : null}
                    {audit.note ? (
                      <p className="mt-2 text-sm italic text-foreground">&ldquo;{audit.note}&rdquo;</p>
                    ) : null}
                    {audit.runId ? (
                      <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                        {t("taskDetail.approval.auditRunId")}: {audit.runId}
                      </p>
                    ) : null}
                    <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                      {audit.decisionLabel} · {audit.timestampTime}
                    </p>
                  </li>
                );
              })}
            </ul>
          </DemoCollapsible>
        ) : null}
      </>
    );
  }

  if (!pending && !gateOpen) {
    return (
      <DemoPanel title={t("taskDetail.approval.title")}>
        <p className="text-sm text-muted-foreground">{t("taskDetail.approval.gateClosed")}</p>
        <Button className="mt-4" variant="outline" onClick={() => onGoToTab("orchestration")}>
          {t("taskDetail.approval.viewProgress")}
        </Button>
      </DemoPanel>
    );
  }

  const showPrimaryApprove =
    gateOpen && recommendation.canRecommendApprove && decision === "APPROVE_COMMIT";

  return (
    <>
      <DemoPageHeader
        title={t("taskDetail.approval.title")}
        meta={`${taskRef} · ${friendlyStatusLabel(task.status, locale)}`}
      />

      <DemoStatusBanner
        status={recommendationBannerStatus()}
        title={recommendation.label}
        description={recommendation.description}
      />

      {recommendation.reasonBullets.length ? (
        <DemoPanel title={t("taskDetail.approval.whyRecommended")}>
          <DemoBulletList items={recommendation.reasonBullets} />
        </DemoPanel>
      ) : null}

      {recommendation.unresolvedIssues.length ? (
        <DemoPanel title={t("taskDetail.approval.unresolvedIssues")}>
          <DemoBulletList items={recommendation.unresolvedIssues} />
        </DemoPanel>
      ) : null}

      {recommendation.historicalCorrection ? (
        <DemoPanel title={t("taskDetail.approval.autoCorrection")}>
          <p className="text-sm text-foreground">{recommendation.historicalCorrection.summary}</p>
          <div className="mt-4">
            <DemoCollapsible title={t("taskDetail.orchestration.technicalActivity")}>
              <DemoBulletList
                items={recommendation.historicalCorrection.timeline.map(
                  (entry) => `${entry.phase}: ${entry.detail}`,
                )}
              />
            </DemoCollapsible>
          </div>
        </DemoPanel>
      ) : null}

      <DemoPanel title={t("taskDetail.approval.whatYouAllow")}>
        <p className="text-sm leading-relaxed text-foreground">{t("taskDetail.approval.allowBody")}</p>
        <DemoBulletList
          items={[
            `Commit: ${lifecycle.deliveryLabels.commit}`,
            `Push: ${lifecycle.deliveryLabels.push}`,
            `Merge: ${lifecycle.deliveryLabels.merge}`,
            `Deploy: ${lifecycle.deliveryLabels.deploy}`,
          ]}
        />
        <p className="mt-4 text-xs text-muted-foreground">{t("taskDetail.approval.commitNote")}</p>
      </DemoPanel>

      <DemoPanel title={t("taskDetail.approval.decision")}>
        <form onSubmit={handleSubmit} className="space-y-5">
          {recommendation.kind !== "RECOMMENDED_APPROVE" ? (
            <p className="text-sm text-muted-foreground">{t("taskDetail.approval.notRecommended")}</p>
          ) : null}

          <div className="space-y-3 text-sm">
            {HUMAN_GATE_DECISIONS.map((optionDecision) => (
              <label key={optionDecision} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="approval-decision"
                  checked={decision === optionDecision}
                  disabled={submitting}
                  onChange={() => handleDecisionChange(optionDecision)}
                />
                <span>{formatHumanGateOptionLabel(optionDecision, locale)}</span>
              </label>
            ))}
          </div>

          {showsRevisionNoteField(decision) ? (
            <div className="space-y-2">
              <label htmlFor="approval-revision-note" className="text-sm font-medium text-foreground">
                {t("taskDetail.approval.revisionNoteLabel")}
              </label>
              <Textarea
                id="approval-revision-note"
                value={decisionNote}
                disabled={submitting}
                rows={4}
                onChange={(event) => setDecisionNote(event.target.value)}
                placeholder={t("taskDetail.approval.revisionNoteLabel")}
              />
            </div>
          ) : null}

          {showsRejectReasonField(decision) ? (
            <div className="space-y-2">
              <label htmlFor="approval-reject-reason" className="text-sm font-medium text-foreground">
                {t("taskDetail.approval.rejectReasonLabel")}
              </label>
              <p className="text-xs text-muted-foreground">{t("taskDetail.approval.rejectReasonHint")}</p>
              <Textarea
                id="approval-reject-reason"
                value={decisionNote}
                disabled={submitting}
                rows={3}
                onChange={(event) => setDecisionNote(event.target.value)}
                placeholder={t("taskDetail.approval.rejectReasonLabel")}
              />
            </div>
          ) : null}

          {showsAdditionalReviewFields(decision) ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="approval-review-type" className="text-sm font-medium text-foreground">
                  {t("taskDetail.approval.additionalReviewType")}
                </label>
                <select
                  id="approval-review-type"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={reviewType}
                  disabled={submitting}
                  onChange={(event) => setReviewType(event.target.value as AdditionalReviewType | "")}
                >
                  <option value="">{t("taskDetail.approval.selectReviewType")}</option>
                  {ADDITIONAL_REVIEW_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`taskDetail.approval.reviewTypes.${type}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="approval-additional-review-note" className="text-sm font-medium text-foreground">
                  {t("taskDetail.approval.additionalReviewNote")}
                </label>
                <Textarea
                  id="approval-additional-review-note"
                  value={decisionNote}
                  disabled={submitting}
                  rows={3}
                  onChange={(event) => setDecisionNote(event.target.value)}
                  placeholder={t("taskDetail.approval.additionalReviewNote")}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("taskDetail.approval.additionalReviewNotRouted")}
              </p>
            </div>
          ) : null}

          {requiresApprovalConfirmation(decision) ? (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmedReview}
                disabled={submitting}
                onChange={(event) => setConfirmedReview(event.target.checked)}
              />
              <span>{t("taskDetail.approval.confirmReview")}</span>
            </label>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {showPrimaryApprove ? (
              <Button type="submit" disabled={!canSubmitApproval() || submitting}>
                {submitting
                  ? t("taskDetail.approval.savingApproval")
                  : formatHumanGateSubmitLabel(decision, locale)}
              </Button>
            ) : recommendation.kind === "FIX_FIRST" ? (
              <Button type="button" variant="default" onClick={() => onGoToTab("evidence")}>
                {t("taskDetail.approval.viewIssues")}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => onGoToTab("evidence")}>
                {t("taskDetail.approval.viewDetails")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onGoToTab("evidence")}>
              {t("taskDetail.approval.viewTechnicalEvidence")}
            </Button>
            {!showPrimaryApprove && decision === "APPROVE_COMMIT" ? (
              <Button type="submit" variant="outline" disabled={!canSubmitApproval() || submitting}>
                {submitting ? t("taskDetail.approval.saving") : t("taskDetail.approval.approveCommitOverride")}
              </Button>
            ) : null}
            {!showPrimaryApprove && decision !== "APPROVE_COMMIT" ? (
              <Button type="submit" variant="outline" disabled={!canSubmitApproval() || submitting}>
                {submitting
                  ? t("taskDetail.approval.saving")
                  : formatHumanGateSubmitLabel(decision, locale)}
              </Button>
            ) : null}
          </div>

          {formError ? <p className="text-sm text-status-blocked">{formError}</p> : null}
          {error ? <p className="text-sm text-status-blocked">{error}</p> : null}
        </form>
      </DemoPanel>

      <DemoCollapsible title={t("taskDetail.contract.technicalDetails")}>
        <DemoKeyValueTable
          rows={[
            { label: "Checks (final)", value: lifecycle.checks.technicalSummary },
            { label: "Verdict", value: lifecycle.implementationVerdict ?? "—" },
            { label: "Worker attempt", value: `${lifecycle.workerAttemptNumber}/${lifecycle.workerAttemptLimit}` },
            { label: "Corrections", value: `${lifecycle.correctionsUsed}/${lifecycle.correctionLimit}` },
          ]}
        />
        {runner?.note ? (
          <p className="mt-4 text-xs text-muted-foreground">Worker note: {runner.note}</p>
        ) : null}
      </DemoCollapsible>
    </>
  );
}
