import { Link } from "@tanstack/react-router";
import { ArrowRight, Lock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DemoBulletList,
  DemoMetricCard,
  DemoPageHeader,
  DemoPanel,
} from "@/components/site/demo-ui";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { formatTaskRef } from "@/lib/task-display";
import { PROTECTED_PATHS, WORKSPACE_NAME } from "@/lib/task-contract";

export function ProjectsPage() {
  const { tasks, isLoading } = useWorkspaceTasks();
  const latestRun = tasks.find((task) => task.runnerState?.runnerInvoked) ?? null;

  return (
    <div className="space-y-6">
      <DemoPageHeader
        title="Projects"
        description="Safe Personal Mode: workspace terkontrol dengan Git baseline, worktree isolation, dan guardrail bawaan. Set workspace ke path absolut repository lokal Anda saat onboarding."
      />

      <DemoPanel
        title={WORKSPACE_NAME}
        badge={
          <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Controlled sandbox
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DemoMetricCard label="Repository" value={WORKSPACE_NAME} />
          <DemoMetricCard label="Branch" value="main" />
          <DemoMetricCard label="Safety" value="Protected" tone="pass" />
          <DemoMetricCard
            label="Tasks"
            value={isLoading ? "…" : String(tasks.length)}
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Sumber
            </p>
            <p className="mt-2 text-sm text-foreground">
              Workspace lokal terkontrol — bukan koneksi GitHub langsung.
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Run terakhir
            </p>
            <p className="mt-2 text-sm text-foreground">
              {latestRun
                ? `${formatTaskRef(latestRun.id)} · ${latestRun.status}`
                : "Belum ada run orchestrator"}
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Shield className="size-3.5" />
            Protected scope
          </p>
          <DemoBulletList
            items={[...PROTECTED_PATHS.map((path) => `${path} — tidak dapat diubah otomatis`)]}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
          <Button asChild>
            <Link to="/app/tasks">
              Buka tasks
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          {latestRun ? (
            <Button variant="outline" asChild>
              <Link to="/app/tasks/$taskId" params={{ taskId: latestRun.id }}>
                Lihat run terakhir
              </Link>
            </Button>
          ) : null}
        </div>

        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Multi-project management di luar scope hackathon. Workspace ini sudah dikonfigurasi untuk demo vertikal slice.
        </p>
      </DemoPanel>
    </div>
  );
}
