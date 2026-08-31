import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listTasks } from "@/lib/tasks.functions";
import type { TaskRecord } from "@/lib/tasks-schema";
import { shouldPollTaskStatus, TASK_RUN_POLL_INTERVAL_MS } from "@/lib/lifecycle-progress";
import { useProjects } from "@/hooks/use-projects";
import { workspaceTasksQueryKey } from "@/hooks/use-workspace-tasks";

/** Read-only polling of persisted task state while a run is active. */
export function useTaskRunPolling(task: TaskRecord | null) {
  const { activeProject } = useProjects();
  const projectScope = activeProject?.id ?? null;
  const fetchTasks = useServerFn(listTasks);
  const shouldPoll = task ? shouldPollTaskStatus(task.status) : false;

  useQuery({
    queryKey: workspaceTasksQueryKey(projectScope),
    queryFn: () => fetchTasks({ data: { projectId: projectScope } }),
    enabled: Boolean(task) && shouldPoll,
    refetchInterval: shouldPoll ? TASK_RUN_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
  });
}
