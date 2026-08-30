export type AppNavKey =
  | "home"
  | "projects"
  | "tasks"
  | "runs"
  | "approvals"
  | "integrations"
  | "settings";

export type AppNavItem = {
  key: AppNavKey;
  label: string;
  to: string;
  comingSoon?: boolean;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { key: "home", label: "Home", to: "/app" },
  { key: "projects", label: "Projects", to: "/app/projects" },
  { key: "tasks", label: "Tasks", to: "/app/tasks" },
  { key: "runs", label: "Runs", to: "/app/runs" },
  { key: "approvals", label: "Approvals", to: "/app/approvals" },
];

export const APP_SECONDARY_NAV_ITEMS: AppNavItem[] = [
  { key: "integrations", label: "Integrations", to: "/app/integrations" },
  { key: "settings", label: "Settings", to: "/app/settings" },
];

export function resolveActiveNav(pathname: string): AppNavKey {
  if (pathname.startsWith("/app/projects")) return "projects";
  if (pathname.startsWith("/app/tasks")) return "tasks";
  if (pathname.startsWith("/app/runs")) return "runs";
  if (pathname.startsWith("/app/approvals")) return "approvals";
  if (pathname.startsWith("/app/integrations")) return "integrations";
  if (pathname.startsWith("/app/settings")) return "settings";
  return "home";
}
