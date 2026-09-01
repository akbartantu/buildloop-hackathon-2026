import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CheckSquare,
  CircleHelp,
  FolderKanban,
  Home,
  Puzzle,
  Search,
  Settings,
  ShieldCheck,
  Play,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useWorkspaceSession } from "@/hooks/use-workspace-session";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { WorkspaceSwitcher } from "@/components/site/workspace-switcher";
import { ProductTour, useProductTourController } from "@/components/site/product-tour";
import {
  APP_NAV_ITEMS,
  APP_SECONDARY_NAV_ITEMS,
  resolveActiveNav,
  type AppNavItem,
} from "@/lib/app-nav";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth-bypass";
import { useI18n } from "@/i18n/context";
import { LanguageSwitcher } from "@/i18n/language-switcher";

const NAV_ICONS: Record<AppNavItem["key"], LucideIcon> = {
  home: Home,
  projects: FolderKanban,
  tasks: CheckSquare,
  runs: Play,
  approvals: ShieldCheck,
  integrations: Puzzle,
  settings: Settings,
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function NavLink({ item, isActive }: { item: AppNavItem; isActive: boolean }) {
  const { t } = useI18n();
  const Icon = NAV_ICONS[item.key];
  const label = t(item.labelKey);

  if (item.comingSoon) {
    return (
      <SidebarMenuButton
        disabled
        className="opacity-50"
        tooltip={`${label} — ${t("common.soon").toLowerCase()}`}
      >
        <Icon className="size-4" />
        <span>{label}</span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {t("common.soon")}
        </span>
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
      <Link to={item.to!} data-tour={`nav-${item.key}`}>
        <Icon className="size-4" />
        <span>{label}</span>
      </Link>
    </SidebarMenuButton>
  );
}

export function AppLayout() {
  return <AppLayoutContent />;
}

function AppLayoutContent() {
  const { displayName, email, avatarUrl, handleSignOut } = useWorkspaceSession();
  const { tasks } = useWorkspaceTasks();
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeNav = resolveActiveNav(pathname);
  const latestTask = tasks[0] ?? null;
  const hasRunEvidence = Boolean(latestTask?.runnerState?.runnerInvoked);
  const tour = useProductTourController(latestTask?.id ?? null, hasRunEvidence);

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="gap-3 p-4">
          <Link
            to="/app"
            className="rounded-md px-1 py-0.5 text-[15px] text-sidebar-foreground"
          >
            <BuildLoopLogo wordmarkClassName="text-[15px] text-sidebar-foreground" />
          </Link>
          <WorkspaceSwitcher />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {APP_NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <NavLink item={item} isActive={activeNav !== null && activeNav === item.key} />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator className="mx-3" />

          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {APP_SECONDARY_NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <NavLink item={item} isActive={activeNav !== null && activeNav === item.key} />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-1.5">
            <Avatar className="size-8 border border-border">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
              {email ? (
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              ) : null}
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-svh bg-background">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
          <div className="relative mx-auto w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              readOnly
              placeholder={t("common.searchPlaceholder")}
              className="h-9 bg-muted/40 pl-9"
              aria-label={t("common.searchPlaceholder")}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            {isDevAuthBypassEnabled() ? (
              <span className="hidden rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300 sm:inline">
                {t("common.devBypass")}
              </span>
            ) : null}
            <Button variant="ghost" size="icon" className="size-8" disabled aria-label="Notifikasi">
              <Bell className="size-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Bantuan">
                  <CircleHelp className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => tour.start({ replay: true })}>
                  {t("productTour.replay")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8" data-tour="main-content">
          <Outlet />
        </div>
      </SidebarInset>

      <ProductTour
        active={tour.isActive}
        stepIndex={tour.stepIndex}
        latestTaskId={latestTask?.id ?? null}
        hasRunEvidence={hasRunEvidence}
        onClose={tour.close}
        onStepChange={tour.setStepIndex}
      />
    </SidebarProvider>
  );
}
