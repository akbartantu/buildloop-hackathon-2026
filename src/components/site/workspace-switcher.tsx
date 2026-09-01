import { Link } from "@tanstack/react-router";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/hooks/use-projects";
import { useI18n } from "@/i18n/context";
import { isProjectRepositoryConnected, projectDisplayName } from "@/lib/projects/project-record";
import { WORKSPACE_NAME } from "@/lib/task-contract";

export function WorkspaceSwitcher() {
  const { projects, activeProject, setSelectedProjectId, isHydrated } = useProjects();
  const { t } = useI18n();

  const label = activeProject
    ? isProjectRepositoryConnected(activeProject)
      ? projectDisplayName(activeProject)
      : activeProject.name
    : WORKSPACE_NAME;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-auto w-full justify-between px-3 py-2 text-left font-normal"
          disabled={!isHydrated}
          data-tour="workspace-switcher"
        >
          <span className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {t("workspace.label")}
            </span>
            <span className="mt-1 block truncate text-sm font-medium text-foreground">{label}</span>
          </span>
          <ChevronDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuLabel>{t("projects.title")}</DropdownMenuLabel>
        {projects.length === 0 ? (
          <DropdownMenuItem disabled>{t("workspace.switcherEmpty")}</DropdownMenuItem>
        ) : (
          projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              data-testid={`workspace-option-${project.id}`}
              onClick={() => setSelectedProjectId(project.id)}
              className={project.id === activeProject?.id ? "bg-muted/60" : undefined}
            >
              {projectDisplayName(project)}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app" className="flex items-center gap-2">
            {t("workspaceOverview.allWorkspaces")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/projects" search={{ create: "1" }} className="flex items-center gap-2">
            <Plus className="size-4" />
            {t("projects.createWorkspace")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
