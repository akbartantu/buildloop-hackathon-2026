import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TaskDetailPage } from "@/components/site/pages/task-detail-page";
import type { DemoTab } from "@/lib/task-display";

const taskDetailSearchSchema = z.object({
  tab: z
    .enum(["overview", "contract", "orchestration", "evidence", "approval"])
    .optional(),
});

export const Route = createFileRoute("/_authenticated/app/_workspace/tasks/$taskId")({
  validateSearch: (search) => taskDetailSearchSchema.parse(search),
  component: TaskDetailRoute,
  head: () => ({
    meta: [{ title: "Task detail — BuildLoop" }],
  }),
});

function TaskDetailRoute() {
  const { taskId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <TaskDetailPage taskId={taskId} {...(tab ? { initialTab: tab as DemoTab } : {})} />;
}
