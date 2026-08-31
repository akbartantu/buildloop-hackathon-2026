import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Minus,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SemanticIconKind, SemanticStatusPresentation } from "@/lib/status-presentation";

function SemanticStatusIcon({
  iconKind,
  className,
}: {
  iconKind: SemanticIconKind;
  className?: string;
}) {
  switch (iconKind) {
    case "check":
      return <CheckCircle2 className={cn("size-3.5 shrink-0", className)} aria-hidden="true" />;
    case "x":
      return <XCircle className={cn("size-3.5 shrink-0", className)} aria-hidden="true" />;
    case "alert":
      return <AlertTriangle className={cn("size-3.5 shrink-0", className)} aria-hidden="true" />;
    case "dot":
      return (
        <Circle
          className={cn("size-3.5 shrink-0 fill-current", className)}
          aria-hidden="true"
        />
      );
    case "minus":
      return <Minus className={cn("size-3.5 shrink-0", className)} aria-hidden="true" />;
    default:
      return <Circle className={cn("size-3.5 shrink-0", className)} aria-hidden="true" />;
  }
}

type SemanticStatusBadgeProps = {
  presentation: SemanticStatusPresentation;
  className?: string;
  size?: "sm" | "md";
};

export function SemanticStatusBadge({
  presentation,
  className,
  size = "sm",
}: SemanticStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium tracking-wide",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        presentation.badgeClass,
        className,
      )}
      role="status"
      aria-label={presentation.accessibleLabel}
    >
      <SemanticStatusIcon iconKind={presentation.iconKind} className={presentation.iconClass} />
      <span>{presentation.label}</span>
    </span>
  );
}

export function SemanticStatusInline({
  presentation,
  className,
}: {
  presentation: SemanticStatusPresentation;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-sm font-medium", className)}
      role="status"
      aria-label={presentation.accessibleLabel}
    >
      <SemanticStatusIcon iconKind={presentation.iconKind} className={presentation.iconClass} />
      <span className={presentation.iconClass}>{presentation.label}</span>
    </span>
  );
}
