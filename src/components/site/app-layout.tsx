import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckSquare,
  FolderKanban,
  Home,
  Puzzle,
  Play,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppShellHeader } from "@/components/site/app-shell-header";
import { BuildLoopLogo } from "@/components/site/buildloop-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useI18n } from "@/i18n/context";

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
  const { displayName, email, avatarUrl } = useWorkspaceSession();
  const { tasks } = useWorkspaceTasks();
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeNav = resolveActiveNav(pathname);
  const latestTask = tasks[0] ?? null;
  const hasRunEvidence = Boolean(latestTask?.runnerState?.runnerInvoked);
  const tour = useProductTourController(latestTask?.id ?? null, hasRunEvidence);

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border" data-testid="workspace-sidebar">
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
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={t("workspaceOverview.allWorkspaces")}>
                <Link to="/app" data-testid="sidebar-all-workspaces">
                  <ArrowLeft className="size-4" />
                  <span>{t("workspaceOverview.allWorkspaces")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="mt-2 flex items-center gap-3 rounded-md px-2 py-1.5">
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

      <SidebarInset className="min-h-svh bg-background" data-testid="workspace-app-layout">
        <AppShellHeader onReplayTour={() => tour.start({ replay: true })} />

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
