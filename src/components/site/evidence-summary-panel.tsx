import { DemoBulletList, DemoPanel, DemoSectionLabel } from "@/components/site/demo-ui";
import { SemanticStatusBadge } from "@/components/site/semantic-status-badge";
import { verdictPresentation } from "@/lib/status-presentation";
import type { EvidenceSummaryViewModel } from "@/lib/evidence-summary";
import { translate, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import type { ImplementationVerdict } from "@/lib/task-lifecycle";

type EvidenceSummaryPanelProps = {
  summary: EvidenceSummaryViewModel;
  verdict: ImplementationVerdict;
  locale: Locale;
};

export function EvidenceSummaryPanel({ summary, verdict, locale }: EvidenceSummaryPanelProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  const verdictBadge = verdictPresentation(verdict, locale);

  return (
    <DemoPanel title={t("taskDetail.evidence.summary")}>
      <div className="space-y-4">
        <div className="space-y-2">
          {verdictBadge ? <SemanticStatusBadge presentation={verdictBadge} size="md" /> : null}
          {summary.classificationLabel ? (
            <p className="text-sm font-medium text-foreground">{summary.classificationLabel}</p>
          ) : null}
          <h3 className="text-base font-semibold tracking-tight text-foreground">{summary.headline}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{summary.intro}</p>
          {summary.runtimeFailureExplanation ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              {summary.runtimeFailureExplanation}
            </p>
          ) : null}
        </div>

        {summary.whatPassed.length > 0 ? (
          <section>
            <DemoSectionLabel>{t("evidence.sections.whatPassed")}</DemoSectionLabel>
            <DemoBulletList items={summary.whatPassed} />
          </section>
        ) : null}

        {summary.whatFailed.length > 0 ? (
          <section>
            <DemoSectionLabel>{t("evidence.sections.whatFailed")}</DemoSectionLabel>
            <DemoBulletList items={summary.whatFailed} />
          </section>
        ) : null}

        {summary.whatThisMeans.length > 0 ? (
          <section>
            <DemoSectionLabel>{t("evidence.sections.whatThisMeans")}</DemoSectionLabel>
            <DemoBulletList items={summary.whatThisMeans} />
          </section>
        ) : null}

        {summary.correctionExplanation ? (
          <section>
            <DemoSectionLabel>{t("evidence.sections.automaticActions")}</DemoSectionLabel>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {summary.correctionExplanation}
            </p>
          </section>
        ) : null}

        <section>
          <DemoSectionLabel>{t("evidence.sections.recommendedNextStep")}</DemoSectionLabel>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {summary.recommendedNextStep}
          </p>
        </section>

        <section>
          <DemoSectionLabel>{t("evidence.sections.remoteActions")}</DemoSectionLabel>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{summary.remoteActions}</p>
        </section>
      </div>
    </DemoPanel>
  );
}

export function evidenceSummaryContainsOnlyRawCommands(summary: EvidenceSummaryViewModel): boolean {
  if (summary.whatFailed.length === 0) {
    return false;
  }
  const userFacing = summary.whatFailed.join(" ");
  const rawOnly = summary.whatFailed.every((line) => /^Command failed:/i.test(line));
  return rawOnly && !userFacing.includes("validation") && !userFacing.includes("validasi");
}
