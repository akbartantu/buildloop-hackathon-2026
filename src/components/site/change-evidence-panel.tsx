import {
  DemoBulletList,
  DemoCollapsible,
  DemoPanel,
  DemoSectionLabel,
} from "@/components/site/demo-ui";
import type { ChangeEvidenceViewModel } from "@/lib/change-evidence-presentation";
import { useI18n } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/en";
import { translate, type Locale } from "@/i18n";

type ChangeEvidencePanelProps = {
  viewModel: ChangeEvidenceViewModel;
  locale?: Locale;
};

export function ChangeEvidencePanel({ viewModel, locale: localeProp }: ChangeEvidencePanelProps) {
  const { locale: contextLocale } = useI18n();
  const locale = localeProp ?? contextLocale;
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(locale, key, params);

  return (
    <DemoPanel title={viewModel.title}>
      <p className="text-sm leading-relaxed text-foreground">{viewModel.summary}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <DemoSectionLabel>{t("evidence.change.baseline")}</DemoSectionLabel>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{viewModel.baselineSha}</p>
        </div>
        <div>
          <DemoSectionLabel>{t("evidence.change.workerAttempt")}</DemoSectionLabel>
          <p className="mt-1 text-sm text-muted-foreground">{viewModel.attemptNumber}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{viewModel.checkerVerifiedLabel}</p>

      <div className="mt-4">
        <DemoSectionLabel>{t("evidence.change.changedFiles")}</DemoSectionLabel>
        <DemoBulletList
          items={viewModel.files.map((file) =>
            file.binary
              ? `${file.path} (${file.changeTypeLabel}, ${t("evidence.change.binaryOnly")})`
              : `${file.path} (${file.changeTypeLabel})`,
          )}
        />
      </div>

      {viewModel.truncatedNotice ? (
        <p className="mt-3 text-xs text-status-review">{viewModel.truncatedNotice}</p>
      ) : null}

      {viewModel.combinedDiff ? (
        <div className="mt-4">
          <DemoCollapsible title={t("evidence.change.viewDiff")}>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
              {viewModel.combinedDiff}
            </pre>
          </DemoCollapsible>
        </div>
      ) : null}
    </DemoPanel>
  );
}
