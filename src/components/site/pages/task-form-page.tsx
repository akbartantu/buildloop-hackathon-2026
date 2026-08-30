import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { useConnectedRepository } from "@/hooks/use-connected-repository";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { MAX_ATTEMPTS, PROTECTED_PATHS, WORKSPACE_NAME } from "@/lib/task-contract";

export function TaskFormPage({ fromTaskId }: { fromTaskId?: string }) {
  const navigate = useNavigate();
  const { tasks, createMutation } = useWorkspaceTasks();
  const { source } = useConnectedRepository();
  const sourceTask = fromTaskId ? (tasks.find((task) => task.id === fromTaskId) ?? null) : null;
  const [taskGoal, setTaskGoal] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const workspaceLabel = source?.repoName ?? WORKSPACE_NAME;

  useEffect(() => {
    if (sourceTask) {
      setTaskGoal(sourceTask.goal);
    }
  }, [sourceTask]);

  async function handleSubmit() {
    setFormError(null);
    try {
      const task = await createMutation.mutateAsync({
        goal: taskGoal,
        ...(source ? { workspace: source.url } : {}),
      });
      navigate({
        to: "/app/tasks/$taskId",
        params: { taskId: task.id },
        replace: true,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Gagal membuat task");
    }
  }

  return (
    <div className="space-y-6">
      <DemoPageHeader
        title="Definisikan batas task"
        description="Tulis goal yang jelas. BuildLoop akan membuat contract deterministik sebelum orchestrator dijalankan."
      />

      <DemoPanel title="Task baru">
        <div className="space-y-2">
          <Label htmlFor="task-goal">Apa yang perlu dikerjakan?</Label>
          <Textarea
            id="task-goal"
            value={taskGoal}
            onChange={(event) => setTaskGoal(event.target.value)}
            placeholder="Contoh: Add a small deterministic health endpoint and update its focused test without changing protected files."
            rows={4}
          />
          {formError ? <p className="text-sm text-status-blocked">{formError}</p> : null}
        </div>

        <dl className="mt-6 grid gap-x-8 gap-y-4 border-t border-border pt-5 sm:grid-cols-3">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Workspace
            </dt>
            <dd className="mt-1 font-mono text-sm text-foreground">{workspaceLabel}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Maks. percobaan koreksi
            </dt>
            <dd className="mt-1 text-sm text-foreground">{MAX_ATTEMPTS}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Protected paths
            </dt>
            <dd className="mt-1">
              <ul className="space-y-1">
                {PROTECTED_PATHS.map((path) => (
                  <li key={path} className="break-all font-mono text-xs text-foreground">
                    {path}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Menyimpan…" : "Buat task"}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/app/tasks">Batal</Link>
          </Button>
        </div>
      </DemoPanel>
    </div>
  );
}
