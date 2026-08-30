import { StatusMark } from "./status-pill";

type Entry = { path: string; outside?: boolean };

const entries: Entry[] = [
  { path: "src/routes/task.$id.tsx" },
  { path: "src/components/task-row.tsx" },
  { path: "src/lib/check-report.ts" },
  { path: "src/billing/checkout.ts", outside: true },
  { path: ".github/workflows/deploy.yml", outside: true },
];

/**
 * Visual ilustratif: daftar path relatif terhadap satu garis batas merah.
 * Path yang melewati garis berada di luar approved scope.
 */
export function ScopeBoundary() {
  return (
    <div className="relative">
      <div className="flex items-baseline justify-between gap-4 pb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
          Approved scope
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Contoh ilustratif
        </p>
      </div>

      <div className="relative border-t border-border pt-4">
        {/* Garis batas: kiri = di dalam scope, kanan = melewati batas. */}
        <div className="relative pl-4">
          <span aria-hidden="true" className="absolute left-0 top-0 h-full w-px bg-boundary" />
          <p className="absolute -top-0.5 left-0 hidden -translate-x-[calc(100%+8px)] rotate-180 font-mono text-[9px] uppercase tracking-[0.18em] text-boundary [writing-mode:vertical-rl] lg:block">
            Boundary
          </p>

          <ul className="space-y-2.5">
            {entries.map((e) => (
              <li key={e.path} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className={
                    "font-mono text-[11px] " +
                    (e.outside ? "ml-4 text-foreground" : "text-muted-foreground")
                  }
                >
                  {e.path}
                </span>
                {e.outside ? <StatusMark status="BLOCKED" /> : null}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-5 border-t border-border pt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Garis merah = batas scope yang disetujui. Perubahan yang melewatinya ditandai BLOCKED.
        </p>
      </div>
    </div>
  );
}
