import { createFileRoute } from "@tanstack/react-router";
import { ProjectsPage } from "@/components/site/pages/projects-page";

export const Route = createFileRoute("/_authenticated/app/projects/")({
  component: ProjectsPage,
  head: () => ({
    meta: [{ title: "Projects — BuildLoop" }],
  }),
});
