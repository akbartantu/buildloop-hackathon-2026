import { Link, getRouteApi } from "@tanstack/react-router";
import { ArrowRight, ExternalLink, Lock, RefreshCw, Settings, Shield } from "lucide-react";
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
import type { TranslationKey } from "@/i18n/en";
import { abbreviateCommitSha } from "@/lib/repository/task-source-display";
import { projectDisplayName } from "@/lib/projects/project-record";
import { formatTaskRef } from "@/lib/task-display";
import { PROTECTED_PATHS, WORKSPACE_NAME } from "@/lib/task-contract";
import type { ConnectIntent } from "@/hooks/use-projects";
import { WorkspaceSpecificationsPanel } from "@/components/site/workspace-specifications-panel";

const projectsRoute = getRouteApi("/_authenticated/app/_workspace/projects/");

type RepositoryConnectFormProps = {
  title: string;
  description?: string;
  initialUrl?: string;
  submitLabel: string;
  intent: ConnectIntent;
  projectId?: string;
  onSuccess?: () => void;
};

function RepositoryConnectForm({
  title,
  description,
  initialUrl = "",
  submitLabel,
  intent,
  projectId,
  onSuccess,
}: RepositoryConnectFormProps) {
  const { connect, isHydrated } = useProjects();
  const { t } = useI18n();
  const [repoUrl, setRepoUrl] = useState(initialUrl);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  async function handleConnect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (connecting) {
      return;
    }

    setConnectError(null);
    setConnecting(true);

    try {
      const result = await connect(repoUrl, {
        intent,
        ...(projectId ? { projectId } : {}),
      });
      if (result.status === "invalid" || result.status === "error") {
        setConnectError(result.message);
        return;
      }

      setRepoUrl("");
      onSuccess?.();
    } catch {
      setConnectError(t("projects.connectError"));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <DemoPanel title={title} tourTarget="projects-repository">
      {description ? <p className="mb-4 text-sm text-muted-foreground">{description}</p> : null}
      <form onSubmit={handleConnect} className="space-y-4">
        <div>
          <Label htmlFor={`repository-url-${intent}`}>{t("projects.connectLabel")}</Label>
          <Input
            id={`repository-url-${intent}`}
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
          {connecting ? t("common.connecting") : submitLabel}
        </Button>
      </form>
    </DemoPanel>
  );
}

function repositoryStatusLabel(t: (key: TranslationKey) => string, status: string): string {
  switch (status) {
    case "connected":
      return t("projects.statusConnected");
    case "refreshing":
      return t("projects.statusRefreshing");
    case "connection_failed":
      return t("projects.statusConnectionFailed");
    default:
      return t("projects.statusNotConnected");
  }
}

export function ProjectsPage() {
  const { tasks, isLoading } = useWorkspaceTasks();
  const {
    source,
    activeProject,
    isRepositoryConnected,
    refresh,
    isHydrated,
  } = useProjects();
  const { t, taskStatusLabel } = useI18n();
  const { create } = projectsRoute.useSearch();
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(create === "1");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const projectTasks = tasks;
  const latestRun =
    projectTasks.find((task) => task.runnerState?.runnerInvoked) ?? null;
  const repositoryLabel = source?.repoName ?? (activeProject ? projectDisplayName(activeProject) : WORKSPACE_NAME);

  const pageDescription = isRepositoryConnected
    ? t("projects.descriptionConnected")
    : activeProject
      ? t("projects.descriptionDisconnected")
      : t("projects.descriptionDemo");

  async function handleRefresh() {
    if (!activeProject || refreshing) {
      return;
    }

    setRefreshError(null);
    setRefreshing(true);
    try {
      const result = await refresh(activeProject.id);
      if (result.status === "error") {
        setRefreshError(result.message);
      }
    } catch {
      setRefreshError(t("projects.refreshError"));
    } finally {
      setRefreshing(false);
    }
  }

  const statusKey = refreshing
    ? "refreshing"
    : refreshError
      ? "connection_failed"
      : isRepositoryConnected
        ? "connected"
        : "not_connected";

  return (
    <div className="space-y-6">
      <DemoPageHeader title={t("projects.title")} description={pageDescription} />

      {showCreateWorkspace ? (
        <RepositoryConnectForm
          title={t("projects.createWorkspaceTitle")}
          description={t("projects.createWorkspaceDescription")}
          submitLabel={t("projects.createWorkspace")}
          intent="create_workspace"
          onSuccess={() => setShowCreateWorkspace(false)}
        />
      ) : null}

      {!isRepositoryConnected && !showCreateWorkspace ? (
        activeProject ? (
          <RepositoryConnectForm
            title={t("projects.reconnectTitle")}
            description={t("projects.reconnectDescription")}
            initialUrl={activeProject.repositoryUrl}
            submitLabel={t("projects.connectButton")}
            intent="reconnect"
            projectId={activeProject.id}
          />
        ) : (
          <RepositoryConnectForm
            title={t("projects.connectTitle")}
            description={t("projects.descriptionDisconnected")}
            submitLabel={t("projects.connectButton")}
            intent="connect"
          />
        )
      ) : null}

      {(isRepositoryConnected || activeProject) && !showCreateWorkspace ? (
        <DemoPanel
          title={t("projects.repositorySection")}
          tourTarget="projects-repository"
          badge={
            <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {isRepositoryConnected ? t("projects.publicGithub") : t("projects.controlledSandbox")}
            </span>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DemoMetricCard
              label={t("projects.status")}
              value={repositoryStatusLabel(t, statusKey)}
              {...(isRepositoryConnected ? { tone: "pass" as const } : {})}
            />
            <DemoMetricCard label={t("projects.repository")} value={repositoryLabel} />
            <DemoMetricCard label={t("projects.branch")} value={source?.branch ?? activeProject?.defaultBranch ?? "main"} />
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
                {isRepositoryConnected && source
                  ? t("projects.sourcePublic", { url: source.url })
                  : activeProject
                    ? t("projects.sourcePublic", { url: activeProject.repositoryUrl })
                    : t("projects.sourceLocal")}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {t("projects.connectedSourceCommit")}
              </p>
              <p className="mt-2 break-all font-mono text-sm text-foreground">
                {source?.commitSha || activeProject?.connectedCommitSha
                  ? abbreviateCommitSha(source?.commitSha ?? activeProject?.connectedCommitSha ?? "")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {t("projects.latestRun")}
              </p>
              <p className="mt-2 text-sm text-foreground">
                {latestRun
                  ? `${formatTaskRef(latestRun.id)} · ${taskStatusLabel(latestRun.status)}`
                  : t("runs.empty")}
              </p>
            </div>
          </div>

          {refreshError ? <p className="mt-4 text-sm text-destructive">{refreshError}</p> : null}

          <div className="mt-6 border-t border-border pt-5">
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <Shield className="size-3.5" />
              {t("projects.protectedScope")}
            </p>
            <DemoBulletList
              items={PROTECTED_PATHS.map((path) =>
                t("projects.protectedScopeItem", { path }),
              )}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
            {isRepositoryConnected ? (
              <>
                <Button variant="outline" onClick={handleRefresh} disabled={refreshing || !isHydrated}>
                  <RefreshCw className={`mr-2 size-4 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? t("projects.statusRefreshing") : t("projects.refreshRepository")}
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/app/settings" search={{ tab: "workspace" }}>
                    <Settings className="mr-2 size-4" />
                    {t("projects.workspaceSettings")}
                  </Link>
                </Button>
                {source?.url ? (
                  <Button variant="outline" asChild>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 size-4" />
                      {t("projects.openRepository")}
                    </a>
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => setShowCreateWorkspace(true)}>
                  {t("projects.connectAnotherRepository")}
                </Button>
              </>
            ) : null}
            {isRepositoryConnected ? (
              <Button asChild>
                <Link to="/app/tasks/new">
                  {t("tasks.createNew")}
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            ) : null}
            {latestRun ? (
              <Button variant="outline" asChild>
                <Link to="/app/tasks/$taskId" params={{ taskId: latestRun.id }}>
                  {t("projects.viewLatestRun")}
                </Link>
              </Button>
            ) : null}
          </div>

          {isRepositoryConnected ? (
            <p className="mt-4 text-xs text-muted-foreground">{t("projects.differentRepositoryHint")}</p>
          ) : null}

          <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t("projects.readOnlyNotice")}
          </p>
        </DemoPanel>
      ) : null}

      {activeProject && isRepositoryConnected && !showCreateWorkspace ? (
        <WorkspaceSpecificationsPanel projectId={activeProject.id} />
      ) : null}

      {!activeProject && !showCreateWorkspace ? (
        <DemoPanel title={WORKSPACE_NAME} badge={t("projects.controlledSandbox")}>
          <p className="text-sm text-muted-foreground">{t("projects.sourceLocal")}</p>
        </DemoPanel>
      ) : null}
    </div>
  );
}
