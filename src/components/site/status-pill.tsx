import { cn } from "@/lib/utils";

export type CheckStatus = "PASS" | "BLOCKED" | "NEEDS HUMAN REVIEW" | "STALE";

const statusClass: Record<CheckStatus, string> = {
  PASS: "text-status-pass border-status-pass/50",
  BLOCKED: "text-status-blocked border-status-blocked/60",
  "NEEDS HUMAN REVIEW": "text-status-review border-status-review/60",
  STALE: "text-status-stale border-status-stale/50",
};

/** Status selalu ditulis sebagai teks, warna hanya pendukung. */
export function StatusMark({ status, className }: { status: CheckStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[2px] border-l-2 border-y-0 border-r-0 bg-transparent pl-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em]",
        statusClass[status],
        className,
      )}
    >
      {status}
    </span>
  );
}
