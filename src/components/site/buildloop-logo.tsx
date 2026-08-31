import { cn } from "@/lib/utils";

import { BuildLoopBrandMark } from "@/components/site/buildloop-brand-mark";

type BuildLoopLogoProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
};

/** Canonical BuildLoop logo lockup (mark + optional wordmark). */
export function BuildLoopLogo({
  className,
  markClassName,
  wordmarkClassName,
  showWordmark = true,
}: BuildLoopLogoProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      {markClassName ? <BuildLoopBrandMark className={markClassName} /> : <BuildLoopBrandMark />}
      {showWordmark ? (
        <span className={cn("truncate font-semibold tracking-[-0.01em]", wordmarkClassName)}>
          BuildLoop
        </span>
      ) : null}
    </span>
  );
}
