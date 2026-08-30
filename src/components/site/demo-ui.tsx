import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { CheckStatus } from "./status-pill";
import { StatusMark } from "./status-pill";

export function DemoPanel({
  title,
  badge,
  children,
  className,
}: {
  title?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      {title || badge ? (
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          {title ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {title}
            </p>
          ) : (
            <span />
          )}
          {badge}
        </div>
      ) : null}
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}

export function DemoSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </p>
  );
}

export function DemoBulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function DemoMetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "pass" | "review" | "blocked";
}) {
  const toneClass = {
    neutral: "text-foreground",
    pass: "text-status-pass",
    review: "text-status-review",
    blocked: "text-status-blocked",
  }[tone];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tracking-tight", toneClass)}>{value}</p>
    </div>
  );
}

export function DemoStatusBanner({
  status,
  title,
  description,
}: {
  status: CheckStatus | "RUNNING" | "FAILED" | "AWAITING_APPROVAL";
  title: string;
  description?: string;
}) {
  const toneClass: Record<string, string> = {
    PASS: "border-status-pass/30 bg-status-pass/5",
    BLOCKED: "border-status-blocked/30 bg-status-blocked/5",
    "NEEDS HUMAN REVIEW": "border-status-review/30 bg-status-review/5",
    STALE: "border-status-stale/30 bg-muted/40",
    RUNNING: "border-status-review/30 bg-status-review/5",
    FAILED: "border-destructive/30 bg-destructive/5",
    AWAITING_APPROVAL: "border-status-review/30 bg-status-review/5",
  };

  const markStatus: CheckStatus | null =
    status === "RUNNING" || status === "FAILED" || status === "AWAITING_APPROVAL"
      ? null
      : status;

  return (
    <div className={cn("rounded-lg border px-5 py-4 sm:px-6", toneClass[status] ?? "border-border bg-card")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            {markStatus ? (
              <StatusMark status={markStatus} />
            ) : (
              <span className="inline-flex items-center rounded-full border border-status-review/40 bg-background px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-status-review">
                {status}
              </span>
            )}
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
          </div>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DemoKeyValueTable({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-border rounded-lg border border-border bg-card">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <dt className="text-sm text-muted-foreground">{row.label}</dt>
          <dd className="text-right text-sm font-medium text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DemoCollapsible({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/40">
        {title}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-lg border border-border bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function DemoPageHeader({
  title,
  meta,
  description,
}: {
  title: string;
  meta?: string;
  description?: string;
}) {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {meta ? <p className="font-mono text-xs text-muted-foreground">{meta}</p> : null}
      {description ? (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}
