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

      {progress.phaseRailLabels.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          {progress.phaseRailLabels.map((label, index) => (
            <span key={`${label}-${index}`} className="inline-flex items-center gap-2">
              {index > 0 ? <span aria-hidden="true">━</span> : null}
              <span className="text-foreground">{label}</span>
            </span>
          ))}
        </div>
      ) : null}

      <ol className="space-y-2">
        {progress.steps.map((step) => {
          const presentation = progressVisualPresentation(step.visualState, locale);
          return (
            <li
              key={step.key}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                presentation.borderClass,
                step.visualState === "active" && "bg-status-review/5",
                step.visualState === "completed" && "bg-status-pass/5",
                step.visualState === "failed" && "bg-destructive/5",
                step.visualState === "blocked" && "bg-status-blocked/5",
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.detail}</p>
              </div>
              <SemanticStatusInline presentation={presentation} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function progressPanelContainsFakePercentage(progress: RunProgressViewModel): boolean {
  const serialized = JSON.stringify(progress);
  return /\b\d{1,3}%\s*(complete|done|progress)?\b/i.test(serialized);
}
