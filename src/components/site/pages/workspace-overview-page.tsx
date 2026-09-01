import { useQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, FolderKanban, GitBranch, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DemoKeyValueTable,
  DemoPageHeader,
  DemoPanel,
  DemoSectionLabel,
} from "@/components/site/demo-ui";
import { TaskStatusLabel } from "@/components/site/task-status-label";
import { useProjects } from "@/hooks/use-projects";
import { useI18n } from "@/i18n/context";
import {
  isProjectRepositoryConnected,
  projectDisplayName,
  projectRepositoryStatus,
  type ProjectRecord,
} from "@/lib/projects/project-record";
import { listTasks } from "@/lib/tasks.functions";
import type { TaskRecord } from "@/lib/tasks-schema";
import {
  buildWorkspaceUsageRows,
  formatRelativeTime,
  formatTaskCountLabel,
  formatWorkspaceCountSummary,
  resolveWorkspaceOverviewStats,
  workspaceOverviewLayoutClassName,
} from "@/lib/workspace/workspace-overview";

function repositoryStatusLabel(
  project: ProjectRecord,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (projectRepositoryStatus(project)) {
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

function WorkspaceOverviewCard({
  project,
  tasks,
  onOpen,
}: {
  project: ProjectRecord;
  tasks: TaskRecord[];
  onOpen: (projectId: string) => void;
}) {
  const { t, locale } = useI18n();
  const stats = resolveWorkspaceOverviewStats(tasks, project);
  const connected = isProjectRepositoryConnected(project);

  return (
    <div
      className="flex h-full flex-col rounded-lg border border-border bg-card"
      data-testid={`workspace-card-${project.id}`}
    >
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {connected ? projectDisplayName(project) : project.name}
            </p>
            <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
              {project.repositoryUrl.replace(/^https:\/\//, "")}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 font-normal">
            {repositoryStatusLabel(project, t)}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("projects.source")}</dt>
            <dd className="font-medium text-foreground">{t("projects.publicGithub")}</dd>
          </div>
          {project.defaultBranch ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t("projects.branch")}</dt>
              <dd className="font-mono text-xs text-foreground">{project.defaultBranch}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("projects.tasks")}</dt>
            <dd className="font-medium text-foreground">
              {formatTaskCountLabel(stats.taskCount, t, { capped: stats.taskCountCapped })}
            </dd>
          </div>
          {stats.latestTaskStatus ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t("workspaceOverview.latestActivity")}</dt>
              <dd>
                <TaskStatusLabel
                  status={stats.latestTaskStatus}
                  className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-foreground"
                />
              </dd>
            </div>
          ) : null}
        </dl>

        {stats.lastActivityAt ? (
          <p className="text-xs text-muted-foreground">
            {t("workspaceOverview.lastUpdated", {
              relative: formatRelativeTime(stats.lastActivityAt, locale),
            })}
          </p>
        ) : null}

        <Button
          className="mt-auto w-full sm:w-auto"
          size="sm"
          onClick={() => onOpen(project.id)}
          data-testid={`workspace-open-${project.id}`}
        >
          {t("workspaceOverview.openWorkspace")}
          <ArrowRight className="ml-2 size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function CreateWorkspaceCard() {
  const { t } = useI18n();

  return (
    <Link
      to="/app/projects"
      search={{ create: "1" }}
      className="group flex h-full min-h-[220px] flex-col rounded-lg border border-dashed border-border bg-card transition-colors hover:border-foreground/20 hover:bg-muted/20"
      data-testid="workspace-create-card"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-5 text-center sm:p-6">
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <Plus className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{t("workspaceOverview.createCardTitle")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("workspaceOverview.createCardDescription")}
          </p>
        </div>
      </div>
    </Link>
  );
}

function WorkspaceUsagePanel({ workspaceCount }: { workspaceCount: number }) {
  const { t } = useI18n();
  const rows = buildWorkspaceUsageRows(workspaceCount);

  return (
    <DemoPanel title={t("workspaceOverview.usageTitle")} className="h-fit">
      {rows.length > 0 ? (
        <DemoKeyValueTable
          rows={rows.map((row) => ({
            label: t(row.labelKey),
            value: row.value,
          }))}
        />
      ) : null}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {t("workspaceOverview.noPlanData")}
      </p>
    </DemoPanel>
  );
}

function WorkspaceOverviewEmptyState() {
  const { t } = useI18n();

  return (
    <DemoPanel>
      <div className="flex flex-col items-start gap-4 py-2">
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <FolderKanban className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t("workspaceOverview.emptyTitle")}
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {t("workspaceOverview.emptyDescription")}
          </p>
        </div>
        <Button asChild>
          <Link to="/app/projects" search={{ create: "1" }}>
            <GitBranch className="mr-2 size-4" />
            {t("workspaceOverview.createWorkspace")}
          </Link>
        </Button>
      </div>
    </DemoPanel>
  );
}

export function WorkspaceOverviewPage() {
  const { projects, isLoading, setSelectedProjectId } = useProjects();
  const { t } = useI18n();
  const navigate = useNavigate();
  const fetchTasks = useServerFn(listTasks);

  const taskQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ["tasks", project.id, "overview"],
      queryFn: () => fetchTasks({ data: { projectId: project.id } }),
      enabled: projects.length > 0,
    })),
  });

  const tasksByProjectId = new Map<string, TaskRecord[]>(
    projects.map((project, index) => [project.id, taskQueries[index]?.data ?? []]),
  );
  const countSummary = formatWorkspaceCountSummary(projects.length, t);

  function openWorkspace(projectId: string) {
    setSelectedProjectId(projectId);
    navigate({ to: "/app/dashboard" });
  }

  return (
    <div className={workspaceOverviewLayoutClassName()} data-testid="workspace-overview-page">
      <DemoPageHeader
        title={t("workspaceOverview.title")}
        description={t("workspaceOverview.description")}
      />

      <DemoSectionLabel>{countSummary}</DemoSectionLabel>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : projects.length === 0 ? (
            <WorkspaceOverviewEmptyState />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((project) => (
                <WorkspaceOverviewCard
                  key={project.id}
                  project={project}
                  tasks={tasksByProjectId.get(project.id) ?? []}
                  onOpen={openWorkspace}
                />
              ))}
              <CreateWorkspaceCard />
            </div>
          )}
        </div>

        <WorkspaceUsagePanel workspaceCount={projects.length} />
      </div>

      {projects.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/app/projects" search={{ create: "1" }}>
              <Plus className="mr-2 size-4" />
              {t("workspaceOverview.createWorkspace")}
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
