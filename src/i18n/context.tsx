import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import {
  DEFAULT_LOCALE,
  persistLocale,
  resolveInitialLocale,
  translate,
  type Locale,
  type TranslationKey,
} from "./index";
import type { TaskStatus } from "@/lib/task-contract";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  taskStatusLabel: (status: TaskStatus) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveInitialLocale());

  const value = useMemo<I18nContextValue>(() => {
    const setLocale = (next: Locale) => {
      persistLocale(next);
      setLocaleState(next);
    };

    return {
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
      taskStatusLabel: (status) =>
        translate(locale, `status.task.${status}` as TranslationKey) || status,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, params) => translate(DEFAULT_LOCALE, key, params),
      taskStatusLabel: (status) =>
        translate(DEFAULT_LOCALE, `status.task.${status}` as TranslationKey) || status,
    };
  }
  return context;
}
