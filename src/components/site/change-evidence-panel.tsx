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

function SemanticDiffBlock({
  lines,
  ariaLabel,
}: {
  lines: ChangeEvidenceViewModel["combinedDiffLines"];
  ariaLabel: string;
}) {
  return (
    <pre
      className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed"
      aria-label={ariaLabel}
    >
      {lines.map((line, index) => (
        <code key={`${index}-${line.kind}-${line.text.slice(0, 12)}`} className={line.className}>
          {line.text}
          {"\n"}
        </code>
      ))}
    </pre>
  );
}

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
        <ul className="mt-2 space-y-2 text-sm">
          {viewModel.files.map((file) => (
            <li key={file.path} className="rounded-md border border-border px-3 py-2">
              <div className="font-mono text-xs text-foreground">{file.path}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {file.binary
                  ? `${file.changeTypeLabel} · ${t("evidence.change.binaryOnly")}`
                  : `${file.changeTypeLabel} · ${file.changeSummary}`}
              </div>
              {file.largeDeletionWarning ? (
                <div className="mt-2 rounded-md border border-status-review/30 bg-status-review/10 px-3 py-2 text-xs text-status-review">
                  <p className="font-medium">{t("evidence.change.largeDeletionTitle")}</p>
                  <p className="mt-1">{t("evidence.change.largeDeletionBody")}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {viewModel.truncatedNotice ? (
        <p className="mt-3 text-xs text-status-review">{viewModel.truncatedNotice}</p>
      ) : null}

      {viewModel.combinedDiff ? (
        <div className="mt-4">
          <DemoCollapsible title={t("evidence.change.viewDiff")}>
            <SemanticDiffBlock
              lines={viewModel.combinedDiffLines}
              ariaLabel={t("evidence.change.viewDiff")}
            />
          </DemoCollapsible>
        </div>
      ) : null}
    </DemoPanel>
  );
}
