import { cn } from "@/lib/utils";
import { usePublicI18n } from "@/i18n/use-public-i18n";

function useLifecycleSteps() {
  const { pt } = usePublicI18n();
  return [
    { step: pt("lifecycle.define"), text: pt("lifecycle.defineText") },
    { step: pt("lifecycle.approve"), text: pt("lifecycle.approveText") },
    { step: pt("lifecycle.build"), text: pt("lifecycle.buildText") },
    { step: pt("lifecycle.check"), text: pt("lifecycle.checkText") },
    { step: pt("lifecycle.decide"), text: pt("lifecycle.decideText") },
  ];
}

export function LifecycleRailCompact({ className }: { className?: string }) {
  const lifecycle = useLifecycleSteps();

  return (
    <ol className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0", className)}>
      {lifecycle.map((item, i) => (
        <li key={item.step} className="flex items-center gap-3 sm:flex-1 sm:gap-0">
          <span className="flex items-center gap-2 sm:gap-2">
            <span aria-hidden="true" className="size-1.5 shrink-0 bg-foreground/60" />
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
              {item.step}
            </span>
          </span>
          {i < lifecycle.length - 1 ? (
            <span
              aria-hidden="true"
              className="ml-[3px] h-6 w-px bg-border sm:mx-3 sm:h-px sm:flex-1"
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function LifecycleRailDetailed({ className }: { className?: string }) {
  const lifecycle = useLifecycleSteps();

  return (
    <ol className={cn("relative", className)}>
      {lifecycle.map((item, i) => (
        <li
          key={item.step}
          className="relative grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 border-t border-border py-6 last:border-b"
        >
          <div className="relative flex flex-col items-center">
            <span className="font-mono text-[11px] text-muted-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span aria-hidden="true" className="mt-2 size-1.5 bg-foreground" />
            <span aria-hidden="true" className="mt-2 w-px flex-1 bg-border" />
          </div>
          <div className="pb-1">
            <h3 className="font-mono text-sm uppercase tracking-[0.14em] text-foreground">
              {item.step}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {item.text}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
