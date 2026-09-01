import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { TaskListRow } from "@/components/site/task-list-row";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { useWorkspaceLabel } from "@/hooks/use-workspace-label";
import { useI18n } from "@/i18n/context";
import { sortTasksByRecency } from "@/lib/task-list";

export function TasksPage() {
  const { tasks, isLoading } = useWorkspaceTasks();
  const { label: workspaceLabel } = useWorkspaceLabel();
  const { t } = useI18n();
  const sortedTasks = sortTasksByRecency(tasks);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <DemoPageHeader
          title={t("tasks.title")}
          description={t("tasks.description", { workspace: workspaceLabel })}
        />
        <Button asChild className="shrink-0">
          <Link to="/app/tasks/new" data-tour="create-task">
            <Plus className="mr-2 size-4" />
            {t("tasks.createNew")}
          </Link>
        </Button>
      </div>

      <DemoPanel title={t("tasks.allTasks")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : sortedTasks.length === 0 ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border px-4 py-6">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{t("tasks.list.emptyTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("tasks.list.emptyDescription")}</p>
            </div>
            <Button asChild>
              <Link to="/app/tasks/new">{t("tasks.createNew")}</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {sortedTasks.map((task) => (
              <li key={task.id}>
                <TaskListRow task={task} />
              </li>
            ))}
          </ul>
        )}
      </DemoPanel>
    </div>
  );
}
