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

export const DELIVERY_STRIP_LIST_CLASS =
  "mt-3 flex w-full flex-nowrap items-stretch gap-1 overflow-x-auto pb-1 sm:gap-1.5 lg:overflow-x-visible";

export const DELIVERY_STRIP_STEP_CARD_CLASS =
  "flex min-h-[4.25rem] w-[7rem] shrink-0 flex-col rounded-lg border px-2 py-1.5 sm:w-[7.25rem] lg:min-w-0 lg:w-auto lg:flex-1";

export const DELIVERY_STRIP_DELIVERY_STEP_CARD_CLASS = "lg:flex-[1.12]";

export function humanGatedDeliveryStripUsesExternalHeadingOnly(): boolean {
  return true;
}

export function HumanGatedDeliveryStrip({
  task,
  lifecycle,
  locale,
}: HumanGatedDeliveryStripProps) {
  const steps = buildHumanGatedDeliveryStrip(task, lifecycle, locale);

  return (
    <ol className={DELIVERY_STRIP_LIST_CLASS} aria-label={translate(locale, "runClarity.strip.title")}>
      {steps.map((step, index) => (
        <li key={step.key} className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5 lg:flex-1 lg:shrink">
          <DeliveryStripStepCard step={step} locale={locale} />
          {index < steps.length - 1 ? (
            <span className="shrink-0 text-xs text-muted-foreground sm:text-sm" aria-hidden="true">
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
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
        DELIVERY_STRIP_STEP_CARD_CLASS,
        presentation.borderClass,
        step.key === "delivery" && DELIVERY_STRIP_DELIVERY_STEP_CARD_CLASS,
        step.visualState === "completed" && "bg-status-pass/5",
        step.visualState === "active" && "bg-status-review/5",
        step.visualState === "blocked" && "bg-status-blocked/5",
        step.visualState === "failed" && "bg-destructive/5",
        step.visualState === "waiting" && "bg-muted/20",
        step.visualState === "skipped" && "bg-muted/10",
      )}
    >
      <SemanticStatusInline presentation={presentation} />
      <p className="mt-1.5 text-[11px] font-semibold leading-tight text-foreground sm:text-xs">
        {step.label}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
        {step.statusLabel}
      </p>
    </div>
  );
}

export function deliveryStripStepKeys(steps: DeliveryStripStepView[]): string[] {
  return steps.map((step) => step.key);
}

export function deliveryStripUsesSingleContinuousRow(): boolean {
  return DELIVERY_STRIP_LIST_CLASS.includes("flex-nowrap") && !DELIVERY_STRIP_LIST_CLASS.includes("flex-wrap");
}

export function deliveryStripUsesCompactDesktopLayout(): boolean {
  return (
    DELIVERY_STRIP_LIST_CLASS.includes("lg:overflow-x-visible") &&
    DELIVERY_STRIP_STEP_CARD_CLASS.includes("lg:flex-1")
  );
}
