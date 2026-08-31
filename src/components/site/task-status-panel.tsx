import { StatusMark } from "./status-pill";
import { TaskStatusLabel } from "./task-status-label";
import { useI18n } from "@/i18n/context";
import type { TaskRecord } from "@/lib/tasks-schema";
import {
  formatBlockedReasonDetailLine,
  formatBlockedReasonExplanation,
  formatPrimaryBlockedExplanation,
  formatBlockedReasonTitle,
} from "@/lib/blocked-reason-presentation";

/** Panel status task + evidence. Tidak pernah mengklaim kode sudah dijalankan. */
export function TaskStatusPanel({ task }: { task: TaskRecord }) {
  const { t, taskStatusLabel, locale } = useI18n();
  const blocked = task.status === "BLOCKED";
  const runner = task.runnerState;

  return (
    <div className="rounded-md border border-border bg-background p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("tasks.title")}
          </p>
          <h3 className="mt-2 font-mono text-base font-semibold tracking-tight text-foreground">
            <TaskStatusLabel status={task.status} />
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{taskStatusLabel(task.status)}</p>
        </div>
        {blocked ? <StatusMark status="BLOCKED" className="shrink-0" /> : null}
      </div>

      {blocked && task.blockedReasons.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("taskDetail.evidence.reasons")}
          </p>
          <ul className="mt-3 space-y-3">
            {task.blockedReasons.map((reason) => (
              <li key={reason.rule} className="border-l-2 border-boundary pl-3">
                <p className="font-mono text-[11px] font-medium text-foreground">
                  {formatBlockedReasonTitle(reason, locale)}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">
                  {formatBlockedReasonExplanation(reason, locale)}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {formatBlockedReasonDetailLine(reason, locale)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {blocked && task.blockedReasons.length === 0 ? (
        <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
          {formatPrimaryBlockedExplanation(task.blockedReasons, locale, "taskDetail.evidence.blockedFallback")}
        </p>
      ) : null}

      {runner ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("taskDetail.tabs.evidence")}
          </p>
          <dl className="mt-3 space-y-2 font-mono text-[11px]">
            <EvidenceRow label="runner dipanggil" value={runner.runnerInvoked ? "true" : "false"} />
            <EvidenceRow label="files changed" value={String(runner.filesChanged)} />
            <EvidenceRow label="commands executed" value={String(runner.commandsExecuted)} />
            <EvidenceRow label="commit" value={runner.commit ? "true" : "false"} />
            <EvidenceRow label="push" value={runner.push ? "true" : "false"} />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{runner.note}</p>
        </div>
      ) : null}
    </div>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-1.5">
      <dt className="uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
