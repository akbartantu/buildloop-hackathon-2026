import { Link } from "@tanstack/react-router";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { formatTaskRef } from "@/lib/task-display";
import type { TaskRecord } from "@/lib/tasks-schema";
import type { TaskStatus } from "@/lib/task-contract";

const RUN_STATUS_LABELS = [
  "APPROVED_FOR_EXECUTION (READY)",
  "RUNNING",
  "NEEDS_CORRECTION",
  "PASS",
  "FAILED",
  "BLOCKED",
  "AWAITING_APPROVAL",
] as const;

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

function runDecision(task: TaskRecord): string {
  if (task.status === "PASS" || task.status === "AWAITING_APPROVAL") return "PASS";
  if (task.status === "FAILED") return "FAILED";
  if (task.status === "BLOCKED") return "BLOCKED";
  if (["RUNNING", "CHECKING", "NEEDS_CORRECTION", "INSPECTING"].includes(task.status)) {
    return "IN PROGRESS";
  }
  if (task.status === "APPROVED_FOR_EXECUTION") return "READY";
  return "—";
}

function statusTone(status: TaskStatus): "pass" | "blocked" | "review" | "neutral" {
  if (status === "PASS" || status === "AWAITING_APPROVAL") return "pass";
  if (status === "BLOCKED" || status === "FAILED") return "blocked";
  if (["RUNNING", "CHECKING", "NEEDS_CORRECTION", "INSPECTING"].includes(status)) return "review";
  return "neutral";
}

export function RunsPage() {
  const { tasks, isLoading } = useWorkspaceTasks();
  const runs = tasks.filter(isRunTask);

  return (
    <div className="space-y-6">
      <DemoPageHeader
        title="Runs"
        description="Riwayat dan status eksekusi orchestrator. Setiap run terkait dengan satu task."
      />

      <DemoPanel title="Orchestrator runs">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : runs.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Belum ada run. Setujui contract pada task lalu jalankan orchestrator untuk melihat run di sini.
            </p>
            <Link
              to="/app/tasks"
              className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              Buka tasks
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Task</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Koreksi</th>
                  <th className="pb-3 pr-4 font-medium">Decision</th>
                  <th className="pb-3 pr-4 font-medium">Diperbarui</th>
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
                      <span
                        className={`font-mono text-[11px] uppercase tracking-[0.1em] ${
                          statusTone(task.status) === "pass"
                            ? "text-status-pass"
                            : statusTone(task.status) === "blocked"
                              ? "text-status-blocked"
                              : statusTone(task.status) === "review"
                                ? "text-status-review"
                                : "text-foreground"
                        }`}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-foreground">
                      {task.runnerState?.correctionCount ?? 0} / {task.contract.maxAttempts}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-foreground">
                      {runDecision(task)}
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
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DemoPanel>

      <p className="text-xs text-muted-foreground">
        Status canonical: {RUN_STATUS_LABELS.join(", ")}. Detail lengkap tersedia di tab Orchestration dan Evidence pada task detail.
      </p>
    </div>
  );
}
