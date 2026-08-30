import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
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
import { BuildLoopBrandMark } from "@/components/site/buildloop-brand-mark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { isDevAuthBypassEnabled } from "@/lib/dev-auth-bypass";
import { WORKSPACE_NAME } from "@/lib/task-contract";
import { cn } from "@/lib/utils";

type DemoNavKey = "home" | "tasks" | "runs" | "approvals";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function DemoWorkspaceLayout({
  children,
  activeNav = "tasks",
  displayName,
  email,
  avatarUrl,
  onSignOut,
}: {
  children: ReactNode;
  activeNav?: DemoNavKey;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  onSignOut: () => void;
}) {
  const navItems: Array<{
    key: DemoNavKey | "projects";
    label: string;
    icon: typeof Home;
    disabled?: boolean;
  }> = [
    { key: "home", label: "Home", icon: Home },
    { key: "projects", label: "Projects", icon: FolderKanban, disabled: true },
    { key: "tasks", label: "Tasks", icon: CheckSquare },
    { key: "runs", label: "Runs", icon: Play, disabled: true },
    { key: "approvals", label: "Approvals", icon: ShieldCheck, disabled: true },
  ];

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
          <div className="rounded-md border border-sidebar-border bg-background px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Workspace
            </p>
            <p className="mt-1 truncate text-sm font-medium text-foreground">{WORKSPACE_NAME}</p>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={activeNav === item.key}
                      disabled={item.disabled}
                      className={cn(item.disabled && "opacity-50")}
                      tooltip={item.disabled ? "Belum tersedia di demo" : item.label}
                    >
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator className="mx-3" />

          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton disabled tooltip="Belum tersedia di demo">
                    <Puzzle className="size-4" />
                    <span>Integrations</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton disabled tooltip="Belum tersedia di demo">
                    <Settings className="size-4" />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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
            <Button variant="ghost" size="icon" className="size-8" disabled aria-label="Bantuan">
              <CircleHelp className="size-4" />
            </Button>
            <Avatar className="size-8 border border-border">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm" onClick={onSignOut} className="hidden sm:inline-flex">
              Keluar
            </Button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
