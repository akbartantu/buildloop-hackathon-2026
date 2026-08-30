import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      {eyebrow ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
