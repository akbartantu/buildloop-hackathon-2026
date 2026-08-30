import { createFileRoute } from "@tanstack/react-router";
import { TasksPage } from "@/components/site/pages/tasks-page";

export const Route = createFileRoute("/_authenticated/app/tasks/")({
  component: TasksPage,
  head: () => ({
    meta: [{ title: "Tasks — BuildLoop" }],
  }),
});
