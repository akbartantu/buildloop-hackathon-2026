import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { formatTaskRef, nextActionLabel } from "@/lib/task-display";
import { isPendingHumanApproval } from "@/lib/human-approval";
import type { TaskRecord } from "@/lib/tasks-schema";

function isAwaitingApproval(task: TaskRecord): boolean {
  return isPendingHumanApproval(task);
}

const SENSITIVE_ACTIONS = ["Commit", "Push", "Merge", "Deploy"];

export function ApprovalsPage() {
  const { tasks, isLoading } = useWorkspaceTasks();
  const pending = tasks.filter(isAwaitingApproval);

  return (
    <div className="space-y-6">
      <DemoPageHeader
        title="Approvals"
        description="Tindakan sensitif menunggu kontrol manusia. BuildLoop menyelesaikan pekerjaan otonom terlebih dahulu — commit, push, merge, dan deploy membutuhkan approval terpisah."
      />

      <DemoPanel title="Menunggu approval">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : pending.length === 0 ? (
          <div className="space-y-4 py-4 text-center">
            <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">Tidak ada approval tertunda</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Approval gate aktif setelah orchestrator menghasilkan PASS. Pekerjaan otonom yang sudah selesai
                akan muncul di sini jika membutuhkan tindakan sensitif.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/app/tasks">Lihat tasks</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((task) => (
              <li key={task.id} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-status-review">
                        AWAITING_APPROVAL
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatTaskRef(task.id)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">{task.goal}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {nextActionLabel(task.status)}
                    </p>
                    <div className="mt-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Tindakan sensitif
                      </p>
                      <p className="mt-1 text-xs text-foreground">
                        {SENSITIVE_ACTIONS.join(" · ")} — membutuhkan approval manusia
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Verdict orchestrator: PASS · pekerjaan otonom selesai, delivery menunggu approval.
                    </p>
                  </div>
                  <Button asChild className="shrink-0">
                    <Link to="/app/tasks/$taskId" params={{ taskId: task.id }} search={{ tab: "approval" }}>
                      Review approval
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
