import { DemoKeyValueTable, DemoSectionLabel } from "@/components/site/demo-ui";
import {
  assertRuntimeDiagnosticsSafeForDisplay,
  buildRuntimeDiagnosticRows,
  type WorkerRuntimeDiagnostics,
} from "@/lib/runtime-diagnostics";
import { translate, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";

type RuntimeDiagnosticsPanelProps = {
  diagnostics: WorkerRuntimeDiagnostics;
  locale: Locale;
  prominent?: boolean;
};

export function RuntimeDiagnosticsPanel({
  diagnostics,
  locale,
  prominent = false,
}: RuntimeDiagnosticsPanelProps) {
  assertRuntimeDiagnosticsSafeForDisplay(diagnostics);
  const rows = buildRuntimeDiagnosticRows(diagnostics, locale);
  if (rows.length === 0) {
    return null;
  }

  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <div className={prominent ? "mt-4" : "mt-4 border-t border-border pt-4"}>
      <DemoSectionLabel>{t("runtimeDiagnostics.title")}</DemoSectionLabel>
      <div className={prominent ? "mt-3" : "mt-3"}>
        <DemoKeyValueTable
          rows={rows.map((row) => ({
            label: row.label,
            value: row.value,
          }))}
        />
      </div>
    </div>
  );
}

/** Whitelisted keys only — rejects unknown persisted fields. */
export function runtimeDiagnosticsDisplayKeys(
  diagnostics: WorkerRuntimeDiagnostics,
  locale: Locale,
): string[] {
  return buildRuntimeDiagnosticRows(diagnostics, locale).map((row) => row.key);
}
