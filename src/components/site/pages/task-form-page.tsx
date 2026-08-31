import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { useProjects } from "@/hooks/use-projects";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { useI18n } from "@/i18n/context";
import {
  countAcceptanceCriteria,
  mergeSuggestedIntoCriteriaText,
  parseAcceptanceCriteria,
  prepareTextareaForNewCriterion,
} from "@/lib/acceptance-criteria-form";
import { analyzeTaskGoalPreview } from "@/lib/tasks.functions";
import { abbreviateCommitSha } from "@/lib/repository/task-source-display";
import { formatPlanningSourceLabel } from "@/lib/planning/planning-source";
import { MAX_ATTEMPTS, PROTECTED_PATHS, WORKSPACE_NAME } from "@/lib/task-contract";
import type { TaskGoalAnalysis } from "@/lib/task-planning";

export function TaskFormPage({ fromTaskId }: { fromTaskId?: string }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { tasks, createMutation } = useWorkspaceTasks();
  const { source, activeProject } = useProjects();
  const analyzeGoal = useServerFn(analyzeTaskGoalPreview);
  const criteriaTextareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestedNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceTask = fromTaskId ? (tasks.find((task) => task.id === fromTaskId) ?? null) : null;
  const [taskGoal, setTaskGoal] = useState("");
  const [acceptanceCriteriaText, setAcceptanceCriteriaText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<TaskGoalAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [userEditedCriteria, setUserEditedCriteria] = useState(false);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [suggestedAddedNotice, setSuggestedAddedNotice] = useState(false);
  const workspaceLabel = source?.repoName ?? WORKSPACE_NAME;
  const criteriaCount = countAcceptanceCriteria(acceptanceCriteriaText);

  useEffect(() => {
    if (sourceTask) {
      setTaskGoal(sourceTask.goal);
      setAcceptanceCriteriaText(sourceTask.contract.acceptanceCriteria.join("\n"));
      setUserEditedCriteria(true);
    }
  }, [sourceTask]);

  useEffect(() => {
    return () => {
      if (suggestedNoticeTimerRef.current) {
        clearTimeout(suggestedNoticeTimerRef.current);
      }
    };
  }, []);

  const focusCriteriaTextareaAtEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const textarea = criteriaTextareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      const caret = textarea.value.length;
      textarea.setSelectionRange(caret, caret);
    });
  }, []);

  async function handleAnalyze() {
    setFormError(null);
    setAnalyzing(true);
    try {
      const userCriteria = parseAcceptanceCriteria(acceptanceCriteriaText);
      const result = await analyzeGoal({
        data: {
          goal: taskGoal,
          ...(activeProject?.id ? { projectId: activeProject.id } : {}),
          ...(userCriteria ? { acceptanceCriteria: userCriteria } : {}),
          ...(clarificationAnswer.trim() ? { clarificationAnswer: clarificationAnswer.trim() } : {}),
        },
      });
      setAnalysis(result);
      if (!userEditedCriteria && result.suggestedFromGoal) {
        setAcceptanceCriteriaText(result.acceptanceCriteria.join("\n"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("tasks.createError"));
    } finally {
      setAnalyzing(false);
    }
  }

  function handleAcceptSuggested() {
    if (!analysis?.acceptanceCriteria.length) {
      return;
    }

    setAcceptanceCriteriaText((current) =>
      mergeSuggestedIntoCriteriaText(current, analysis.acceptanceCriteria),
    );
    setUserEditedCriteria(true);
    setSuggestedAddedNotice(true);
    if (suggestedNoticeTimerRef.current) {
      clearTimeout(suggestedNoticeTimerRef.current);
    }
    suggestedNoticeTimerRef.current = setTimeout(() => {
      setSuggestedAddedNotice(false);
      suggestedNoticeTimerRef.current = null;
    }, 3000);
    focusCriteriaTextareaAtEnd();
  }

  function handleAddCriterion() {
    setAcceptanceCriteriaText((current) => prepareTextareaForNewCriterion(current));
    setUserEditedCriteria(true);
    focusCriteriaTextareaAtEnd();
  }

  async function handleSubmit() {
    setFormError(null);
    if (analysis?.needsClarification && analysis.clarificationQuestion && !clarificationAnswer.trim()) {
      setFormError(t("tasks.clarificationAnswerRequired"));
      return;
    }

    try {
      const acceptanceCriteria = parseAcceptanceCriteria(acceptanceCriteriaText);
      const task = await createMutation.mutateAsync({
        goal: taskGoal,
        ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
        ...(clarificationAnswer.trim() ? { clarificationAnswer: clarificationAnswer.trim() } : {}),
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

  const canAnalyze = taskGoal.trim().length >= 10;

  return (
    <div className="space-y-6">
      <DemoPageHeader title={t("tasks.formTitle")} description={t("tasks.formDescription")} />

      <DemoPanel title={t("tasks.formPanelTitle")} tourTarget="task-goal">
        <div className="space-y-2">
          <Label htmlFor="task-goal">{t("tasks.goalLabel")}</Label>
          <Textarea
            id="task-goal"
            value={taskGoal}
            onChange={(event) => {
              setTaskGoal(event.target.value);
              setAnalysis(null);
            }}
            placeholder={t("tasks.goalPlaceholder")}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">{t("tasks.goalPrivacyHint")}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canAnalyze || analyzing}
              onClick={handleAnalyze}
            >
              {analyzing ? t("tasks.analyzing") : t("tasks.analyzeGoal")}
            </Button>
          </div>
        </div>

        {analysis?.needsClarification ? (
          <div className="mt-4 rounded-md border border-status-review/40 bg-status-review/5 p-4">
            <p className="text-sm font-medium text-foreground">{t("tasks.clarificationPrompt")}</p>
            <p className="mt-2 text-sm text-foreground">
              {analysis.clarificationQuestion ?? analysis.clarificationMessage ?? t("tasks.criteriaOptional")}
            </p>
            {analysis.clarificationOptions?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {analysis.clarificationOptions.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={clarificationAnswer === option ? "default" : "outline"}
                    onClick={() => setClarificationAnswer(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            ) : null}
            <div className="mt-4 space-y-2">
              <Label htmlFor="clarification-answer">{t("tasks.clarificationAnswerLabel")}</Label>
              <Textarea
                id="clarification-answer"
                value={clarificationAnswer}
                onChange={(event) => setClarificationAnswer(event.target.value)}
                rows={2}
              />
            </div>
          </div>
        ) : null}

        {analysis?.sourcesUsed?.length ? (
          <div className="mt-4 rounded-md border border-border bg-muted/20 p-4">
            <p className="text-sm font-medium text-foreground">{t("tasks.sourcesUsed")}</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {analysis.sourcesUsed.map((sourceItem) => (
                <li key={`${sourceItem.sourceType}-${sourceItem.displayName}`}>
                  · {formatPlanningSourceLabel(sourceItem)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {analysis && !analysis.needsClarification && analysis.suggestedFromGoal ? (
          <div className="mt-4 rounded-md border border-border bg-muted/20 p-4">
            <p className="text-sm font-medium text-foreground">{t("tasks.suggestedCriteria")}</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {analysis.acceptanceCriteria.map((criterion) => (
                <li key={criterion}>· {criterion}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleAcceptSuggested}>
                {t("tasks.acceptSuggested")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleAddCriterion}>
                <Plus className="mr-1 size-3.5" />
                {t("tasks.addCriterion")}
              </Button>
              {suggestedAddedNotice ? (
                <span className="text-xs text-status-pass" role="status" aria-live="polite">
                  {t("tasks.suggestedCriteriaAdded")}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-6 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Label htmlFor="task-criteria">{t("tasks.criteriaLabel")}</Label>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {t("tasks.criteriaReadyCount", { count: criteriaCount })}
            </span>
          </div>
          <Textarea
            id="task-criteria"
            ref={criteriaTextareaRef}
            value={acceptanceCriteriaText}
            onChange={(event) => {
              setAcceptanceCriteriaText(event.target.value);
              setUserEditedCriteria(true);
            }}
            placeholder={t("tasks.criteriaPlaceholder")}
            rows={6}
          />
          <p className="text-xs text-muted-foreground">{t("tasks.criteriaEditingHelp")}</p>
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
