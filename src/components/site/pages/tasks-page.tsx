import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { formatTaskRef, nextActionLabel } from "@/lib/task-display";
import { WORKSPACE_NAME } from "@/lib/task-contract";

export function TasksPage() {
  const { tasks, isLoading } = useWorkspaceTasks();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <DemoPageHeader
          title="Tasks"
          description={`Bounded work di workspace ${WORKSPACE_NAME}. Setiap task menghasilkan contract deterministik sebelum orchestrator dijalankan.`}
        />
        <Button asChild className="shrink-0">
          <Link to="/app/tasks/new">
            <Plus className="mr-2 size-4" />
            Buat task baru
          </Link>
        </Button>
      </div>

      <DemoPanel title="Semua task">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : tasks.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Belum ada task. Buat task pertama untuk melihat contract, orchestration, evidence, dan approval.
            </p>
            <Button asChild>
              <Link to="/app/tasks/new">Buat task baru</Link>
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
                    <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-foreground">
                      {task.status}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatTaskRef(task.id)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">{task.goal}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{nextActionLabel(task.status)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DemoPanel>
    </div>
  );
}
