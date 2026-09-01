import { buildSafetyGuarantees } from "@/lib/run-clarity-presentation";
import type { TaskLifecycleViewModel } from "@/lib/task-lifecycle";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeliveryActionState } from "@/lib/task-lifecycle";

type SafetyGuaranteesPanelProps = {
  lifecycle: TaskLifecycleViewModel;
};

function guaranteeIcon(state: DeliveryActionState) {
  if (state === "EXECUTED") {
    return <CheckCircle2 className="size-3.5 shrink-0 text-status-pass" aria-hidden="true" />;
  }
  if (state === "FAILED") {
    return <XCircle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />;
  }
  return <Circle className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

export function SafetyGuaranteesPanel({ lifecycle }: SafetyGuaranteesPanelProps) {
  const rows = buildSafetyGuarantees(lifecycle);

  return (
    <section>
      <ul className="space-y-2">
        {rows.map((row) => {
          const state = lifecycle.delivery[row.key];
          return (
            <li
              key={row.key}
              className={cn(
                "flex items-start gap-2 rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-sm text-foreground",
                state === "APPROVED" && "border-status-blocked/30 bg-status-blocked/5",
              )}
            >
              {guaranteeIcon(state)}
              <span>{row.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
