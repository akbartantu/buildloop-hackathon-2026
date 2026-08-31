import { Link } from "@tanstack/react-router";
import { ArrowRight, GitBranch, Lock, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DemoBulletList,
  DemoMetricCard,
  DemoPageHeader,
  DemoPanel,
} from "@/components/site/demo-ui";
import { TaskStatusLabel } from "@/components/site/task-status-label";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { useWorkspaceLabel } from "@/hooks/use-workspace-label";
import { useI18n } from "@/i18n/context";
import { formatTaskRef } from "@/lib/task-display";
import type { TaskRecord } from "@/lib/tasks-schema";
import { isPendingHumanApproval } from "@/lib/human-approval";

function countPendingApprovals(tasks: TaskRecord[]): number {
  return tasks.filter((task) => isPendingHumanApproval(task)).length;
}

function latestRunTask(tasks: TaskRecord[]): TaskRecord | null {
  return (
    tasks.find((task) => task.runnerState?.runnerInvoked) ??
    tasks.find((task) => task.status !== "DRAFT" && task.status !== "CONTRACT_READY") ??
    null
  );
}

export function HomePage() {
  const { tasks, isLoading } = useWorkspaceTasks();
  const { label: workspaceLabel } = useWorkspaceLabel();
  const { t, taskStatusLabel } = useI18n();
  const latestTask = tasks[0] ?? null;
  const recentRun = latestRunTask(tasks);
  const pendingApprovals = countPendingApprovals(tasks);
  const flowSteps = [t("home.flowStep1"), t("home.flowStep2"), t("home.flowStep3"), t("home.flowStep4")];

  return (
    <div className="space-y-6">
      <DemoPageHeader
        title={t("home.title")}
        description={t("home.description").replace("{workspace}", workspaceLabel)}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DemoMetricCard label={t("tasks.workspace")} value={workspaceLabel} />
        <DemoMetricCard
          label={t("home.activeTasks")}
          value={isLoading ? "…" : String(tasks.length)}
        />
        <DemoMetricCard
          label={t("home.latestRun")}
          value={recentRun ? taskStatusLabel(recentRun.status) : t("home.noneYet")}
          tone={
            recentRun?.status === "PASS" || recentRun?.status === "AWAITING_APPROVAL"
              ? "pass"
              : recentRun?.status === "BLOCKED" || recentRun?.status === "FAILED"
                ? "blocked"
                : "neutral"
          }
        />
        <DemoMetricCard
          label={t("home.pendingApprovals")}
          value={String(pendingApprovals)}
          tone={pendingApprovals > 0 ? "review" : "neutral"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DemoPanel title={t("home.latestTask")}>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : latestTask ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <TaskStatusLabel
                  status={latestTask.status}
                  className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-foreground"
                />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatTaskRef(latestTask.id)}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-foreground">{latestTask.goal}</p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/app/tasks/$taskId" params={{ taskId: latestTask.id }}>
                  {t("home.openTask")}
                  <ArrowRight className="ml-2 size-3.5" />
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("home.noTasksYet")}</p>
          )}
        </DemoPanel>

        <DemoPanel title={t("home.latestRun")}>
          {recentRun ? (
            <div className="space-y-3">
              <DemoBulletList
                items={[
                  `${t("home.runStatus")}: ${taskStatusLabel(recentRun.status)}`,
                  `${t("home.corrections")}: ${recentRun.runnerState?.correctionCount ?? 0} / ${recentRun.contract.maxAttempts}`,
                  `${t("home.workerInvoked")}: ${recentRun.runnerState?.runnerInvoked ? t("home.yes") : t("home.no")}`,
                ]}
              />
              <Button variant="outline" size="sm" asChild>
                <Link to="/app/runs">{t("home.viewAllRuns")}</Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("home.noRunsYet")}</p>
          )}
        </DemoPanel>
      </div>

      <DemoPanel title={t("home.flowTitle")}>
        <DemoBulletList items={flowSteps} />
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/app/tasks/new">
              <Plus className="mr-2 size-4" />
              {t("home.createNewTask")}
            </Link>
          </Button>
          {pendingApprovals > 0 ? (
            <Button variant="outline" asChild>
              <Link to="/app/approvals">
                <ShieldCheck className="mr-2 size-4" />
                {t("home.pendingApprovalCount").replace("{count}", String(pendingApprovals))}
              </Link>
            </Button>
          ) : null}
        </div>
        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t("home.sandboxNote")}
        </p>
      </DemoPanel>

      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/projects">
            <GitBranch className="mr-2 size-4" />
            {t("home.viewProjects")}
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/tasks">{t("tasks.allTasks")}</Link>
        </Button>
      </div>
    </div>
  );
}
