import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TaskFormPage } from "@/components/site/pages/task-form-page";

const newTaskSearchSchema = z.object({
  from: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/app/_workspace/tasks/new")({
  validateSearch: (search) => newTaskSearchSchema.parse(search),
  component: NewTaskRoute,
  head: () => ({
    meta: [{ title: "Task baru — BuildLoop" }],
  }),
});

function NewTaskRoute() {
  const { from } = Route.useSearch();
  return <TaskFormPage {...(from ? { fromTaskId: from } : {})} />;
}
