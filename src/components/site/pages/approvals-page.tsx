import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { TaskStatusLabel } from "@/components/site/task-status-label";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { useI18n } from "@/i18n/context";
import { formatTaskRef, nextActionLabel } from "@/lib/task-display";
import { isPendingHumanApproval } from "@/lib/human-approval";
import type { TaskRecord } from "@/lib/tasks-schema";

function isAwaitingApproval(task: TaskRecord): boolean {
  return isPendingHumanApproval(task);
}

export function ApprovalsPage() {
  const { tasks, isLoading } = useWorkspaceTasks();
  const { t, locale } = useI18n();
  const pending = tasks.filter(isAwaitingApproval);

  return (
    <div className="space-y-6">
      <DemoPageHeader title={t("approvals.title")} description={t("approvals.description")} />

      <DemoPanel title={t("approvals.panelTitle")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : pending.length === 0 ? (
          <div className="space-y-4 py-4 text-center">
            <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">{t("approvals.emptyTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("approvals.emptyDescription")}</p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/app/tasks">{t("approvals.viewTasks")}</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((task) => (
              <li key={task.id} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <TaskStatusLabel
                        status={task.status}
                        className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-status-review"
                      />
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatTaskRef(task.id)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">{task.goal}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {nextActionLabel(task.status, locale)}
                    </p>
                    <div className="mt-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {t("approvals.sensitiveActions")}
                      </p>
                      <p className="mt-1 text-xs text-foreground">
                        {t("approvals.sensitiveDetail", {
                          actions: t("approvals.sensitiveActionsList"),
                        })}
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{t("approvals.orchestratorVerdict")}</p>
                  </div>
                  <Button asChild className="shrink-0">
                    <Link to="/app/tasks/$taskId" params={{ taskId: task.id }} search={{ tab: "approval" }}>
                      {t("approvals.reviewApproval")}
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DemoPanel>
    </div>
  );
}
