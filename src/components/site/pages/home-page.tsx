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
  const { taskStatusLabel } = useI18n();
  const latestTask = tasks[0] ?? null;
  const recentRun = latestRunTask(tasks);
  const pendingApprovals = countPendingApprovals(tasks);

  return (
    <div className="space-y-6">
      <DemoPageHeader
        title="Ringkasan operasional"
        description={`Workspace ${workspaceLabel} — lihat apa yang sedang berjalan di BuildLoop.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DemoMetricCard label="Workspace" value={workspaceLabel} />
        <DemoMetricCard
          label="Task aktif"
          value={isLoading ? "…" : String(tasks.length)}
        />
        <DemoMetricCard
          label="Run terakhir"
          value={recentRun ? taskStatusLabel(recentRun.status) : "Belum ada"}
          tone={
            recentRun?.status === "PASS" || recentRun?.status === "AWAITING_APPROVAL"
              ? "pass"
              : recentRun?.status === "BLOCKED" || recentRun?.status === "FAILED"
                ? "blocked"
                : "neutral"
          }
        />
        <DemoMetricCard
          label="Approval tertunda"
          value={String(pendingApprovals)}
          tone={pendingApprovals > 0 ? "review" : "neutral"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DemoPanel title="Task terbaru">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Memuat…</p>
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
                  Buka task
                  <ArrowRight className="ml-2 size-3.5" />
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Belum ada task. Buat task pertama untuk memulai alur contract → orchestrator.
            </p>
          )}
        </DemoPanel>

        <DemoPanel title="Run terakhir">
          {recentRun ? (
            <div className="space-y-3">
              <DemoBulletList
                items={[
                  `Status: ${recentRun.status}`,
                  `Koreksi: ${recentRun.runnerState?.correctionCount ?? 0} / ${recentRun.contract.maxAttempts}`,
                  `Worker dipanggil: ${recentRun.runnerState?.runnerInvoked ? "Ya" : "Tidak"}`,
                ]}
              />
              <Button variant="outline" size="sm" asChild>
                <Link to="/app/runs">Lihat semua run</Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Belum ada run orchestrator. Setujui contract lalu jalankan orchestrator dari task detail.
            </p>
          )}
        </DemoPanel>
      </div>

      <DemoPanel title="Alur BuildLoop">
        <DemoBulletList
          items={[
            "Task → Contract deterministik → Preflight",
            "Worker → Checker → koreksi terbatas",
            "Verdict PASS / FAILED / BLOCKED",
            "Tindakan sensitif (commit, push, merge, deploy) menunggu approval manusia",
          ]}
        />
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/app/tasks/new">
              <Plus className="mr-2 size-4" />
              Buat task baru
            </Link>
          </Button>
          {pendingApprovals > 0 ? (
            <Button variant="outline" asChild>
              <Link to="/app/approvals">
                <ShieldCheck className="mr-2 size-4" />
                {pendingApprovals} approval tertunda
              </Link>
            </Button>
          ) : null}
        </div>
        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Sandbox terkontrol — tidak ada tindakan sensitif tanpa contract dan approval eksplisit.
        </p>
      </DemoPanel>

      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/projects">
            <GitBranch className="mr-2 size-4" />
            Lihat project
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/tasks">Semua task</Link>
        </Button>
      </div>
    </div>
  );
}
