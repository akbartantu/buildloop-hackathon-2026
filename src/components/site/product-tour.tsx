import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import {
  DEFAULT_STICKY_HEADER_HEIGHT,
  DEFAULT_TOUR_CARD_HEIGHT,
  DEFAULT_TOUR_CARD_WIDTH,
  computeTourTargetScrollDelta,
  estimateReserveForPlacement,
  resolveTourCardPosition,
  type CardSize,
  type ResolvedTourCardPosition,
  type TargetRect,
} from "@/lib/product-tour-placement";
import {
  buildProductTourSteps,
  isProductTourCompleted,
  markProductTourCompleted,
  resolveTourTarget,
  type ProductTourStep,
} from "@/lib/product-tour";
import { cn } from "@/lib/utils";

type ProductTourProps = {
  active: boolean;
  stepIndex: number;
  latestTaskId: string | null;
  hasRunEvidence: boolean;
  onClose: () => void;
  onStepChange: (index: number) => void;
};

function getTargetRect(targetKey: string | null): TargetRect | null {
  if (!targetKey || typeof document === "undefined") return null;
  const element = document.querySelector(`[data-tour="${targetKey}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function scrollTourTargetIntoView(
  targetKey: string | null,
  card: CardSize,
  preferredPlacement: ProductTourStep["placement"],
): void {
  if (!targetKey || typeof document === "undefined") return;

  const element = document.querySelector(`[data-tour="${targetKey}"]`);
  if (!element) return;

  const rect = element.getBoundingClientRect();
  const targetRect: TargetRect = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };

  const reserve = estimateReserveForPlacement(preferredPlacement ?? "center", card);
  const delta = computeTourTargetScrollDelta({
    targetRect,
    viewportHeight: window.innerHeight,
    reserveBelow: reserve.below,
    reserveAbove: reserve.above,
  });

  if (delta !== 0) {
    window.scrollBy({ top: delta, behavior: "auto" });
  }

  element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
}

function contextualBody(
  step: ProductTourStep,
  t: (key: `productTour.${string}`) => string,
  hasRunEvidence: boolean,
): string {
  if (step.id === "evidence" && !hasRunEvidence) {
    return `${step.body} ${t("productTour.evidencePending")}`;
  }
  if (step.id === "specifications") {
    const hasSpecificationsTarget =
      typeof document !== "undefined" &&
      Boolean(document.querySelector('[data-tour="projects-specifications"]'));
    if (!hasSpecificationsTarget) {
      return `${step.body} ${t("productTour.specificationsPending")}`;
    }
  }
  return step.body;
}

function toCardStyle(position: ResolvedTourCardPosition): CSSProperties {
  return {
    top: position.top,
    left: position.left,
    transform: position.transform,
    width: position.width,
    maxWidth: position.maxWidth,
  };
}

export function ProductTour({
  active,
  stepIndex,
  latestTaskId,
  hasRunEvidence,
  onClose,
  onStepChange,
}: ProductTourProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [cardSize, setCardSize] = useState<CardSize>({
    width: DEFAULT_TOUR_CARD_WIDTH,
    height: DEFAULT_TOUR_CARD_HEIGHT,
  });
  const [cardPosition, setCardPosition] = useState<ResolvedTourCardPosition | null>(null);
  const steps = useMemo(() => buildProductTourSteps(t), [t]);
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const recomputeLayout = useCallback(() => {
    if (!active || !step || typeof window === "undefined") {
      setTargetRect(null);
      setCardPosition(null);
      return;
    }

    const resolvedTarget = step.placement === "center" ? null : resolveTourTarget(step);
    scrollTourTargetIntoView(resolvedTarget, cardSize, step.placement);

    const rect = resolvedTarget ? getTargetRect(resolvedTarget) : null;
    setTargetRect(rect);

    const position = resolveTourCardPosition({
      preferredPlacement: rect ? (step.placement ?? "bottom") : "center",
      targetRect: rect,
      card: cardSize,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      headerOffset: DEFAULT_STICKY_HEADER_HEIGHT,
    });
    setCardPosition(position);
  }, [active, cardSize, step]);

  useEffect(() => {
    if (!active || !cardRef.current || typeof ResizeObserver === "undefined") return;

    const element = cardRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setCardSize({ width: Math.ceil(width), height: Math.ceil(height) });
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [active, stepIndex]);

  useEffect(() => {
    recomputeLayout();
    if (!active) return;

    const handleLayout = () => recomputeLayout();
    window.addEventListener("resize", handleLayout);
    window.addEventListener("scroll", handleLayout, true);
    const interval = window.setInterval(recomputeLayout, 300);

    return () => {
      window.removeEventListener("resize", handleLayout);
      window.removeEventListener("scroll", handleLayout, true);
      window.clearInterval(interval);
    };
  }, [active, recomputeLayout, stepIndex, cardSize.height, cardSize.width]);

  useEffect(() => {
    if (!active || !step) return;

    const runNavigation = async () => {
      if (step.id === "workspace" || step.id === "finish") {
        await navigate({ to: "/app" });
      } else if (step.id === "repository" || step.id === "specifications") {
        await navigate({ to: "/app/projects" });
      } else if (step.id === "create-task") {
        await navigate({ to: "/app/tasks/new" });
      } else if (step.id === "contract" && latestTaskId) {
        await navigate({
          to: "/app/tasks/$taskId",
          params: { taskId: latestTaskId },
          search: { tab: "contract" },
        });
      } else if (step.id === "evidence" && latestTaskId && hasRunEvidence) {
        await navigate({
          to: "/app/tasks/$taskId",
          params: { taskId: latestTaskId },
          search: { tab: "evidence" },
        });
      } else if (step.id === "orchestration") {
        await navigate({ to: "/app/runs" });
      } else if (step.id === "approval") {
        await navigate({ to: "/app/approvals" });
      } else if (step.id === "contract" || step.id === "evidence") {
        await navigate({ to: "/app/tasks" });
      }
      window.setTimeout(recomputeLayout, 150);
    };

    void runNavigation();
  }, [active, stepIndex, latestTaskId, hasRunEvidence, navigate, recomputeLayout, step]);

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        markProductTourCompleted();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, onClose]);

  useEffect(() => {
    if (active && cardRef.current) {
      cardRef.current.focus();
    }
  }, [active, stepIndex]);

  if (!active || !step) return null;

  const body = contextualBody(step, t, hasRunEvidence);
  const cardStyle = cardPosition ? toCardStyle(cardPosition) : toCardStyle(
    resolveTourCardPosition({
      preferredPlacement: "center",
      targetRect: null,
      card: cardSize,
      viewport: {
        width: typeof window !== "undefined" ? window.innerWidth : 1280,
        height: typeof window !== "undefined" ? window.innerHeight : 720,
      },
      headerOffset: DEFAULT_STICKY_HEADER_HEIGHT,
    }),
  );

  function handleSkip() {
    markProductTourCompleted();
    onClose();
  }

  function handleFinish() {
    markProductTourCompleted();
    onClose();
  }

  function handleNext() {
    if (isLast) {
      handleFinish();
      return;
    }
    onStepChange(stepIndex + 1);
  }

  function handleBack() {
    if (!isFirst) onStepChange(stepIndex - 1);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-tour-title"
      aria-describedby="product-tour-body"
    >
      {targetRect ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-ring ring-offset-2 ring-offset-background transition-all duration-200"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/45" aria-hidden="true" />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        className={cn(
          "absolute z-[201] rounded-lg border border-border bg-card p-5 shadow-lg outline-none",
          "animate-in fade-in-0 zoom-in-95 duration-200",
        )}
        style={cardStyle}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {t("productTour.stepLabel", { current: stepIndex + 1, total: steps.length })}
        </p>
        <h2 id="product-tour-title" className="mt-2 text-base font-semibold text-foreground">
          {step.title}
        </h2>
        <p id="product-tour-body" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!isFirst ? (
            <Button type="button" variant="outline" size="sm" onClick={handleBack}>
              {t("productTour.back")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={handleSkip} className="mr-auto">
            {t("productTour.skip")}
          </Button>
          {isLast ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleFinish}>
                {t("productTour.finish")}
              </Button>
              {latestTaskId ? (
                <Button type="button" size="sm" asChild>
                  <Link
                    to="/app/tasks/$taskId"
                    params={{ taskId: latestTaskId }}
                    onClick={handleFinish}
                  >
                    {t("productTour.openTask")}
                  </Link>
                </Button>
              ) : (
                <Button type="button" size="sm" asChild>
                  <Link to="/app/tasks/new" onClick={handleFinish}>
                    {t("productTour.createFirstTask")}
                  </Link>
                </Button>
              )}
            </>
          ) : (
            <Button type="button" size="sm" onClick={handleNext}>
              {t("productTour.next")}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export type ProductTourController = {
  start: (options?: { replay?: boolean }) => void;
  close: () => void;
  isActive: boolean;
};

export function useProductTourController(
  latestTaskId: string | null,
  hasRunEvidence: boolean,
): ProductTourController & {
  stepIndex: number;
  setStepIndex: (index: number) => void;
} {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const autoStarted = useRef(false);

  const start = useCallback((options?: { replay?: boolean }) => {
    setStepIndex(0);
    setIsActive(true);
    if (options?.replay) {
      // replay does not clear completion until finish/skip
    }
  }, []);

  const close = useCallback(() => {
    setIsActive(false);
    setStepIndex(0);
  }, []);

  useEffect(() => {
    if (autoStarted.current) return undefined;
    if (typeof window === "undefined") return undefined;
    if (!isProductTourCompleted()) {
      autoStarted.current = true;
      const timer = window.setTimeout(() => start(), 600);
      return () => window.clearTimeout(timer);
    }
    autoStarted.current = true;
    return undefined;
  }, [start]);

  return {
    start,
    close,
    isActive,
    stepIndex,
    setStepIndex,
  };
}
