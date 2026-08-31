import { cn } from "@/lib/utils";
import type { IntegrationStatusKey } from "@/lib/runtime/runtime-status";
import type { TranslationKey } from "@/i18n/en";
import { useI18n } from "@/i18n/context";

export function IntegrationStatusRow({
  name,
  description,
  status,
  note,
}: {
  name: string;
  description: string;
  status: IntegrationStatusKey;
  note?: string;
}) {
  const { t } = useI18n();
  const statusLabel = t(`integrations.status.${status}` as TranslationKey);

  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">{name}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          {note ? (
            <p className="font-mono text-[11px] text-muted-foreground">{note}</p>
          ) : null}
        </div>
        <p
          className={cn(
            "shrink-0 font-mono text-[10px] uppercase tracking-[0.14em]",
            status === "active" || status === "configured" || status === "available" || status === "production"
              ? "text-status-pass"
              : status === "not_connected" || status === "not_configured" || status === "unavailable"
                ? "text-muted-foreground"
                : "text-foreground",
          )}
        >
          {statusLabel}
        </p>
      </div>
    </div>
  );
}
