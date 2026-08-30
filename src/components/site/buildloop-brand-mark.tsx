import { cn } from "@/lib/utils";

type BuildLoopBrandMarkProps = {
  className?: string;
};

/** Compact BuildLoop brand mark using the committed favicon asset. */
export function BuildLoopBrandMark({ className }: BuildLoopBrandMarkProps) {
  return (
    <img
      src="/favicon.png"
      alt=""
      aria-hidden="true"
      width={20}
      height={20}
      className={cn("size-5 shrink-0 object-contain", className)}
    />
  );
}
