import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { TaskDetailTabs } from "@/components/site/task-detail-tabs";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import type { DemoTab } from "@/lib/task-display";

type TaskDetailPageProps = {
  taskId: string;
  initialTab?: DemoTab;
};

export function TaskDetailPage({ taskId, initialTab }: TaskDetailPageProps) {
  const navigate = useNavigate();
  const { tasks, isLoading, lockMutation, runMutation, humanApprovalMutation } = useWorkspaceTasks();
  const task = tasks.find((entry) => entry.id === taskId) ?? null;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Memuat task…</p>;
  }

  if (!task) {
    return (
      <div className="space-y-6">
        <DemoPageHeader
          title="Task tidak ditemukan"
          description="Task mungkin dihapus atau ID tidak valid."
        />
        <DemoPanel>
          <Button asChild>
            <Link to="/app/tasks">Kembali ke tasks</Link>
          </Button>
        </DemoPanel>
      </div>
    );
  }

  const mutationError =
    (lockMutation.error ?? runMutation.error ?? humanApprovalMutation.error) instanceof Error
      ? (lockMutation.error ?? runMutation.error ?? humanApprovalMutation.error)?.message ?? null
      : null;

  return (
    <TaskDetailTabs
      task={task}
      {...(initialTab !== undefined ? { initialTab } : {})}
      approving={lockMutation.isPending}
      running={runMutation.isPending}
      submittingHumanApproval={humanApprovalMutation.isPending}
      error={mutationError}
      onApprove={() => lockMutation.mutate(task.id)}
      onRun={() => runMutation.mutate(task.id)}
      onSubmitHumanApproval={(input) => humanApprovalMutation.mutate({ id: task.id, ...input })}
      onEdit={() => {
        navigate({
          to: "/app/tasks/new",
          search: { from: task.id },
        });
      }}
      onBack={() => navigate({ to: "/app/tasks" })}
    />
  );
}
