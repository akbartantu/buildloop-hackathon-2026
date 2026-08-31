import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DemoBulletList,
  DemoCollapsible,
  DemoPanel,
  DemoSectionLabel,
} from "@/components/site/demo-ui";
import type { DeliveryHandoffViewModel } from "@/lib/delivery-handoff-presentation";
import type { DeliveryHandoff } from "@/lib/delivery-artifact";
import { useI18n } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/en";
import { translate, type Locale } from "@/i18n";

type DeliveryHandoffPanelProps = {
  handoff: DeliveryHandoff;
  viewModel: DeliveryHandoffViewModel;
  locale?: Locale;
};

function CopyField({
  label,
  value,
  locale,
}: {
  label: string;
  value: string;
  locale: Locale;
}) {
  const [copied, setCopied] = useState(false);
  const t = (key: TranslationKey) => translate(locale, key);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <DemoSectionLabel>{label}</DemoSectionLabel>
        <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
          {copied ? t("delivery.handoff.copied") : t("delivery.handoff.copy")}
        </Button>
      </div>
      <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
        {value}
      </pre>
    </div>
  );
}

export function DeliveryHandoffPanel({ handoff, viewModel, locale: localeProp }: DeliveryHandoffPanelProps) {
  const { locale: contextLocale } = useI18n();
  const locale = localeProp ?? contextLocale;
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(locale, key, params);

  function downloadPatch() {
    if (!handoff.patch) return;
    const blob = new Blob([handoff.patch], { type: "text/x-patch;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = handoff.patchFilename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DemoPanel title={viewModel.title}>
      <p className="text-sm leading-relaxed text-foreground">{viewModel.intro}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("delivery.handoff.verifiedAgainst", { sha: viewModel.verifiedAgainstSha })}
      </p>
      {viewModel.sourceDriftWarning ? (
        <p className="mt-2 text-sm text-status-review">{viewModel.sourceDriftWarning}</p>
      ) : null}

      {viewModel.patchAvailable ? (
        <div className="mt-4">
          <Button type="button" variant="default" size="sm" onClick={downloadPatch}>
            <Download className="mr-2 size-4" aria-hidden="true" />
            {t("delivery.handoff.downloadPatch")}
          </Button>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{viewModel.patchFilename}</p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-status-review">
          {viewModel.blockedReason ?? t("delivery.handoff.blockedDefault")}
        </p>
      )}

      <div className="mt-4">
        <DemoSectionLabel>{t("delivery.handoff.changedFiles")}</DemoSectionLabel>
        <DemoBulletList items={viewModel.changedFiles} />
      </div>

      {viewModel.binaryFiles.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("delivery.handoff.binaryNotice", { count: viewModel.binaryFiles.length })}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        <CopyField
          label={t("delivery.handoff.suggestedMessage")}
          value={viewModel.suggestedCommitMessage}
          locale={locale}
        />
        <CopyField
          label={t("delivery.handoff.suggestedDescription")}
          value={viewModel.suggestedCommitDescription}
          locale={locale}
        />
      </div>

      <div className="mt-4">
        <DemoSectionLabel>{t("delivery.handoff.applyLocally")}</DemoSectionLabel>
        <CopyField label={t("delivery.handoff.applyCommands")} value={viewModel.applyCommands} locale={locale} />
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("delivery.handoff.steps.apply")}</li>
          <li>{t("delivery.handoff.steps.review")}</li>
          <li>{t("delivery.handoff.steps.stage")}</li>
          <li>{t("delivery.handoff.steps.commit")}</li>
          <li>{t("delivery.handoff.steps.push")}</li>
        </ol>
      </div>

      <div className="mt-4">
        <DemoSectionLabel>{t("delivery.handoff.remoteActions")}</DemoSectionLabel>
        <DemoBulletList items={viewModel.remoteActions.map((item) => `${item.label}: ${item.value}`)} />
      </div>

      <DemoCollapsible title={t("delivery.handoff.pushGuidance")}>
        <CopyField label={t("delivery.handoff.pushCommand")} value={viewModel.pushCommand} locale={locale} />
        <p className="mt-2 text-sm text-muted-foreground">{viewModel.pushNote}</p>
      </DemoCollapsible>

      <p className="mt-4 text-xs text-muted-foreground">{t("delivery.handoff.directDeliveryNote")}</p>
    </DemoPanel>
  );
}
