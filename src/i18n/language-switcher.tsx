import { cn } from "@/lib/utils";
import { useI18n } from "./context";
import type { Locale } from "./index";

const OPTIONS: Array<{ locale: Locale; shortLabel: string }> = [
  { locale: "en", shortLabel: "EN" },
  { locale: "id", shortLabel: "ID" },
];

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-background p-0.5 font-mono text-[10px] uppercase tracking-[0.14em]",
        className,
      )}
      aria-label={t("language.switchLabel")}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.locale}
          type="button"
          onClick={() => setLocale(option.locale)}
          className={cn(
            "rounded px-2 py-1 transition-colors",
            locale === option.locale
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={locale === option.locale}
        >
          {option.shortLabel}
        </button>
      ))}
    </div>
  );
}
