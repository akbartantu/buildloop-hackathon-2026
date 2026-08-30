import { cn } from "@/lib/utils";

export const lifecycle = [
  {
    step: "Define",
    text: "Tulis Build Contract: goal, scope, protected areas, acceptance criteria.",
  },
  {
    step: "Approve",
    text: "Manusia menyetujui contract. Contract yang disetujui menjadi read-only.",
  },
  {
    step: "Build",
    text: "AI mengerjakan perubahan di repository seperti biasa, di luar BuildLoop.",
  },
  {
    step: "Check",
    text: "Perubahan aktual dibaca dari repository dan diikat pada satu commit SHA.",
  },
  {
    step: "Decide",
    text: "Manusia memilih Revise, Escalate, atau Close berdasarkan evidence.",
  },
];

/** Rail ringkas: hanya nama tahap, dipakai di bawah copy hero. */
export function LifecycleRailCompact({ className }: { className?: string }) {
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

/** Rail bertahap dengan deskripsi, dipakai pada seksi Core loop. */
export function LifecycleRailDetailed({ className }: { className?: string }) {
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
