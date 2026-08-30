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
import { BuildLoopBrandMark } from "@/components/site/buildloop-brand-mark";
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
import { useWorkspaceLabel } from "@/hooks/use-workspace-label";
import { ProductTour, useProductTourController } from "@/components/site/product-tour";
import {
  APP_NAV_ITEMS,
  APP_SECONDARY_NAV_ITEMS,
  resolveActiveNav,
  type AppNavItem,
} from "@/lib/app-nav";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth-bypass";

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
  const Icon = NAV_ICONS[item.key];

  if (item.comingSoon) {
    return (
      <SidebarMenuButton
        disabled
        className="opacity-50"
        tooltip={`${item.label} — coming soon`}
      >
        <Icon className="size-4" />
        <span>{item.label}</span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Soon
        </span>
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
      <Link to={item.to} data-tour={`nav-${item.key}`}>
        <Icon className="size-4" />
        <span>{item.label}</span>
      </Link>
    </SidebarMenuButton>
  );
}

export function AppLayout() {
  const { displayName, email, avatarUrl, handleSignOut } = useWorkspaceSession();
  const { tasks } = useWorkspaceTasks();
  const { label: workspaceLabel } = useWorkspaceLabel();
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
            className="flex items-center gap-2 rounded-md px-1 py-0.5 text-[15px] font-semibold tracking-[-0.01em] text-sidebar-foreground"
          >
            <BuildLoopBrandMark />
            <span>BuildLoop</span>
          </Link>
          <div className="rounded-md border border-sidebar-border bg-background px-3 py-2" data-tour="workspace">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Workspace
            </p>
            <p className="mt-1 truncate text-sm font-medium text-foreground">{workspaceLabel}</p>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {APP_NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <NavLink item={item} isActive={activeNav === item.key} />
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
                    <NavLink item={item} isActive={activeNav === item.key} />
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
              placeholder="Cari project, task, atau run"
              className="h-9 bg-muted/40 pl-9"
              aria-label="Cari project, task, atau run"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isDevAuthBypassEnabled() ? (
              <span className="hidden rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300 sm:inline">
                DEV AUTH BYPASS
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
                  Replay product tour
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
              Keluar
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
