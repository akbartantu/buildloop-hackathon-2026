import type { TaskContract } from "@/lib/task-contract";
import { translate, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";

export type ContractGovernanceRow = {
  key: "protectedPaths" | "requiredChecks" | "allowedActions";
  label: string;
  value: string;
};

type GovernanceValueKey =
  | "typecheck"
  | "relevantTest"
  | "protectedPathCheck"
  | "readProjectFiles"
  | "editInScope"
  | "updateRelevantTests"
  | "runAllowlistChecks";

const GOVERNANCE_VALUE_ALIASES: Record<string, GovernanceValueKey> = {
  typecheck: "typecheck",
  "test yang relevan": "relevantTest",
  "relevant test": "relevantTest",
  "relevant tests": "relevantTest",
  "protected-path check": "protectedPathCheck",
  "protected path check": "protectedPathCheck",
  "membaca file project": "readProjectFiles",
  "read project files": "readProjectFiles",
  "mengedit kode aplikasi di dalam approved scope": "editInScope",
  "edit application code within approved scope": "editInScope",
  "menambah atau memperbarui test yang relevan": "updateRelevantTests",
  "add or update relevant tests": "updateRelevantTests",
  "menjalankan check dari allowlist": "runAllowlistChecks",
  "run checks from the allowlist": "runAllowlistChecks",
};

function t(locale: Locale, key: TranslationKey): string {
  const translated = translate(locale, key);
  return translated === key ? key : translated;
}

function resolveGovernanceValueKey(value: string): GovernanceValueKey | null {
  const normalized = value.trim().toLowerCase();
  return GOVERNANCE_VALUE_ALIASES[normalized] ?? null;
}

/** Human-facing contract governance labels for UI rendering. */
export function formatContractGovernanceLabel(
  key: ContractGovernanceRow["key"],
  locale: Locale = DEFAULT_LOCALE,
): string {
  return t(locale, `taskDetail.contractGovernance.labels.${key}`);
}

/** Localize known governance descriptions; keep paths, globs, and commands literal. */
export function formatContractGovernanceDisplayValue(
  value: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const mappedKey = resolveGovernanceValueKey(trimmed);
  if (mappedKey) {
    return t(locale, `taskDetail.contractGovernance.values.${mappedKey}`);
  }

  if (isTechnicalLiteral(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

function isTechnicalLiteral(value: string): boolean {
  if (/^[./]|^\*|\*\*|package\.json|bun\.lock|\.env|\/|\\/.test(value)) {
    return true;
  }
  if (/^(bun|npm|pnpm|yarn)\s+/i.test(value)) {
    return true;
  }
  return false;
}

export function formatContractGovernanceValues(
  values: string[],
  locale: Locale = DEFAULT_LOCALE,
  separator = ", ",
): string {
  return values.map((value) => formatContractGovernanceDisplayValue(value, locale)).join(separator);
}

export function buildContractGovernanceRows(
  contract: TaskContract,
  locale: Locale = DEFAULT_LOCALE,
): ContractGovernanceRow[] {
  return [
    {
      key: "protectedPaths",
      label: formatContractGovernanceLabel("protectedPaths", locale),
      value: contract.protectedPaths.join(", "),
    },
    {
      key: "requiredChecks",
      label: formatContractGovernanceLabel("requiredChecks", locale),
      value: formatContractGovernanceValues(contract.requiredChecks, locale, ", "),
    },
    {
      key: "allowedActions",
      label: formatContractGovernanceLabel("allowedActions", locale),
      value: formatContractGovernanceValues(contract.allowedActions, locale, "; "),
    },
  ];
}
