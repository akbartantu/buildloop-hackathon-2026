import { ArrowRight, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DemoBulletList,
  DemoPanel,
  DemoSectionLabel,
  DemoStatusBanner,
} from "@/components/site/demo-ui";
import {
  abbreviateCommitSha,
  taskWorkspaceLabel,
} from "@/lib/repository/task-source-display";
import {
  getContractHandoff,
  type ContractHandoffAction,
} from "@/lib/contract-handoff";
import {
  formatTaskRef,
  taskVersion,
  type DemoTab,
} from "@/lib/task-display";
import {
  buildActivityEvents,
  contractVersionLabel,
  formatOverviewTimestamp,
  friendlyStatusLabel,
  getAttentionState,
  getContractSnapshot,
  getEvidenceSnapshot,
  getJourneyDescription,
  getJourneySteps,
  type JourneyStepState,
} from "@/lib/task-overview";
import { buildTaskLifecycleViewModel } from "@/lib/task-lifecycle";
import type { TaskRecord } from "@/lib/tasks-schema";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";

type TaskOverviewViewProps = {
  task: TaskRecord;
  running: boolean;
  approving: boolean;
  onHandoffAction: (action: ContractHandoffAction) => void;
  onGoToTab: (tab: DemoTab) => void;
};

function journeyIcon(state: JourneyStepState) {
  if (state === "complete") return <CheckCircle2 className="size-3.5 text-status-pass" />;
  if (state === "blocked") return <AlertCircle className="size-3.5 text-status-blocked" />;
  if (state === "current") return <Circle className="size-3.5 fill-status-review text-status-review" />;
  return <Circle className="size-3.5 text-muted-foreground/50" />;
}

export function TaskOverviewView({
  task,
  running,
  approving,
  onHandoffAction,
  onGoToTab,
}: TaskOverviewViewProps) {
  const { locale } = useI18n();
  const taskRef = formatTaskRef(task.id);
  const runner = task.runnerState;
  const lifecycle = buildTaskLifecycleViewModel(task);
  const handoff = getContractHandoff(task, { running, approving }, locale);
  const journey = getJourneySteps(task.status);
  const snapshot = getContractSnapshot(task);
  const evidence = getEvidenceSnapshot(task);
  const activity = buildActivityEvents(task);
  const attention = getAttentionState(task);
  const primaryDisabled =
    (handoff.primaryAction === "run" && running) ||
    (handoff.primaryAction === "approve" && approving);

  return (
    <div className="space-y-5">
      {/* Compact header */}
      <div className="space-y-3 border-b border-border pb-5">
        <div>
          <h1 className="text-xl font-semibold leading-snug tracking-tight text-foreground">
            {task.goal}
          </h1>
          <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
            {taskRef} · {taskWorkspaceLabel(task)} · {contractVersionLabel(task)}
            {task.sourceCommitSha ? ` · ${abbreviateCommitSha(task.sourceCommitSha)}` : ""}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="sr-only">Status</dt>
            <dd>
              <span className="text-foreground">{friendlyStatusLabel(task.status, locale)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Koreksi</dt>
            <dd className="font-mono text-foreground">
              {lifecycle.correctionsUsed} / {lifecycle.correctionLimit}
            </dd>
          </div>
          {lifecycle.implementationVerdict ? (
            <div>
              <dt className="text-muted-foreground">Verdict</dt>
              <dd className="font-mono text-foreground">{lifecycle.implementationVerdict}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted-foreground">Contract</dt>
            <dd className="text-foreground">{taskVersion(task)}</dd>
          </div>
        </dl>
      </div>

      {/* Progress journey */}
      <DemoPanel title="Execution journey">
        <ol className="flex flex-wrap items-center gap-1 text-xs">
          {journey.map((step, index) => (
            <li key={step.key} className="flex items-center gap-1">
              {index > 0 ? (
                <span className="mx-1 text-muted-foreground" aria-hidden="true">
                  →
                </span>
              ) : null}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1",
                  step.state === "complete" && "border-status-pass/30 bg-status-pass/5",
                  step.state === "current" && "border-status-review/40 bg-accent/50",
                  step.state === "blocked" && "border-status-blocked/40 bg-status-blocked/5",
                  step.state === "upcoming" && "border-border bg-muted/20 text-muted-foreground",
                )}
              >
                {journeyIcon(step.state)}
                {step.label}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {lifecycle.plainLanguageSummary || getJourneyDescription(task.status)}
        </p>
      </DemoPanel>

      {attention ? (
        <DemoStatusBanner
          status={
            task.status === "BLOCKED"
              ? "BLOCKED"
              : task.status === "FAILED"
                ? "FAILED"
                : "AWAITING_APPROVAL"
          }
          title={attention.title}
          description={attention.description}
        />
      ) : null}

      {/* Two-column layout */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-5">
          <DemoPanel title="Contract snapshot">
            <div className="space-y-4">
              <div>
                <DemoSectionLabel>Goal</DemoSectionLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">{snapshot.goal}</p>
              </div>
              <div>
                <DemoSectionLabel>Allowed</DemoSectionLabel>
                <DemoBulletList items={snapshot.allowed} />
              </div>
              <div>
                <DemoSectionLabel>Protected / Not allowed</DemoSectionLabel>
                <DemoBulletList items={snapshot.protected} />
              </div>
            </div>
            <Button
              variant="link"
              size="sm"
              className="mt-4 h-auto p-0 text-foreground"
              onClick={() => onGoToTab("contract")}
            >
              Lihat contract lengkap
              <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </DemoPanel>

          <DemoPanel title="Latest activity">
            {activity.length > 0 ? (
              <ul className="space-y-3">
                {activity.map((event, index) => (
                  <li key={`${event.label}-${index}`} className="flex gap-3 text-sm">
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        event.tone === "pass" && "bg-status-pass",
                        event.tone === "blocked" && "bg-status-blocked",
                        event.tone === "review" && "bg-status-review",
                        event.tone === "neutral" && "bg-muted-foreground/60",
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground">{event.label}</p>
                      {event.timestamp ? (
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {formatOverviewTimestamp(event.timestamp)}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>
            )}
            <Button
              variant="link"
              size="sm"
              className="mt-3 h-auto p-0 text-foreground"
              onClick={() => onGoToTab("orchestration")}
            >
              Lihat orchestration
              <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </DemoPanel>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <DemoPanel title="Orchestration">
            <OrchestrationSummary
              task={task}
              lifecycle={lifecycle}
              handoff={handoff}
              primaryDisabled={primaryDisabled}
              onHandoffAction={onHandoffAction}
            />
          </DemoPanel>

          <DemoPanel title="Evidence snapshot">
            {evidence.available ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                <SnapshotRow label="Files changed" value={String(evidence.filesChanged ?? 0)} />
                <SnapshotRow
                  label="Checks"
                  value={lifecycle.checks.friendlySummary}
                />
                <SnapshotRow
                  label="Protected paths changed"
                  value={String(evidence.protectedPathsChanged ?? 0)}
                />
                <SnapshotRow
                  label="Commands executed"
                  value={String(evidence.commandsExecuted ?? 0)}
                />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                Evidence akan muncul setelah orchestration mulai bekerja.
              </p>
            )}
            {evidence.available ? (
              <Button
                variant="link"
                size="sm"
                className="mt-3 h-auto p-0 text-foreground"
                onClick={() => onGoToTab("evidence")}
              >
                Lihat semua evidence
                <ArrowRight className="ml-1 size-3.5" />
              </Button>
            ) : null}
          </DemoPanel>
        </div>
      </div>

      {/* Primary next action */}
      <DemoPanel title="Langkah berikutnya">
        {handoff.statusNote ? (
          <p className="text-sm text-muted-foreground">{handoff.statusNote}</p>
        ) : null}
        <div className={cn("flex flex-wrap gap-3", handoff.statusNote && "mt-3")}>
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
          {attention ? (
            <Button variant="outline" onClick={() => onGoToTab(attention.ctaTab)}>
              {attention.ctaLabel}
            </Button>
          ) : null}
        </div>
      </DemoPanel>
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function OrchestrationSummary({
  task,
  lifecycle,
  handoff,
  primaryDisabled,
  onHandoffAction,
}: {
  task: TaskRecord;
  lifecycle: ReturnType<typeof buildTaskLifecycleViewModel>;
  handoff: ReturnType<typeof getContractHandoff>;
  primaryDisabled: boolean;
  onHandoffAction: (action: ContractHandoffAction) => void;
}) {
  const { locale } = useI18n();
  const runner = task.runnerState;

  if (task.status === "APPROVED_FOR_EXECUTION") {
    return (
      <>
        <p className="text-sm text-muted-foreground">
          Belum ada run. BuildLoop siap menjalankan task sesuai contract.
        </p>
        <Button
          className="mt-3"
          onClick={() => onHandoffAction("run")}
          disabled={primaryDisabled}
        >
          {handoff.primaryLabel}
        </Button>
      </>
    );
  }

  if (
    task.status === "INSPECTING" ||
    task.status === "RUNNING" ||
    task.status === "CHECKING" ||
    task.status === "NEEDS_CORRECTION"
  ) {
    return (
      <>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Phase</dt>
            <dd className="font-mono text-foreground">{friendlyStatusLabel(task.status, locale)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Worker attempt</dt>
            <dd className="font-mono text-foreground">
              {lifecycle.workerAttemptNumber} / {lifecycle.workerAttemptLimit}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Corrections used</dt>
            <dd className="font-mono text-foreground">
              {lifecycle.correctionsUsed} / {lifecycle.correctionLimit}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Diperbarui</dt>
            <dd className="font-mono text-[11px] text-foreground">
              {formatOverviewTimestamp(task.updatedAt) ?? "—"}
            </dd>
          </div>
        </dl>
        <Button className="mt-3" variant="outline" onClick={() => onHandoffAction("view-orchestration")}>
          Lihat Orchestration
        </Button>
      </>
    );
  }

  if (task.status === "PASS" || task.status === "AWAITING_APPROVAL" || task.status === "CLOSED") {
    return (
      <>
        <p className="text-sm font-medium text-foreground">{lifecycle.approval.overviewSummary}</p>
        <p className="mt-2 text-sm text-foreground">
          <span className="font-medium text-status-pass">{lifecycle.implementationVerdict ?? "—"}</span>
          {" · "}
          Worker {lifecycle.workerAttemptNumber}/{lifecycle.workerAttemptLimit}
          {" · "}
          Koreksi {lifecycle.correctionsUsed}/{lifecycle.correctionLimit}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{lifecycle.plainLanguageSummary}</p>
        {lifecycle.approval.historicalCorrection ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {lifecycle.approval.historicalCorrection.summary}
          </p>
        ) : null}
        {task.status === "CLOSED" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Commit: {lifecycle.deliveryLabels.commit} · Push: {lifecycle.deliveryLabels.push}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            PASS tidak melakukan commit, push, merge, atau deploy otomatis.
          </p>
        )}
        <Button className="mt-3" onClick={() => onHandoffAction(task.status === "CLOSED" ? "view-approval" : "view-evidence")}>
          {task.status === "CLOSED" ? "Lihat approval" : "Lihat Evidence"}
        </Button>
      </>
    );
  }

  if (task.status === "FAILED") {
    return (
      <>
        <p className="text-sm text-status-blocked">
          FAILED · Worker {lifecycle.workerAttemptNumber}/{lifecycle.workerAttemptLimit} · Koreksi{" "}
          {lifecycle.correctionsUsed}/{lifecycle.correctionLimit}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {runner?.note ?? "Checker gagal setelah batas koreksi."}
        </p>
        <Button className="mt-3" variant="outline" onClick={() => onHandoffAction("view-evidence")}>
          Lihat hasil
        </Button>
      </>
    );
  }

  if (task.status === "BLOCKED") {
    return (
      <>
        <p className="text-sm text-status-blocked">BLOCKED sebelum worker dipanggil.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {task.blockedReasons[0]?.explanation ?? "Guardrail mencegah eksekusi otomatis."}
        </p>
        <Button className="mt-3" variant="outline" onClick={() => onHandoffAction("view-evidence")}>
          Tinjau alasan block
        </Button>
      </>
    );
  }

  if (task.status === "CONTRACT_READY" || task.status === "DRAFT") {
    return (
      <>
        <p className="text-sm text-muted-foreground">
          Setujui contract terlebih dahulu sebelum orchestration dapat dimulai.
        </p>
        <Button
          className="mt-3"
          onClick={() => onHandoffAction("approve")}
          disabled={primaryDisabled}
        >
          {handoff.primaryLabel}
        </Button>
      </>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">{handoff.statusNote ?? "Lanjutkan alur task."}</p>
  );
}
