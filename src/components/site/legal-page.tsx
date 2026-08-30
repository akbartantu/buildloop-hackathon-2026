import type { ReactNode } from "react";

export function LegalPage({
  title,
  intro,
  draft = false,
  updatedNote,
  children,
}: {
  title: string;
  intro: string;
  draft?: boolean;
  updatedNote?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <div className="relative mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {draft ? (
            <span className="rounded-lg border border-border px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
              Draft
            </span>
          ) : null}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{intro}</p>
        {updatedNote ? (
          <p className="mt-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            {updatedNote}
          </p>
        ) : null}
        <div className="mt-10 space-y-8">{children}</div>
      </div>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-6">
      <h2 className="text-base font-semibold text-foreground">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
