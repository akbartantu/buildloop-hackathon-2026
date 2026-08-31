import { Link } from "@tanstack/react-router";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { TaskStatusLabel } from "@/components/site/task-status-label";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { useI18n } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/en";
import { formatTaskRef } from "@/lib/task-display";
import type { TaskRecord } from "@/lib/tasks-schema";
import { semanticToneIconClass, taskStatusSemanticTone } from "@/lib/status-presentation";

function isRunTask(task: TaskRecord): boolean {
  if (task.runnerState?.runnerInvoked) return true;
  return [
    "INSPECTING",
    "RUNNING",
    "CHECKING",
    "NEEDS_CORRECTION",
    "PASS",
    "FAILED",
    "BLOCKED",
    "AWAITING_APPROVAL",
  ].includes(task.status);
}

function runDecision(
  task: TaskRecord,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  if (task.status === "PASS" || task.status === "AWAITING_APPROVAL") return t("runs.decision.pass");
  if (task.status === "FAILED") return t("runs.decision.failed");
  if (task.status === "BLOCKED") return t("runs.decision.blocked");
  if (["RUNNING", "CHECKING", "NEEDS_CORRECTION", "INSPECTING"].includes(task.status)) {
    return t("runs.decision.inProgress");
  }
  if (task.status === "APPROVED_FOR_EXECUTION") return t("runs.decision.ready");
  return t("runs.decision.none");
}

export function RunsPage() {
  const { tasks, isLoading } = useWorkspaceTasks();
  const { t } = useI18n();
  const runs = tasks.filter(isRunTask);

  return (
    <div className="space-y-6">
      <DemoPageHeader title={t("runs.title")} description={t("runs.description")} />

      <DemoPanel title={t("runs.panelTitle")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : runs.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("runs.empty")}</p>
            <Link
              to="/app/tasks"
              className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("runs.openTasks")}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">{t("runs.columns.task")}</th>
                  <th className="pb-3 pr-4 font-medium">{t("runs.columns.status")}</th>
                  <th className="pb-3 pr-4 font-medium">{t("runs.columns.corrections")}</th>
                  <th className="pb-3 pr-4 font-medium">{t("runs.columns.decision")}</th>
                  <th className="pb-3 pr-4 font-medium">{t("runs.columns.updated")}</th>
                  <th className="pb-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {runs.map((task) => (
                  <tr key={task.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {formatTaskRef(task.id)}
                      </p>
                      <p className="mt-1 max-w-xs truncate text-foreground">{task.goal}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <TaskStatusLabel
                        status={task.status}
                        className={`font-mono text-[11px] uppercase tracking-[0.1em] ${semanticToneIconClass(taskStatusSemanticTone(task.status))}`}
                      />
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-foreground">
                      {task.runnerState?.correctionCount ?? 0} / {task.contract.maxAttempts}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-foreground">
                      {runDecision(task, t)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-[10px] text-muted-foreground">
                      {new Date(task.updatedAt).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <Link
                        to="/app/tasks/$taskId"
                        params={{ taskId: task.id }}
                        search={{ tab: "orchestration" }}
                        className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {t("runs.inspect")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DemoPanel>

      <p className="text-xs text-muted-foreground">{t("runs.footer")}</p>
    </div>
  );
}
