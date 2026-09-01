import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useProjects } from "@/hooks/use-projects";
import { useI18n } from "@/i18n/context";

type WorkspaceShellGuardProps = {
  children: ReactNode;
};

export function WorkspaceShellGuard({ children }: WorkspaceShellGuardProps) {
  const { projects, isHydrated } = useProjects();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { t } = useI18n();
  const isProjectsRoute = pathname.startsWith("/app/projects");

  useEffect(() => {
    if (!isHydrated || projects.length > 0 || isProjectsRoute) {
      return;
    }
    navigate({ to: "/app", replace: true });
  }, [isHydrated, isProjectsRoute, navigate, projects.length]);

  if (!isHydrated) {
    return <p className="p-6 text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (projects.length === 0 && !isProjectsRoute) {
    return null;
  }

  return children;
}
