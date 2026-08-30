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
import { useProjects } from "@/hooks/use-projects";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { abbreviateCommitSha } from "@/lib/repository/task-source-display";
import { formatTaskRef } from "@/lib/task-display";
import { PROTECTED_PATHS, WORKSPACE_NAME } from "@/lib/task-contract";

export function ProjectsPage() {
  const { tasks, isLoading } = useWorkspaceTasks();
  const { source, activeProject, connect, isHydrated } = useProjects();
  const [repoUrl, setRepoUrl] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const projectTasks = activeProject
    ? tasks.filter((task) => task.projectId === activeProject.id)
    : tasks.filter((task) => !task.projectId);
  const latestRun =
    projectTasks.find((task) => task.runnerState?.runnerInvoked) ?? null;
  const repositoryLabel = source?.repoName ?? WORKSPACE_NAME;

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
        description="Connect a public GitHub repository for hosted execution, or continue with the controlled local demo workspace."
      />

      <DemoPanel title="Connect repository">
        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <Label htmlFor="repository-url">Public GitHub repository URL</Label>
            <Input
              id="repository-url"
              name="repositoryUrl"
              placeholder="https://github.com/owner/repository"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              className="mt-2"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Example: https://github.com/owner/repository
            </p>
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
            {source ? "Public GitHub" : "Controlled sandbox"}
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DemoMetricCard label="Repository" value={repositoryLabel} />
          <DemoMetricCard label="Branch" value={source?.branch ?? "main"} />
          <DemoMetricCard label="Safety" value="Protected" tone="pass" />
          <DemoMetricCard
            label="Tasks"
            value={isLoading ? "…" : String(projectTasks.length)}
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Source
            </p>
            <p className="mt-2 text-sm text-foreground">
              {source
                ? `Public GitHub · ${source.url}`
                : "Controlled local workspace — not a direct GitHub connection."}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Commit SHA
            </p>
            <p className="mt-2 break-all font-mono text-sm text-foreground">
              {source?.commitSha ? abbreviateCommitSha(source.commitSha) : "—"}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Latest run
            </p>
            <p className="mt-2 text-sm text-foreground">
              {latestRun
                ? `${formatTaskRef(latestRun.id)} · ${latestRun.status}`
                : "No orchestrator run yet"}
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Shield className="size-3.5" />
            Protected scope
          </p>
          <DemoBulletList
            items={[...PROTECTED_PATHS.map((path) => `${path} — cannot be changed automatically`)]}
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
                View latest run
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
