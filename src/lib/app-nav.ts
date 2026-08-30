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
  labelKey: `nav.${AppNavKey}` | "nav.productTour" | "nav.notifications" | "nav.profileSettings" | "nav.signOut";
  to?: string;
  comingSoon?: boolean;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { key: "home", labelKey: "nav.home", to: "/app" },
  { key: "projects", labelKey: "nav.projects", to: "/app/projects" },
  { key: "tasks", labelKey: "nav.tasks", to: "/app/tasks" },
  { key: "runs", labelKey: "nav.runs", to: "/app/runs" },
  { key: "approvals", labelKey: "nav.approvals", to: "/app/approvals" },
];

export const APP_SECONDARY_NAV_ITEMS: AppNavItem[] = [
  { key: "integrations", labelKey: "nav.integrations", to: "/app/integrations" },
  { key: "settings", labelKey: "nav.settings", to: "/app/settings" },
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
