type Allowed = { path: string; verdict: string; violation?: false };
type Violation = { path: string; verdict: string; violation: true };
type ActualChange = Allowed | Violation;

const approvedScope = {
  inScope: ["src/routes/task.$id.tsx", "src/components/task-row.tsx"],
  protected: ["src/billing/**", ".github/workflows/**"],
  dependency: "Tidak boleh menambah dependency",
};

const actualChanges: ActualChange[] = [
  { path: "src/routes/task.$id.tsx", verdict: "DIIZINKAN" },
  { path: "src/components/task-row.tsx", verdict: "DIIZINKAN" },
  { path: "src/billing/checkout.ts", verdict: "DI LUAR BATAS", violation: true },
  { path: "package.json", verdict: "DEPENDENCY BARU", violation: true },
];

/** Perbandingan ilustratif: batas disetujui vs perubahan aktual → BLOCKED. */
export function CheckPreview() {
  return (
    <figure className="mx-auto mb-8 max-w-5xl overflow-hidden rounded-lg border border-border bg-card sm:mb-10">
      {/* Header */}
      <header className="border-b border-border p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Check Report
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-foreground">
              <span>BL-014</span>
              <span>Contract v2</span>
              <span>Commit 9f2c1ab</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="inline-flex w-fit items-center rounded-md border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Contoh ilustratif
            </span>
            <span className="font-mono text-2xl font-bold uppercase tracking-[0.06em] text-status-blocked">
              BLOCKED
            </span>
          </div>
        </div>
      </header>

      {/* Comparison */}
      <div className="grid md:grid-cols-2">
        {/* Left column: approved boundary */}
        <div className="border-b border-border p-5 sm:p-6 md:border-b-0 md:border-r">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Batas yang disetujui
          </h3>

          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              In Scope
            </p>
            <ul className="mt-2 space-y-1.5">
              {approvedScope.inScope.map((path) => (
                <li key={path} className="break-all font-mono text-xs text-foreground">
                  {path}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Protected
            </p>
            <ul className="mt-2 space-y-1.5">
              {approvedScope.protected.map((path) => (
                <li key={path} className="break-all font-mono text-xs text-foreground">
                  {path}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Dependency
            </p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-foreground">
              {approvedScope.dependency}
            </p>
          </div>
        </div>

        {/* Right column: actual changes */}
        <div className="p-5 sm:p-6">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Perubahan aktual</h3>
          <ul className="mt-5 space-y-2">
            {actualChanges.map((change) => {
              const blocked = change.violation;
              return (
                <li
                  key={change.path}
                  className={
                    "flex flex-col gap-0.5 border-l-2 py-1 pl-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 " +
                    (blocked ? "border-l-boundary" : "border-l-transparent")
                  }
                >
                  <span className="break-all font-mono text-xs text-foreground">{change.path}</span>
                  <span
                    className={
                      "shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.12em] " +
                      (blocked ? "text-status-blocked" : "text-muted-foreground")
                    }
                  >
                    {change.verdict}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Decision strip */}
      <figcaption className="border-t border-border p-5 sm:p-6">
        <p className="text-sm font-semibold text-foreground">
          2 perubahan melewati batas yang disetujui.
        </p>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          BuildLoop menahan Close sampai pelanggaran diperbaiki atau dieskalasikan untuk keputusan
          manusia.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled
            className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground opacity-60"
          >
            Close
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-80"
          >
            Buat Revision Prompt
          </button>
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Contoh ilustratif — tombol ini tidak menjalankan aksi
        </p>
      </figcaption>
    </figure>
  );
}
