import { en, type TranslationKey, type TranslationTree } from "./en";
import { id } from "./id";

export const DEFAULT_LOCALE = "en" as const;
export const LOCALE_STORAGE_KEY = "buildloop.locale";

export type Locale = "en" | "id";

const catalogs: Record<Locale, TranslationTree> = {
  en: en as TranslationTree,
  id,
};

function getNestedValue(tree: Record<string, unknown>, key: string): string | undefined {
  const parts = key.split(".");
  let current: unknown = tree;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function resolveInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "id" ? "id" : DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const localized = getNestedValue(catalogs[locale] as unknown as Record<string, unknown>, key);
  const fallback = getNestedValue(en as unknown as Record<string, unknown>, key);
  const template = localized ?? fallback ?? key;

  if (!params) {
    return template;
  }

  return Object.entries(params).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    template,
  );
}

export { en, id };
export type { TranslationKey };
