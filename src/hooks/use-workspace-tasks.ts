import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createTask, listTasks, lockContract, recordHumanApproval } from "@/lib/tasks.functions";
import { executeTaskRun } from "@/lib/orchestration.functions";
import type { HumanGateDecision, SensitiveApprovalAction } from "@/lib/human-approval";

export function useWorkspaceTasks() {
  const queryClient = useQueryClient();
  const fetchTasks = useServerFn(listTasks);
  const submitTask = useServerFn(createTask);
  const approveContract = useServerFn(lockContract);
  const runOrchestrator = useServerFn(executeTaskRun);
  const submitHumanApproval = useServerFn(recordHumanApproval);

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks(),
  });

  const createMutation = useMutation({
    mutationFn: (goal: string) => submitTask({ data: { goal } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const lockMutation = useMutation({
    mutationFn: (id: string) => approveContract({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => runOrchestrator({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const humanApprovalMutation = useMutation({
    mutationFn: (input: {
      id: string;
      decision: HumanGateDecision;
      action?: SensitiveApprovalAction;
      note?: string;
    }) =>
      submitHumanApproval({
        data: {
          id: input.id,
          decision: input.decision,
          action: input.action ?? "COMMIT",
          confirmedReview: true,
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  return {
    tasks: tasksQuery.data ?? [],
    isLoading: tasksQuery.isLoading,
    isError: tasksQuery.isError,
    createMutation,
    lockMutation,
    runMutation,
    humanApprovalMutation,
  };
}
