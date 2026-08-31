import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TaskRecord } from "@/lib/tasks-schema";
import { buildTaskListItemViewModel } from "@/lib/task-list";
import { taskStatusPresentation } from "@/lib/status-presentation";
import { SemanticStatusBadge } from "@/components/site/semantic-status-badge";
import { useI18n } from "@/i18n/context";

export function TaskListRow({ task }: { task: TaskRecord }) {
  const { locale } = useI18n();
  const item = buildTaskListItemViewModel(task, locale);
  const statusPresentation = taskStatusPresentation(task.status, locale);

  return (
    <article
      className={cn(
        "rounded-lg border border-border bg-card/40 p-4 transition-colors",
        "hover:border-border/80 hover:bg-muted/20 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/40",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Link
          to="/app/tasks/$taskId"
          params={{ taskId: task.id }}
          search={{ tab: item.defaultTab }}
          className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <SemanticStatusBadge presentation={statusPresentation} />
            <span className="font-mono text-[11px] text-muted-foreground">{item.taskRef}</span>
          </div>

          <h2 className="mt-2 text-sm font-medium leading-snug text-foreground">{task.goal}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.explanation}</p>
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">{item.metadataLine}</p>
        </Link>

        <div className="shrink-0 sm:pt-0.5">
          <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
            <Link
              to="/app/tasks/$taskId"
              params={{ taskId: task.id }}
              search={{ tab: item.primaryAction.tab }}
            >
              {item.primaryAction.label}
              <ArrowRight className="ml-1.5 size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
