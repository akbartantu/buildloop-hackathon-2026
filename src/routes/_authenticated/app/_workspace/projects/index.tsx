import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ProjectsPage } from "@/components/site/pages/projects-page";

const projectsSearchSchema = z.object({
  create: z.literal("1").optional(),
});

export const Route = createFileRoute("/_authenticated/app/_workspace/projects/")({
  component: ProjectsPage,
  validateSearch: (search) => projectsSearchSchema.parse(search),
  head: () => ({
    meta: [{ title: "Projects — BuildLoop" }],
  }),
});
