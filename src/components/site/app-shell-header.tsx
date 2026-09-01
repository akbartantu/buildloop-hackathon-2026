import { Link } from "@tanstack/react-router";
import { Bell, CircleHelp, Search } from "lucide-react";
import { BuildLoopLogo } from "@/components/site/buildloop-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useWorkspaceSession } from "@/hooks/use-workspace-session";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth-bypass";
import { useI18n } from "@/i18n/context";
import { LanguageSwitcher } from "@/i18n/language-switcher";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type AppShellHeaderProps = {
  showSearch?: boolean;
  showLogo?: boolean;
  onReplayTour?: () => void;
};

export function AppShellHeader({
  showSearch = true,
  showLogo = false,
  onReplayTour,
}: AppShellHeaderProps) {
  const { displayName, email, avatarUrl, handleSignOut } = useWorkspaceSession();
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
      {showLogo ? (
        <Link
          to="/app"
          className="shrink-0 rounded-md px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="BuildLoop home"
        >
          <BuildLoopLogo wordmarkClassName="text-[15px] text-foreground" />
        </Link>
      ) : null}

      {showSearch ? (
        <div className="relative mx-auto w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            readOnly
            placeholder={t("common.searchPlaceholder")}
            className="h-9 bg-muted/40 pl-9"
            aria-label={t("common.searchPlaceholder")}
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className={`flex items-center gap-2 ${showSearch ? "ml-auto" : "ml-auto shrink-0"}`}>
        <LanguageSwitcher />
        {isDevAuthBypassEnabled() ? (
          <span className="hidden rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300 sm:inline">
            {t("common.devBypass")}
          </span>
        ) : null}
        <Button variant="ghost" size="icon" className="size-8" disabled aria-label="Notifikasi">
          <Bell className="size-4" />
        </Button>
        {onReplayTour ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Bantuan">
                <CircleHelp className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onReplayTour}>{t("productTour.replay")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="ghost" size="icon" className="size-8" disabled aria-label="Bantuan">
            <CircleHelp className="size-4" />
          </Button>
        )}
        <Avatar className="size-8 border border-border">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <Button variant="outline" size="sm" onClick={handleSignOut} className="hidden sm:inline-flex">
          {t("nav.signOut")}
        </Button>
      </div>
    </header>
  );
}
