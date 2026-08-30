import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  isProductTourCompleted,
  markProductTourCompleted,
  PRODUCT_TOUR_STEPS,
  resolveTourTarget,
  type ProductTourStep,
} from "@/lib/product-tour";
import { cn } from "@/lib/utils";

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

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

function contextualBody(step: ProductTourStep, hasRunEvidence: boolean): string {
  if (step.id === "contract") {
    return step.body;
  }
  if (step.id === "evidence" && !hasRunEvidence) {
    return `${step.body} Evidence appears after you run the orchestrator on an approved task.`;
  }
  return step.body;
}

function cardStyle(
  placement: ProductTourStep["placement"],
  rect: TargetRect | null,
): CSSProperties {
  const margin = 12;
  const cardWidth = 320;

  if (placement === "center" || !rect) {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: cardWidth,
      maxWidth: "calc(100vw - 2rem)",
    };
  }

  switch (placement) {
    case "right":
      return {
        top: rect.top + rect.height / 2,
        left: rect.left + rect.width + margin,
        transform: "translateY(-50%)",
        width: cardWidth,
        maxWidth: `calc(100vw - ${rect.left + rect.width + margin + 16}px)`,
      };
    case "left":
      return {
        top: rect.top + rect.height / 2,
        left: rect.left - margin,
        transform: "translate(-100%, -50%)",
        width: cardWidth,
      };
    case "top":
      return {
        top: rect.top - margin,
        left: rect.left + rect.width / 2,
        transform: "translate(-50%, -100%)",
        width: cardWidth,
      };
    case "bottom":
    default:
      return {
        top: rect.top + rect.height + margin,
        left: Math.min(
          Math.max(rect.left + rect.width / 2, cardWidth / 2 + 16),
          window.innerWidth - cardWidth / 2 - 16,
        ),
        transform: "translateX(-50%)",
        width: cardWidth,
        maxWidth: "calc(100vw - 2rem)",
      };
  }
}

export function ProductTour({
  active,
  stepIndex,
  latestTaskId,
  hasRunEvidence,
  onClose,
  onStepChange,
}: ProductTourProps) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const step = PRODUCT_TOUR_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === PRODUCT_TOUR_STEPS.length - 1;

  const refreshTarget = useCallback(() => {
    if (!active || !step) {
      setTargetRect(null);
      return;
    }
    const resolved = step.placement === "center" ? null : resolveTourTarget(step);
    setTargetRect(resolved ? getTargetRect(resolved) : null);
  }, [active, step]);

  useEffect(() => {
    refreshTarget();
    if (!active) return;

    const handleLayout = () => refreshTarget();
    window.addEventListener("resize", handleLayout);
    window.addEventListener("scroll", handleLayout, true);
    const interval = window.setInterval(refreshTarget, 300);

    return () => {
      window.removeEventListener("resize", handleLayout);
      window.removeEventListener("scroll", handleLayout, true);
      window.clearInterval(interval);
    };
  }, [active, refreshTarget, stepIndex]);

  useEffect(() => {
    if (!active || !step) return;

    const runNavigation = async () => {
      if (step.id === "contract" && latestTaskId) {
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
      } else if (step.id === "welcome" || step.id === "tasks" || step.id === "finish") {
        await navigate({ to: "/app" });
      }
      window.setTimeout(refreshTarget, 150);
    };

    void runNavigation();
  }, [active, stepIndex, latestTaskId, hasRunEvidence, navigate, refreshTarget, step]);

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

  const resolvedTarget = step.placement === "center" ? null : resolveTourTarget(step);
  const effectivePlacement =
    resolvedTarget && getTargetRect(resolvedTarget) ? step.placement : "center";
  const body = contextualBody(step, hasRunEvidence);

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
        style={cardStyle(effectivePlacement, targetRect)}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Step {stepIndex + 1} of {PRODUCT_TOUR_STEPS.length}
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
              Back
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={handleSkip} className="mr-auto">
            Skip tour
          </Button>
          {isLast ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleFinish}>
                Finish
              </Button>
              {latestTaskId ? (
                <Button type="button" size="sm" asChild>
                  <Link
                    to="/app/tasks/$taskId"
                    params={{ taskId: latestTaskId }}
                    onClick={handleFinish}
                  >
                    Open task
                  </Link>
                </Button>
              ) : (
                <Button type="button" size="sm" asChild>
                  <Link to="/app/tasks/new" onClick={handleFinish}>
                    Create first task
                  </Link>
                </Button>
              )}
            </>
          ) : (
            <Button type="button" size="sm" onClick={handleNext}>
              Next
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
