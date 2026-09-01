import { cn } from "@/lib/utils";
import { translate, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";
import { en, id } from "@/i18n";

type RoleSummaryPanelProps = {
  locale: Locale;
  compact?: boolean;
};

export function RoleSummaryPanel({ locale, compact = false }: RoleSummaryPanelProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  const catalog = (locale === "id" ? id : en) as typeof en;
  const roleCards = [
    {
      title: t("taskDetail.orchestration.roles.orchestrator.title"),
      tone: "border-status-review/30 bg-status-review/5",
      items: [...catalog.taskDetail.orchestration.roles.orchestrator.items],
    },
    {
      title: t("taskDetail.orchestration.roles.worker.title"),
      tone: "border-status-pass/30 bg-status-pass/5",
      items: [...catalog.taskDetail.orchestration.roles.worker.items],
    },
    {
      title: t("taskDetail.orchestration.roles.checker.title"),
      tone: "border-status-review/40 bg-accent/40",
      items: [...catalog.taskDetail.orchestration.roles.checker.items],
    },
    {
      title: t("taskDetail.orchestration.roles.decision.title"),
      tone: "border-border bg-card",
      items: [...catalog.taskDetail.orchestration.roles.decision.items],
    },
  ];

  return (
    <div className={cn("grid gap-3", compact ? "sm:grid-cols-2 xl:grid-cols-4" : "lg:grid-cols-4")}>
      {roleCards.map((card) => (
        <div key={card.title} className={cn("rounded-lg border p-4", card.tone)}>
          <p className="text-sm font-semibold text-foreground">{card.title}</p>
          <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            {card.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
