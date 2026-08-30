import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  FileText,
  GitBranch,
  Layers,
  Shield,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { TaskRecord } from "@/lib/tasks-schema";
import type { HumanGateDecision } from "@/lib/human-approval";
import {
  buildTaskLifecycleViewModel,
  formatLifecycleStepLabel,
  lifecycleStepIconState,
  type TaskLifecycleViewModel,
} from "@/lib/task-lifecycle";
import { shouldRenderTabIcon } from "@/lib/approval-recommendation";
import {
  getHumanApprovalOutcome,
  HUMAN_GATE_UI_OPTIONS,
  isPendingHumanApproval,
} from "@/lib/human-approval";
import { isApprovalGateOpen, isOrchestrationInProgress } from "@/lib/evidence-analysis";
import { cn } from "@/lib/utils";
import { TaskOverviewView } from "@/components/site/task-overview-view";
import { friendlyStatusLabel } from "@/lib/task-overview";
import { useI18n } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/en";
import { translate, type Locale } from "@/i18n";
import { en, id } from "@/i18n";

type TaskDetailTabsProps = {
  task: TaskRecord;
  initialTab?: DemoTab;
  approving: boolean;
  running: boolean;
  submittingHumanApproval: boolean;
  error: string | null;
  onApprove: () => void;
  onRun: () => void;
  onSubmitHumanApproval: (input: { decision: HumanGateDecision; note?: string }) => void;
  onEdit: () => void;
  onBack: () => void;
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
}: TaskDetailTabsProps) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<DemoTab>(() => initialTab ?? suggestedTab(task.status));
  const blocked = task.status === "BLOCKED";
  const locked = task.status === "APPROVED_FOR_EXECUTION" || Boolean(task.lockedAt);
  const canRun = task.status === "APPROVED_FOR_EXECUTION";
  const lifecycle = buildTaskLifecycleViewModel(task);
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
            error={error}
            locale={locale}
            onEdit={onEdit}
            onSubmit={onSubmitHumanApproval}
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

      <DemoCollapsible title="Detail teknis untuk developer">
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
            lifecycle.correction.kind === "human"
              ? t("taskDetail.orchestration.revisionFromYou")
              : t("taskDetail.orchestration.autoCorrection")
          }
          description={lifecycle.orchestrationUserSummary}
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
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {lifecycle.orchestrationSteps.map((step) => {
            const icon = lifecycleStepIconState(step.state);
            const suffix = formatLifecycleStepLabel(step.state);
            return (
              <li
                key={step.key}
                className={cn(
                  "rounded-lg border px-3 py-3",
                  icon === "done" && "border-status-pass/30 bg-status-pass/5",
                  icon === "active" && "border-status-review/40 bg-accent/50",
                  icon === "blocked" && "border-status-blocked/40 bg-status-blocked/5",
                  icon === "neutral" && "border-border bg-muted/20",
                )}
              >
                <div className="flex items-center gap-2">
                  {icon === "done" ? (
                    <CheckCircle2 className="size-4 text-status-pass" />
                  ) : icon === "active" ? (
                    <Sparkles className="size-4 text-status-review" />
                  ) : icon === "blocked" ? (
                    <Circle className="size-4 text-status-blocked" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium uppercase tracking-[0.08em]">{step.label}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                {suffix ? (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{suffix}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </DemoPanel>

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
                    {approval === "auto_approved" ? "AUTO_APPROVED_BY_POLICY" : approval} · {status}
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
              { label: "Phase", value: runner.orchestration.phase },
              { label: "Approval", value: runner.orchestration.approvalType ?? "—" },
              { label: "Policy", value: runner.orchestration.policyDecision ?? "—" },
              {
                label: "Security review",
                value: runner.orchestration.securityReviewInvoked ? "Invoked" : "Skipped",
              },
              {
                label: "Corrections",
                value: String(runner.orchestration.correctionCount ?? lifecycle.correctionsUsed),
              },
              { label: "Verdict", value: runner.orchestration.finalVerdict ?? lifecycle.implementationVerdict ?? "—" },
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
            {running ? t("taskDetail.orchestration.running") : t("taskDetail.orchestration.runOrchestrator")}
          </Button>
        </div>
      ) : lifecycle.showOrchestratorNotStarted ? (
        <p className="text-sm text-muted-foreground">{t("taskDetail.orchestration.notStarted")}</p>
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
          description={
            task.blockedReasons[0]?.explanation ?? t("taskDetail.evidence.blockedFallback")
          }
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <DemoPanel title={t("taskDetail.evidence.summary")}>
            <DemoKeyValueTable
              rows={[
                { label: "Files changed", value: String(runner?.filesChanged ?? 0) },
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
                  ? task.blockedReasons.map((reason) => reason.explanation)
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
          title={lifecycle.executionCompleteLabel ?? "Perubahan selesai"}
          description={lifecycle.plainLanguageSummary}
        />
      ) : (
        <DemoPageHeader
          title={t("taskDetail.evidence.runTitle")}
          meta={`${taskRef} · ${friendlyStatusLabel(task.status, locale)}`}
        />
      )}

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

      <DemoPanel title={t("taskDetail.evidence.plainSummary")}>
        <p className="text-sm leading-relaxed text-foreground">{lifecycle.plainLanguageSummary}</p>
      </DemoPanel>

      <DemoCollapsible title="Detail teknis untuk developer">
        <DemoKeyValueTable
          rows={[
            {
              label: "Implementation verdict",
              value:
                lifecycle.implementationVerdict === "PASS" ? (
                  <span className="text-status-pass">PASS</span>
                ) : (
                  (lifecycle.implementationVerdict ?? task.status)
                ),
            },
            {
              label: "Checks",
              value: lifecycle.checks.technicalSummary,
            },
            { label: "Files changed", value: String(runner?.filesChanged ?? 0) },
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

        {runner?.evidence?.length ? (
          <div className="mt-4 border-t border-border pt-4">
            <DemoSectionLabel>Riwayat checker (teknis)</DemoSectionLabel>
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
  error,
  locale,
  onEdit,
  onSubmit,
  onGoToTab,
}: {
  task: TaskRecord;
  taskRef: string;
  lifecycle: TaskLifecycleViewModel;
  submitting: boolean;
  error: string | null;
  locale: Locale;
  onEdit: () => void;
  onSubmit: (input: { decision: HumanGateDecision; note?: string }) => void;
  onGoToTab: (tab: DemoTab) => void;
}) {
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(locale, key, params);
  const runner = task.runnerState;
  const outcome = getHumanApprovalOutcome(task);
  const pending = isPendingHumanApproval(task);
  const gateOpen = isApprovalGateOpen(task);
  const recommendation = lifecycle.approval;
  const [decision, setDecision] = useState<HumanGateDecision>("APPROVE_COMMIT");
  const [confirmedReview, setConfirmedReview] = useState(false);

  const selectedOption =
    HUMAN_GATE_UI_OPTIONS.find((option) => option.decision === decision) ??
    HUMAN_GATE_UI_OPTIONS[0]!;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmedReview || submitting) {
      return;
    }
    onSubmit({ decision });
  }

  function recommendationBannerStatus(): "PASS" | "FAILED" | "AWAITING_APPROVAL" | "NEEDS HUMAN REVIEW" | "BLOCKED" {
    if (runner?.commitApproved) return "PASS";
    if (recommendation.kind === "RECOMMENDED_APPROVE") return "PASS";
    if (recommendation.kind === "FIX_FIRST") return "FAILED";
    if (task.status === "BLOCKED") return "BLOCKED";
    return "NEEDS HUMAN REVIEW";
  }

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
          title="Keputusan approval"
          meta={`${taskRef} · ${friendlyStatusLabel(task.status)}`}
        />
        <DemoStatusBanner
          status={outcome.kind === "commit_approved" ? "PASS" : "NEEDS HUMAN REVIEW"}
          title={outcome.kind === "commit_approved" ? t("taskDetail.approval.commitApprovedTitle") : outcome.title}
          description={
            outcome.kind === "commit_approved"
              ? t("taskDetail.approval.commitApprovedBody")
              : outcome.description
          }
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
          </>
        ) : null}

        {recommendation.historicalCorrection ? (
          <DemoPanel title={t("taskDetail.approval.autoCorrection")}>
            <p className="text-sm text-foreground">{recommendation.historicalCorrection.summary}</p>
          </DemoPanel>
        ) : null}

        {runner?.humanApprovals?.length ? (
          <DemoCollapsible title={t("taskDetail.approval.auditTrail")}>
            <ul className="space-y-2 font-mono text-xs text-muted-foreground">
              {runner.humanApprovals.map((entry) => (
                <li key={`${entry.decision}-${entry.createdAt}`}>
                  {entry.decision} · {entry.action} · run {entry.runId ?? "—"} ·{" "}
                  {new Date(entry.createdAt).toLocaleString("id-ID")}
                </li>
              ))}
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
        <DemoPanel title="Kenapa BuildLoop merekomendasikannya?">
          <DemoBulletList items={recommendation.reasonBullets} />
        </DemoPanel>
      ) : null}

      {recommendation.unresolvedIssues.length ? (
        <DemoPanel title="Masalah yang masih perlu ditangani">
          <DemoBulletList items={recommendation.unresolvedIssues} />
        </DemoPanel>
      ) : null}

      {recommendation.historicalCorrection ? (
        <DemoPanel title="Koreksi otomatis">
          <p className="text-sm text-foreground">{recommendation.historicalCorrection.summary}</p>
          <div className="mt-4">
            <DemoCollapsible title="Lihat detail koreksi">
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
            {HUMAN_GATE_UI_OPTIONS.map((option) => (
              <label key={option.decision} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="approval-decision"
                  checked={decision === option.decision}
                  disabled={submitting}
                  onChange={() => setDecision(option.decision)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

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

          <div className="flex flex-wrap gap-3">
            {showPrimaryApprove ? (
              <Button type="submit" disabled={!confirmedReview || submitting}>
                {submitting ? t("taskDetail.approval.savingApproval") : selectedOption.submitLabel}
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
              <Button type="submit" variant="outline" disabled={!confirmedReview || submitting}>
                {submitting ? t("taskDetail.approval.saving") : t("taskDetail.approval.approveCommitOverride")}
              </Button>
            ) : null}
            {!showPrimaryApprove && decision !== "APPROVE_COMMIT" ? (
              <Button type="submit" variant="outline" disabled={!confirmedReview || submitting}>
                {submitting ? t("taskDetail.approval.saving") : selectedOption.submitLabel}
              </Button>
            ) : null}
          </div>

          {error ? <p className="text-sm text-status-blocked">{error}</p> : null}
        </form>
      </DemoPanel>

      <DemoCollapsible title="Detail teknis untuk developer">
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
