import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import {
  DEFAULT_STICKY_HEADER_HEIGHT,
  DEFAULT_TOUR_CARD_HEIGHT,
  DEFAULT_TOUR_CARD_WIDTH,
  DEFAULT_VIEWPORT_MARGIN,
  MIN_TOUR_CARD_WIDTH,
  computeTourTargetScrollDelta,
  estimateReserveForPlacement,
  resolveTourCardPosition,
  resolveTourCardWidth,
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

const TARGET_WAIT_MS = 2500;
const TARGET_POLL_MS = 80;

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

function waitForTourTarget(targetKey: string | null): Promise<TargetRect | null> {
  if (!targetKey || typeof document === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const started = Date.now();

    const attempt = () => {
      const rect = getTargetRect(targetKey);
      if (rect) {
        resolve(rect);
        return;
      }
      if (Date.now() - started >= TARGET_WAIT_MS) {
        resolve(null);
        return;
      }
      window.setTimeout(attempt, TARGET_POLL_MS);
    };

    attempt();
  });
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
  if (position.layoutMode === "sheet") {
    return {
      left: DEFAULT_VIEWPORT_MARGIN,
      right: DEFAULT_VIEWPORT_MARGIN,
      bottom: DEFAULT_VIEWPORT_MARGIN,
      top: "auto",
      transform: "none",
      width: "auto",
      minWidth: MIN_TOUR_CARD_WIDTH,
      maxWidth: position.maxWidth,
      maxHeight: position.maxHeight,
    };
  }

  return {
    top: position.top,
    left: position.left,
    transform: position.transform,
    width: position.width,
    minWidth: MIN_TOUR_CARD_WIDTH,
    maxWidth: position.maxWidth,
    maxHeight: position.maxHeight,
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
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [cardHeight, setCardHeight] = useState(DEFAULT_TOUR_CARD_HEIGHT);
  const [cardPosition, setCardPosition] = useState<ResolvedTourCardPosition | null>(null);
  const [targetReady, setTargetReady] = useState(false);
  const layoutVersionRef = useRef(0);

  const steps = useMemo(() => buildProductTourSteps(t), [t]);
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const cardSize = useMemo<CardSize>(() => {
    const width =
      typeof window !== "undefined"
        ? resolveTourCardWidth({ width: window.innerWidth, height: window.innerHeight })
        : DEFAULT_TOUR_CARD_WIDTH;
    return { width, height: cardHeight };
  }, [cardHeight]);

  const updatePosition = useCallback(
    (rect: TargetRect | null) => {
      if (!step || typeof window === "undefined") {
        setCardPosition(null);
        return;
      }

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
    },
    [cardSize, step],
  );

  const recomputeTargetLayout = useCallback(async () => {
    if (!active || !step || typeof window === "undefined") {
      setTargetRect(null);
      setCardPosition(null);
      setTargetReady(false);
      return;
    }

    const version = layoutVersionRef.current + 1;
    layoutVersionRef.current = version;
    setTargetReady(false);

    const resolvedTarget = step.placement === "center" ? null : resolveTourTarget(step);
    if (resolvedTarget) {
      scrollTourTargetIntoView(resolvedTarget, cardSize, step.placement);
    }

    const rect =
      step.placement === "center" ? null : await waitForTourTarget(resolvedTarget);
    if (layoutVersionRef.current !== version) {
      return;
    }

    setTargetRect(rect);
    updatePosition(rect);
    setTargetReady(true);
  }, [active, cardSize, step, updatePosition]);

  useEffect(() => {
    if (!active || !cardRef.current || typeof ResizeObserver === "undefined") return;

    const element = cardRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const height = Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      if (height > 0) {
        setCardHeight(height);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [active, stepIndex]);

  useEffect(() => {
    void recomputeTargetLayout();
  }, [recomputeTargetLayout, stepIndex]);

  useEffect(() => {
    if (!active || !targetReady) return;

    const handleLayout = () => {
      const resolvedTarget = step?.placement === "center" ? null : resolveTourTarget(step!);
      const rect = resolvedTarget ? getTargetRect(resolvedTarget) : null;
      setTargetRect(rect);
      updatePosition(rect);
    };

    window.addEventListener("resize", handleLayout);
    window.addEventListener("scroll", handleLayout, true);
    return () => {
      window.removeEventListener("resize", handleLayout);
      window.removeEventListener("scroll", handleLayout, true);
    };
  }, [active, step, targetReady, updatePosition]);

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

      window.setTimeout(() => {
        void recomputeTargetLayout();
      }, 120);
    };

    void runNavigation();
  }, [active, stepIndex, latestTaskId, hasRunEvidence, navigate, recomputeTargetLayout, step]);

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
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, onClose]);

  useEffect(() => {
    if (active && cardRef.current) {
      cardRef.current.focus();
    }
    if (active && bodyScrollRef.current) {
      bodyScrollRef.current.scrollTop = 0;
    }
  }, [active, stepIndex]);

  if (!active || !step) return null;

  const body = contextualBody(step, t, hasRunEvidence);
  const fallbackPosition =
    typeof window !== "undefined"
      ? resolveTourCardPosition({
          preferredPlacement: "center",
          targetRect: null,
          card: cardSize,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          headerOffset: DEFAULT_STICKY_HEADER_HEIGHT,
        })
      : null;
  const cardStyle = cardPosition ? toCardStyle(cardPosition) : fallbackPosition ? toCardStyle(fallbackPosition) : undefined;

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
          "absolute z-[201] flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg outline-none",
          "animate-in fade-in-0 zoom-in-95 duration-200",
        )}
        style={cardStyle}
      >
        <div ref={bodyScrollRef} className="min-h-0 flex-1 overflow-y-auto p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("productTour.stepLabel", { current: stepIndex + 1, total: steps.length })}
          </p>
          <h2 id="product-tour-title" className="mt-2 text-base font-semibold leading-snug text-foreground">
            {step.title}
          </h2>
          <p id="product-tour-body" className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border p-4">
          {!isFirst ? (
            <Button type="button" variant="outline" size="sm" onClick={handleBack}>
              {t("productTour.back")}
            </Button>
          ) : (
            <span className="w-[72px]" aria-hidden="true" />
          )}
          <Button type="button" variant="ghost" size="sm" onClick={handleSkip} className="mx-auto">
            {t("productTour.skip")}
          </Button>
          <Button type="button" size="sm" onClick={isLast ? handleFinish : handleNext}>
            {isLast ? t("productTour.finish") : t("productTour.next")}
          </Button>
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
