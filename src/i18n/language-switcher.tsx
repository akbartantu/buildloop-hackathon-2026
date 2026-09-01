import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useI18n } from "./context";
import type { Locale } from "./index";

const OPTIONS: Array<{ locale: Locale; shortLabel: string; labelKey: "language.english" | "language.indonesian" }> = [
  { locale: "en", shortLabel: "EN", labelKey: "language.english" },
  { locale: "id", shortLabel: "ID", labelKey: "language.indonesian" },
];

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const active = OPTIONS.find((option) => option.locale === locale) ?? OPTIONS[0]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em]",
            className,
          )}
          aria-label={t("language.switchLabel")}
        >
          <span aria-hidden="true">{active.shortLabel}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.locale}
            onClick={() => setLocale(option.locale)}
            aria-current={locale === option.locale ? "true" : undefined}
            className={locale === option.locale ? "bg-muted/60" : undefined}
          >
            {t(option.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
