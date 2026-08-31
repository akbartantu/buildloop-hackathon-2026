import { usePublicI18n } from "@/i18n/use-public-i18n";

type Allowed = { path: string; verdict: string; violation?: false };
type Violation = { path: string; verdict: string; violation: true };
type ActualChange = Allowed | Violation;

const approvedScopePaths = {
  inScope: ["src/routes/task.$id.tsx", "src/components/task-row.tsx"],
  protected: ["src/billing/**", ".github/workflows/**"],
};

const actualChangePaths: Array<{ path: string; violation: boolean }> = [
  { path: "src/routes/task.$id.tsx", violation: false },
  { path: "src/components/task-row.tsx", violation: false },
  { path: "src/billing/checkout.ts", violation: true },
  { path: "package.json", violation: true },
];

export function CheckPreview() {
  const { pt } = usePublicI18n();

  const actualChanges: ActualChange[] = actualChangePaths.map((change) => {
    if (change.violation) {
      return {
        path: change.path,
        violation: true,
        verdict:
          change.path === "package.json"
            ? pt("checkPreview.newDependency")
            : pt("checkPreview.outOfScope"),
      };
    }
    return {
      path: change.path,
      verdict: pt("checkPreview.allowed"),
    };
  });

  return (
    <figure className="mx-auto mb-8 max-w-5xl overflow-hidden rounded-lg border border-border bg-card sm:mb-10">
      <header className="border-b border-border p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {pt("checkPreview.reportLabel")}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-foreground">
              <span>BL-014</span>
              <span>Contract v2</span>
              <span>Commit 9f2c1ab</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="inline-flex w-fit items-center rounded-md border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {pt("checkPreview.illustrativeExample")}
            </span>
            <span className="font-mono text-2xl font-bold uppercase tracking-[0.06em] text-status-blocked">
              BLOCKED
            </span>
          </div>
        </div>
      </header>

      <div className="grid md:grid-cols-2">
        <div className="border-b border-border p-5 sm:p-6 md:border-b-0 md:border-r">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {pt("checkPreview.approvedBoundary")}
          </h3>

          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {pt("checkPreview.inScope")}
            </p>
            <ul className="mt-2 space-y-1.5">
              {approvedScopePaths.inScope.map((path) => (
                <li key={path} className="break-all font-mono text-xs text-foreground">
                  {path}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {pt("checkPreview.protected")}
            </p>
            <ul className="mt-2 space-y-1.5">
              {approvedScopePaths.protected.map((path) => (
                <li key={path} className="break-all font-mono text-xs text-foreground">
                  {path}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {pt("checkPreview.dependency")}
            </p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-foreground">
              {pt("checkPreview.dependencyRule")}
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {pt("checkPreview.actualChanges")}
          </h3>
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

      <figcaption className="border-t border-border p-5 sm:p-6">
        <p className="text-sm font-semibold text-foreground">{pt("checkPreview.summary")}</p>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          {pt("checkPreview.detail")}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled
            className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground opacity-60"
          >
            {pt("checkPreview.close")}
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-80"
          >
            {pt("checkPreview.revisionPrompt")}
          </button>
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {pt("checkPreview.disclaimer")}
        </p>
      </figcaption>
    </figure>
  );
}
