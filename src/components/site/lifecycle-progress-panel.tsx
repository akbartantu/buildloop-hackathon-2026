import { cn } from "@/lib/utils";
import type { RunProgressViewModel } from "@/lib/lifecycle-progress";
import { SemanticStatusInline } from "@/components/site/semantic-status-badge";
import { progressVisualPresentation } from "@/lib/status-presentation";
import { useI18n } from "@/i18n/context";

type LifecycleProgressPanelProps = {
  progress: RunProgressViewModel;
};

export function LifecycleProgressPanel({ progress }: LifecycleProgressPanelProps) {
  const { locale } = useI18n();

  return (
    <div className="space-y-4">
      {(progress.runSummary || progress.lastActivity || progress.autoRefreshLabel) && (
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
          {progress.runSummary ? (
            <p className="text-sm font-medium text-foreground">{progress.runSummary}</p>
          ) : null}
          {progress.lastActivity ? (
            <p className="mt-1 text-xs text-muted-foreground">{progress.lastActivity}</p>
          ) : null}
          {progress.autoRefreshLabel ? (
            <p className="mt-1 text-[11px] text-muted-foreground/80">{progress.autoRefreshLabel}</p>
          ) : null}
        </div>
      )}

      {progress.componentActivity ? (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground">
            {progress.componentActivity.worker}
          </span>
          <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground">
            {progress.componentActivity.checker}
          </span>
        </div>
      ) : null}

      {progress.longRunningMessage ? (
        <p className="text-sm text-muted-foreground">{progress.longRunningMessage}</p>
      ) : null}

      {progress.delayedWarning ? (
        <p className="text-sm text-status-review">{progress.delayedWarning}</p>
      ) : null}

      <div className="overflow-x-auto pb-1">
        <ol
          className="flex min-w-max gap-3"
          aria-label="Orchestration lifecycle stages"
        >
          {progress.steps.map((step) => {
            const presentation = progressVisualPresentation(step.visualState, locale);
            return (
              <li
                key={step.key}
                className={cn(
                  "flex w-[9.75rem] shrink-0 flex-col rounded-lg border px-3 py-3",
                  presentation.borderClass,
                  step.visualState === "active" && "bg-status-review/5",
                  step.visualState === "completed" && "bg-status-pass/5",
                  step.visualState === "failed" && "bg-destructive/5",
                  step.visualState === "blocked" && "bg-status-blocked/5",
                  step.visualState === "waiting" && "bg-muted/20",
                  step.visualState === "skipped" && "bg-muted/10",
                )}
              >
                <SemanticStatusInline presentation={presentation} />
                <p className="mt-2 text-sm font-medium leading-snug text-foreground">{step.label}</p>
                <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
                  {step.detail}
                </p>
                <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {step.statusLabel}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export function progressPanelContainsFakePercentage(progress: RunProgressViewModel): boolean {
  const serialized = JSON.stringify(progress);
  return /\b\d{1,3}%\s*(complete|done|progress)?\b/i.test(serialized);
}

export function lifecycleStageVisualStates(progress: RunProgressViewModel): string[] {
  return progress.steps.map((step) => step.visualState);
}
