import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { useProjects } from "@/hooks/use-projects";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { useI18n } from "@/i18n/context";
import { abbreviateCommitSha } from "@/lib/repository/task-source-display";
import { MAX_ATTEMPTS, PROTECTED_PATHS, WORKSPACE_NAME } from "@/lib/task-contract";

function parseAcceptanceCriteria(raw: string): string[] | undefined {
  const criteria = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 3);

  return criteria.length > 0 ? criteria : undefined;
}

export function TaskFormPage({ fromTaskId }: { fromTaskId?: string }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { tasks, createMutation } = useWorkspaceTasks();
  const { source, activeProject } = useProjects();
  const sourceTask = fromTaskId ? (tasks.find((task) => task.id === fromTaskId) ?? null) : null;
  const [taskGoal, setTaskGoal] = useState("");
  const [acceptanceCriteriaText, setAcceptanceCriteriaText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const workspaceLabel = source?.repoName ?? WORKSPACE_NAME;

  useEffect(() => {
    if (sourceTask) {
      setTaskGoal(sourceTask.goal);
      setAcceptanceCriteriaText(sourceTask.contract.acceptanceCriteria.join("\n"));
    }
  }, [sourceTask]);

  async function handleSubmit() {
    setFormError(null);
    try {
      const acceptanceCriteria = parseAcceptanceCriteria(acceptanceCriteriaText);
      const task = await createMutation.mutateAsync({
        goal: taskGoal,
        ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
        ...(activeProject?.id
          ? { projectId: activeProject.id }
          : source
            ? { workspace: source.url }
            : {}),
      });
      navigate({
        to: "/app/tasks/$taskId",
        params: { taskId: task.id },
        replace: true,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("tasks.createError"));
    }
  }

  return (
    <div className="space-y-6">
      <DemoPageHeader title={t("tasks.formTitle")} description={t("tasks.formDescription")} />

      <DemoPanel title={t("tasks.formPanelTitle")}>
        <div className="space-y-2">
          <Label htmlFor="task-goal">{t("tasks.goalLabel")}</Label>
          <Textarea
            id="task-goal"
            value={taskGoal}
            onChange={(event) => setTaskGoal(event.target.value)}
            placeholder={t("tasks.goalPlaceholder")}
            rows={4}
          />
        </div>

        <div className="mt-6 space-y-2">
          <Label htmlFor="task-criteria">{t("tasks.criteriaLabel")}</Label>
          <Textarea
            id="task-criteria"
            value={acceptanceCriteriaText}
            onChange={(event) => setAcceptanceCriteriaText(event.target.value)}
            placeholder={t("tasks.criteriaPlaceholder")}
            rows={6}
          />
          <p className="text-xs text-muted-foreground">{t("tasks.criteriaHelp")}</p>
          {formError ? <p className="text-sm text-status-blocked">{formError}</p> : null}
        </div>

        <dl className="mt-6 grid gap-x-8 gap-y-4 border-t border-border pt-5 sm:grid-cols-3">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {t("tasks.workspace")}
            </dt>
            <dd className="mt-1 font-mono text-sm text-foreground">{workspaceLabel}</dd>
          </div>
          {source ? (
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {t("tasks.sourceCommit")}
              </dt>
              <dd className="mt-1 font-mono text-sm text-foreground">
                {abbreviateCommitSha(source.commitSha)}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {t("tasks.maxCorrections")}
            </dt>
            <dd className="mt-1 text-sm text-foreground">{MAX_ATTEMPTS}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {t("tasks.protectedPaths")}
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
            {createMutation.isPending ? t("common.saving") : t("tasks.createTask")}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/app/tasks">{t("common.cancel")}</Link>
          </Button>
        </div>
      </DemoPanel>
    </div>
  );
}
