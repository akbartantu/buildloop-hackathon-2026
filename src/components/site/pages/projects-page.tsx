import { Link } from "@tanstack/react-router";
import { ArrowRight, Lock, Shield } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DemoBulletList,
  DemoMetricCard,
  DemoPageHeader,
  DemoPanel,
} from "@/components/site/demo-ui";
import { useConnectedRepository } from "@/hooks/use-connected-repository";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { formatTaskRef } from "@/lib/task-display";
import { PROTECTED_PATHS, WORKSPACE_NAME } from "@/lib/task-contract";

export function ProjectsPage() {
  const { tasks, isLoading } = useWorkspaceTasks();
  const { source, connect, isHydrated } = useConnectedRepository();
  const [repoUrl, setRepoUrl] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const latestRun = tasks.find((task) => task.runnerState?.runnerInvoked) ?? null;
  const activeSource = source;
  const repositoryLabel = activeSource?.repoName ?? WORKSPACE_NAME;

  async function handleConnect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (connecting) {
      return;
    }

    setConnectError(null);
    setConnecting(true);

    try {
      const result = await connect(repoUrl);
      if (result.status === "invalid" || result.status === "error") {
        setConnectError(result.message);
        return;
      }

      setRepoUrl("");
    } catch {
      setConnectError("Repository could not be connected.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <DemoPageHeader
        title="Projects"
        description="Connect a public GitHub repository for hosted demo execution, or continue with the controlled local workspace."
      />

      <DemoPanel title="Connect public repository">
        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <Label htmlFor="repository-url">Repository URL</Label>
            <Input
              id="repository-url"
              name="repositoryUrl"
              placeholder="https://github.com/example/example-repo"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              className="mt-2"
            />
          </div>
          {connectError ? <p className="text-sm text-destructive">{connectError}</p> : null}
          <Button type="submit" disabled={connecting || !isHydrated}>
            {connecting ? "Connecting…" : "Connect repository"}
          </Button>
        </form>
      </DemoPanel>

      <DemoPanel
        title={repositoryLabel}
        badge={
          <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {activeSource ? "Public GitHub repository" : "Controlled sandbox"}
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DemoMetricCard label="Repository" value={repositoryLabel} />
          <DemoMetricCard label="Branch" value={activeSource?.branch ?? "main"} />
          <DemoMetricCard label="Safety" value="Protected" tone="pass" />
          <DemoMetricCard label="Tasks" value={isLoading ? "…" : String(tasks.length)} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Source
            </p>
            <p className="mt-2 text-sm text-foreground">
              {activeSource
                ? `Public GitHub repository · ${activeSource.url}`
                : "Workspace lokal terkontrol — bukan koneksi GitHub langsung."}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Commit SHA
            </p>
            <p className="mt-2 break-all font-mono text-sm text-foreground">
              {activeSource?.commitSha ?? "—"}
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
            <Link to="/app/tasks/new">
              Create task
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
          Public repository ingestion is read-only. Commit, push, merge, and deploy remain human-gated.
        </p>
      </DemoPanel>
    </div>
  );
}
