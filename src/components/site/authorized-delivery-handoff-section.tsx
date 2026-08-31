import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { DeliveryHandoffPanel } from "@/components/site/delivery-handoff-panel";
import type { DeliveryHandoff } from "@/lib/delivery-artifact";
import {
  buildDeliveryHandoffViewModel,
  canShowDeliveryHandoff,
} from "@/lib/delivery-handoff-presentation";
import { taskSourceBranch, taskSourceCommitSha } from "@/lib/repository/task-source-display";
import { getAuthorizedDeliveryHandoff } from "@/lib/tasks.functions";
import type { TaskRecord } from "@/lib/tasks-schema";
import type { Locale } from "@/i18n";
import { translate, type TranslationKey } from "@/i18n";
import type { ProjectRecord } from "@/lib/projects/project-record";

type AuthorizedDeliveryHandoffSectionProps = {
  task: TaskRecord;
  locale: Locale;
  activeProject: ProjectRecord | null;
  sourceCommitDrift: boolean;
};

export function AuthorizedDeliveryHandoffSection({
  task,
  locale,
  activeProject,
  sourceCommitDrift,
}: AuthorizedDeliveryHandoffSectionProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  const runner = task.runnerState;
  const redactedHandoff = runner?.deliveryHandoff;
  const enabled = Boolean(
    runner &&
      redactedHandoff &&
      canShowDeliveryHandoff({
        runnerState: runner,
      }),
  );
  const fetchAuthorizedDelivery = useServerFn(getAuthorizedDeliveryHandoff);
  const authorizedQuery = useQuery({
    queryKey: ["authorized-delivery", task.id, runner?.runId ?? null],
    enabled,
    queryFn: () => fetchAuthorizedDelivery({ data: { id: task.id } }),
    staleTime: 30_000,
  });

  if (!enabled || !redactedHandoff) {
    return null;
  }

  if (authorizedQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("delivery.handoff.loading")}</p>;
  }

  const loadError =
    authorizedQuery.isError || !authorizedQuery.data ? t("delivery.handoff.loadError") : null;

  const authorizedHandoff: DeliveryHandoff = authorizedQuery.data
    ? {
        ...redactedHandoff,
        patch: authorizedQuery.data.patch,
        patchSha256: authorizedQuery.data.patchSha256,
        suggestedCommitMessage: authorizedQuery.data.suggestedCommitMessage,
        suggestedCommitDescription: authorizedQuery.data.suggestedCommitDescription,
        changedFiles: authorizedQuery.data.changedFiles,
        files: authorizedQuery.data.files,
      }
    : redactedHandoff;

  const viewModel = buildDeliveryHandoffViewModel({
    handoff: authorizedHandoff,
    targetBranch: taskSourceBranch(task, activeProject),
    sourceCommitSha: taskSourceCommitSha(task, activeProject),
    sourceCommitDrift,
    locale,
    loadError,
  });

  return <DeliveryHandoffPanel handoff={authorizedHandoff} viewModel={viewModel} locale={locale} />;
}
