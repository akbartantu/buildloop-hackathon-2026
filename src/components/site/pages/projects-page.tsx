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
import { useI18n } from "@/i18n/context";
import { abbreviateCommitSha } from "@/lib/repository/task-source-display";
import { formatTaskRef } from "@/lib/task-display";
import { PROTECTED_PATHS, WORKSPACE_NAME } from "@/lib/task-contract";

export function ProjectsPage() {
  const { tasks, isLoading } = useWorkspaceTasks();
  const { source, activeProject, connect, isHydrated } = useProjects();
  const { t } = useI18n();
  const [repoUrl, setRepoUrl] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const projectTasks = tasks;
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
      setConnectError(t("projects.connectError"));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <DemoPageHeader title={t("projects.title")} description={t("projects.description")} />

      <DemoPanel title={t("projects.connectTitle")}>
        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <Label htmlFor="repository-url">{t("projects.connectLabel")}</Label>
            <Input
              id="repository-url"
              name="repositoryUrl"
              placeholder={t("projects.connectPlaceholder")}
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              className="mt-2"
            />
            <p className="mt-2 text-xs text-muted-foreground">{t("projects.connectExample")}</p>
          </div>
          {connectError ? <p className="text-sm text-destructive">{connectError}</p> : null}
          <Button type="submit" disabled={connecting || !isHydrated}>
            {connecting ? t("common.connecting") : t("projects.connectButton")}
          </Button>
        </form>
      </DemoPanel>

      <DemoPanel
        title={repositoryLabel}
        badge={
          <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {source ? t("projects.publicGithub") : t("projects.controlledSandbox")}
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DemoMetricCard label={t("projects.repository")} value={repositoryLabel} />
          <DemoMetricCard label={t("projects.branch")} value={source?.branch ?? "main"} />
          <DemoMetricCard label={t("projects.safety")} value={t("projects.protected")} tone="pass" />
          <DemoMetricCard
            label={t("projects.tasks")}
            value={isLoading ? "…" : String(projectTasks.length)}
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {t("projects.source")}
            </p>
            <p className="mt-2 text-sm text-foreground">
              {source
                ? t("projects.sourcePublic", { url: source.url })
                : t("projects.sourceLocal")}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {t("projects.commitSha")}
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
              {t("tasks.createNew")}
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
