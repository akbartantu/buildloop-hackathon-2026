import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { TaskStatusLabel } from "@/components/site/task-status-label";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { useWorkspaceLabel } from "@/hooks/use-workspace-label";
import { useI18n } from "@/i18n/context";
import { formatTaskRef, nextActionLabel } from "@/lib/task-display";

export function TasksPage() {
  const { tasks, isLoading } = useWorkspaceTasks();
  const { label: workspaceLabel } = useWorkspaceLabel();
  const { t, locale, taskStatusLabel } = useI18n();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <DemoPageHeader
          title={t("tasks.title")}
          description={t("tasks.description", { workspace: workspaceLabel })}
        />
        <Button asChild className="shrink-0">
          <Link to="/app/tasks/new">
            <Plus className="mr-2 size-4" />
            {t("tasks.createNew")}
          </Link>
        </Button>
      </div>

      <DemoPanel title={t("tasks.allTasks")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : tasks.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("tasks.empty")}</p>
            <Button asChild>
              <Link to="/app/tasks/new">{t("tasks.createNew")}</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link
                  to="/app/tasks/$taskId"
                  params={{ taskId: task.id }}
                  className="block py-4 transition-colors hover:bg-muted/30 -mx-5 px-5 sm:-mx-6 sm:px-6 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <TaskStatusLabel
                      status={task.status}
                      className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-foreground"
                    />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatTaskRef(task.id)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">{task.goal}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{nextActionLabel(task.status, locale)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DemoPanel>
    </div>
  );
}
