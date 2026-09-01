import { SemanticStatusInline } from "@/components/site/semantic-status-badge";
import { progressVisualPresentation } from "@/lib/status-presentation";
import {
  buildHumanGatedDeliveryStrip,
  type DeliveryStripStepView,
} from "@/lib/run-clarity-presentation";
import type { TaskLifecycleViewModel } from "@/lib/task-lifecycle";
import { cn } from "@/lib/utils";
import { translate, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";

type HumanGatedDeliveryStripProps = {
  task: import("@/lib/tasks-schema").TaskRecord;
  lifecycle: TaskLifecycleViewModel;
  locale: Locale;
};

export function HumanGatedDeliveryStrip({
  task,
  lifecycle,
  locale,
}: HumanGatedDeliveryStripProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  const steps = buildHumanGatedDeliveryStrip(task, lifecycle, locale);

  return (
    <section aria-labelledby="human-gated-delivery-heading">
      <p id="human-gated-delivery-heading" className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {t("runClarity.strip.title")}
      </p>
      <ol className="mt-3 flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-center gap-2">
            <DeliveryStripStepCard step={step} locale={locale} />
            {index < steps.length - 1 ? (
              <span className="hidden text-muted-foreground sm:inline" aria-hidden="true">
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function DeliveryStripStepCard({
  step,
  locale,
}: {
  step: DeliveryStripStepView;
  locale: Locale;
}) {
  const presentation = progressVisualPresentation(step.visualState, locale);
  return (
    <div
      className={cn(
        "flex min-h-[5.5rem] w-[9.5rem] shrink-0 flex-col rounded-lg border px-3 py-2",
        presentation.borderClass,
        step.visualState === "completed" && "bg-status-pass/5",
        step.visualState === "active" && "bg-status-review/5",
        step.visualState === "blocked" && "bg-status-blocked/5",
        step.visualState === "failed" && "bg-destructive/5",
        step.visualState === "waiting" && "bg-muted/20",
        step.visualState === "skipped" && "bg-muted/10",
      )}
    >
      <SemanticStatusInline presentation={presentation} />
      <p className="mt-2 text-xs font-semibold text-foreground">{step.label}</p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
        {step.statusLabel}
      </p>
    </div>
  );
}

export function deliveryStripStepKeys(steps: DeliveryStripStepView[]): string[] {
  return steps.map((step) => step.key);
}
