import { Check } from "lucide-react";
import { usePublicI18n } from "@/i18n/use-public-i18n";

const LIFECYCLE_KEYS = ["planning", "preflight", "worker", "checker", "decision"] as const;

const DELIVERY_KEYS = ["commit", "push", "merge", "deploy"] as const;

export function LandingHeroPreview() {
  const { pt } = usePublicI18n();

  return (
    <figure
      className="rounded-xl border border-border bg-card shadow-sm"
      aria-label={pt("heroPreview.illustrative")}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {pt("heroPreview.illustrative")}
          </p>
          <p className="mt-1.5 font-mono text-xs text-foreground">{pt("heroPreview.runLabel")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded-md border border-status-pass/40 bg-status-pass/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-status-pass">
            {pt("heroPreview.resultPass")}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">{pt("heroPreview.duration")}</span>
        </div>
      </header>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {LIFECYCLE_KEYS.map((key, index) => (
            <li key={key} className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] text-foreground">
                <Check className="size-3 text-status-pass" aria-hidden="true" />
                {pt(`heroPreview.lifecycle.${key}`)}
              </span>
              {index < LIFECYCLE_KEYS.length - 1 ? (
                <span aria-hidden="true" className="hidden text-muted-foreground sm:inline">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>

        <div className="rounded-lg border border-status-pass/30 bg-status-pass/5 px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-status-pass">
            {pt("heroPreview.resultPass")}
          </p>
          <p className="mt-1 text-sm text-foreground">{pt("heroPreview.resultSummary")}</p>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {pt("heroPreview.changesTitle")}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{pt("heroPreview.filesChanged")}</p>
          <ul className="mt-2 space-y-1.5 font-mono text-xs">
            <li className="flex items-center justify-between gap-3 text-foreground">
              <span>{pt("heroPreview.file1")}</span>
              <span className="text-status-pass">{pt("heroPreview.file1Diff")}</span>
            </li>
            <li className="flex items-center justify-between gap-3 text-foreground">
              <span>{pt("heroPreview.file2")}</span>
              <span className="text-status-pass">{pt("heroPreview.file2Diff")}</span>
            </li>
          </ul>
        </div>

        <div className="border-t border-border pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {pt("heroPreview.nextTitle")}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{pt("heroPreview.awaitingApproval")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DELIVERY_KEYS.map((key) => (
              <div
                key={key}
                className="rounded-md border border-border bg-muted/20 px-2 py-2 text-center"
              >
                <p className="text-[11px] font-medium text-foreground">{pt(`heroPreview.${key}`)}</p>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  {pt("heroPreview.notApproved")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}
