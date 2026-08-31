import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createTask, listTasks, lockContract, recordHumanApproval, refreshContract, respondToProtectedPathApproval, reviseTask, updateDraftTask } from "@/lib/tasks.functions";
import { executeTaskRun } from "@/lib/orchestration.functions";
import type { HumanGateDecision, SensitiveApprovalAction } from "@/lib/human-approval";
import { useProjects } from "@/hooks/use-projects";
import { shouldPollTaskStatus, TASK_RUN_POLL_INTERVAL_MS } from "@/lib/lifecycle-progress";

export function workspaceTasksQueryKey(projectScope: string | null) {
  return ["tasks", projectScope] as const;
}

export function isWorkspaceTasksLoading(input: {
  projectScope: string | null;
  committedScope: string | null;
  isPending: boolean;
  isFetching: boolean;
  hasData: boolean;
}): boolean {
  if (input.projectScope !== input.committedScope) {
    return true;
  }
  if (input.isPending) {
    return true;
  }
  return input.isFetching && !input.hasData;
}

export function useWorkspaceTasks() {
  const queryClient = useQueryClient();
  const { activeProject } = useProjects();
  const projectScope = activeProject?.id ?? null;
  const [committedScope, setCommittedScope] = useState<string | null>(projectScope);
  const fetchTasks = useServerFn(listTasks);
  const submitTask = useServerFn(createTask);
  const approveContract = useServerFn(lockContract);
  const runOrchestrator = useServerFn(executeTaskRun);
  const submitHumanApproval = useServerFn(recordHumanApproval);
  const refreshContractFn = useServerFn(refreshContract);
  const reviseTaskFn = useServerFn(reviseTask);
  const updateDraftTaskFn = useServerFn(updateDraftTask);
  const protectedPathApprovalFn = useServerFn(respondToProtectedPathApproval);

  const tasksQuery = useQuery({
    queryKey: workspaceTasksQueryKey(projectScope),
    enabled: projectScope !== null,
    queryFn: () => fetchTasks({ data: { projectId: projectScope } }),
    refetchInterval: (query) => {
      const list = query.state.data ?? [];
      return list.some((entry) => shouldPollTaskStatus(entry.status))
        ? TASK_RUN_POLL_INTERVAL_MS
        : false;
    },
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!tasksQuery.isFetching && tasksQuery.fetchStatus === "idle") {
      setCommittedScope(projectScope);
    }
  }, [projectScope, tasksQuery.isFetching, tasksQuery.fetchStatus]);

  const isLoading = isWorkspaceTasksLoading({
    projectScope,
    committedScope,
    isPending: tasksQuery.isPending,
    isFetching: tasksQuery.isFetching,
    hasData: tasksQuery.data !== undefined,
  });

  const createMutation = useMutation({
    mutationFn: (input: string | { goal: string; workspace?: string; projectId?: string; acceptanceCriteria?: string[] }) => {
      const payload = typeof input === "string" ? { goal: input } : input;
      return submitTask({
        data: {
          ...payload,
          ...(activeProject?.id && !payload.projectId ? { projectId: activeProject.id } : {}),
        },
      });
    },
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
    mutationFn: (id: string) =>
      runOrchestrator({
        data: {
          id,
          activeProjectId: projectScope,
        },
      }),
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
      reviewType?: import("@/lib/human-approval").AdditionalReviewType;
      confirmedReview?: boolean;
    }) => {
      const payload: {
        id: string;
        decision: HumanGateDecision;
        action: SensitiveApprovalAction;
        note?: string;
        reviewType?: import("@/lib/human-approval").AdditionalReviewType;
        confirmedReview?: boolean;
      } = {
        id: input.id,
        decision: input.decision,
        action: input.action ?? "COMMIT",
      };
      if (input.note !== undefined) {
        payload.note = input.note;
      }
      if (input.reviewType !== undefined) {
        payload.reviewType = input.reviewType;
      }
      if (input.decision === "APPROVE_COMMIT") {
        payload.confirmedReview = input.confirmedReview ?? true;
      }
      return submitHumanApproval({ data: payload });
    },
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["authorized-delivery", input.id] });
    },
  });

  const refreshContractMutation = useMutation({
    mutationFn: (id: string) => refreshContractFn({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const reviseTaskMutation = useMutation({
    mutationFn: (input: { id: string; goal?: string; acceptanceCriteria?: string[] }) =>
      reviseTaskFn({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const updateDraftTaskMutation = useMutation({
    mutationFn: (input: {
      id: string;
      goal: string;
      acceptanceCriteria?: string[];
      clarificationAnswer?: string;
    }) => updateDraftTaskFn({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const protectedPathApprovalMutation = useMutation({
    mutationFn: async (input: { id: string; decision: "APPROVE" | "REJECT"; note?: string }) => {
      const result = await protectedPathApprovalFn({ data: input });
      if (result.resumeOrchestration && !result.idempotent) {
        await runOrchestrator({
          data: {
            id: input.id,
            activeProjectId: projectScope,
          },
        });
      }
      return result.task;
    },
    onSuccess: async (_task, input) => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["authorized-delivery", input.id] });
    },
  });

  return {
    tasks: isLoading ? [] : (tasksQuery.data ?? []),
    projectScope,
    isLoading,
    isFetching: tasksQuery.isFetching,
    isError: tasksQuery.isError,
    createMutation,
    lockMutation,
    runMutation,
    humanApprovalMutation,
    refreshContractMutation,
    reviseTaskMutation,
    updateDraftTaskMutation,
    protectedPathApprovalMutation,
  };
}
