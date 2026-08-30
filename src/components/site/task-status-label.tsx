import type { TaskStatus } from "@/lib/task-contract";
import { useI18n } from "@/i18n/context";

export function TaskStatusLabel({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  const { taskStatusLabel } = useI18n();

  return (
    <span className={className}>
      {taskStatusLabel(status)}
    </span>
  );
}
