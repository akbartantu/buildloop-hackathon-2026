import { Button } from "@/components/ui/button";
import { DemoPanel, DemoSectionLabel } from "@/components/site/demo-ui";
import { translate, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import type { TaskRecord } from "@/lib/tasks-schema";
import {
  pendingProtectedPathApprovalPaths,
  shouldPreferProtectedPathApprovalSurface,
} from "@/lib/protected-path-approval-flow";

type ProtectedPathApprovalPanelProps = {
  task: TaskRecord;
  locale: Locale;
  submitting: boolean;
  error: string | null;
  onApprove: () => void;
  onReject: () => void;
};

export function ProtectedPathApprovalPanel({
  task,
  locale,
  submitting,
  error,
  onApprove,
  onReject,
}: ProtectedPathApprovalPanelProps) {
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(locale, key, params);
  const pending = task.runnerState?.pendingProtectedPathApproval;
  const paths = pendingProtectedPathApprovalPaths(task);

  if (!shouldPreferProtectedPathApprovalSurface(task) || !pending) {
    return null;
  }

  return (
    <DemoPanel title={t("taskDetail.approval.protectedPath.title")}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("taskDetail.approval.protectedPath.boundedNote")}</p>
        <div>
          <DemoSectionLabel>{t("taskDetail.approval.protectedPath.pathLabel")}</DemoSectionLabel>
          <ul className="mt-2 space-y-1">
            {paths.map((path) => (
              <li key={path} className="space-y-1">
                <span className="font-mono text-sm text-foreground">{path}</span>
                <p className="text-xs text-muted-foreground">
                  {t("taskDetail.approval.protectedPath.scopedApproval", { path })}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <DemoSectionLabel>{t("taskDetail.approval.protectedPath.reasonLabel")}</DemoSectionLabel>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{pending.reason}</p>
        </div>
        {error ? <p className="text-sm text-status-blocked">{error}</p> : null}
        <div className="flex flex-wrap gap-3 border-t border-border pt-4">
          <Button type="button" variant="outline" disabled={submitting} onClick={onReject}>
            {submitting ? t("taskDetail.approval.protectedPath.rejecting") : t("taskDetail.approval.protectedPath.reject")}
          </Button>
          <Button type="button" disabled={submitting} onClick={onApprove}>
            {submitting
              ? t("taskDetail.approval.protectedPath.approving")
              : t("taskDetail.approval.protectedPath.approve")}
          </Button>
        </div>
      </div>
    </DemoPanel>
  );
}

export function ProtectedPathApprovalOutcome({
  task,
  locale,
}: {
  task: TaskRecord;
  locale: Locale;
}) {
  const t = (key: TranslationKey) => translate(locale, key);
  const approvals = task.runnerState?.protectedPathApprovals ?? [];
  const rejected =
    task.runnerState?.rejected &&
    task.blockedReasons.some((reason) => reason.rule === "PROTECTED_PATH_APPROVAL_REJECTED");

  if (rejected) {
    return (
      <DemoPanel title={t("taskDetail.approval.protectedPath.rejectedTitle")}>
        <p className="text-sm text-foreground">{t("taskDetail.approval.protectedPath.rejectedBody")}</p>
      </DemoPanel>
    );
  }

  if (task.runnerState?.protectedPathResumeRequested && approvals.length) {
    return (
      <DemoPanel title={t("taskDetail.approval.protectedPath.approvedTitle")}>
        <p className="text-sm text-foreground">{t("taskDetail.approval.protectedPath.approvedBody")}</p>
        <ul className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
          {approvals.flatMap((entry) => entry.paths).map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      </DemoPanel>
    );
  }

  return null;
}
