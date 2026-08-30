import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth-bypass";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { DemoWorkspaceLayout } from "@/components/site/demo-workspace-layout";
import { TaskDetailTabs } from "./task-detail-tabs";
import { createTask, listTasks, lockContract, recordHumanApproval } from "@/lib/tasks.functions";
import { executeTaskRun } from "@/lib/orchestration.functions";
import { formatTaskRef } from "@/lib/task-display";
import { MAX_ATTEMPTS, PROTECTED_PATHS, WORKSPACE_NAME } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";

type WorkspaceView = "workspace" | "form" | "detail";

export function AppShell() {
  const user = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const fetchTasks = useServerFn(listTasks);
  const submitTask = useServerFn(createTask);
  const approveContract = useServerFn(lockContract);
  const runOrchestrator = useServerFn(executeTaskRun);
  const submitHumanApproval = useServerFn(recordHumanApproval);

  const [view, setView] = useState<WorkspaceView>("workspace");
  const [taskGoal, setTaskGoal] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks(),
  });

  const tasks = tasksQuery.data ?? [];
  const activeTask = activeTaskId ? (tasks.find((t) => t.id === activeTaskId) ?? null) : null;
  const latestTask = tasks[0] ?? null;

  const createMutation = useMutation({
    mutationFn: (goal: string) => submitTask({ data: { goal } }),
    onSuccess: async (task) => {
      setActiveTaskId(task.id);
      setFormError(null);
      setView("detail");
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error: Error) => setFormError(error.message),
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
    mutationFn: (input: { id: string; decision: "APPROVE_COMMIT" | "REQUEST_REVISION" | "REJECT_CHANGES" | "ESCALATE_REVIEW" }) =>
      submitHumanApproval({
        data: {
          id: input.id,
          decision: input.decision,
          action: "COMMIT",
          confirmedReview: true,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const displayName =
    (user?.user_metadata?.["full_name"] as string | undefined) ||
    (user?.user_metadata?.["name"] as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Pengguna";
  const email = user?.email;
  const avatarUrl = user?.user_metadata?.["avatar_url"] as string | undefined;

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    if (!isDevAuthBypassEnabled()) {
      await supabase.auth.signOut();
    }
    navigate({ to: "/", replace: true });
  }

  return (
    <DemoWorkspaceLayout
      displayName={displayName}
      {...(email ? { email } : {})}
      {...(avatarUrl ? { avatarUrl } : {})}
      onSignOut={handleSignOut}
    >
      {view === "workspace" ? (
        <WorkspaceHome
          latestTask={latestTask}
          loading={tasksQuery.isLoading}
          onCreateTask={() => {
            setFormError(null);
            setView("form");
          }}
          onOpenTask={(id) => {
            setActiveTaskId(id);
            setView("detail");
          }}
        />
      ) : null}

      {view === "form" ? (
        <TaskForm
          taskGoal={taskGoal}
          error={formError}
          submitting={createMutation.isPending}
          onGoalChange={setTaskGoal}
          onCancel={() => setView("workspace")}
          onSubmit={() => createMutation.mutate(taskGoal)}
        />
      ) : null}

      {view === "detail" && activeTask ? (
        <TaskDetailTabs
          task={activeTask}
          approving={lockMutation.isPending}
          running={runMutation.isPending}
          submittingHumanApproval={humanApprovalMutation.isPending}
          error={
            (lockMutation.error ?? runMutation.error ?? humanApprovalMutation.error) instanceof Error
              ? (lockMutation.error ?? runMutation.error ?? humanApprovalMutation.error)?.message ?? null
              : null
          }
          onApprove={() => lockMutation.mutate(activeTask.id)}
          onRun={() => runMutation.mutate(activeTask.id)}
          onSubmitHumanApproval={(input) =>
            humanApprovalMutation.mutate({ id: activeTask.id, decision: input.decision })
          }
          onEdit={() => {
            setTaskGoal(activeTask.goal);
            setFormError(null);
            setView("form");
          }}
          onBack={() => setView("workspace")}
        />
      ) : null}
    </DemoWorkspaceLayout>
  );
}

function WorkspaceHome({
  latestTask,
  loading,
  onCreateTask,
  onOpenTask,
}: {
  latestTask: TaskRecord | null;
  loading: boolean;
  onCreateTask: () => void;
  onOpenTask: (id: string) => void;
}) {
  const checklist = [
    { label: "Akun aktif", done: true },
    { label: "Workspace demo siap", done: true },
    { label: "Task pertama dibuat", done: Boolean(latestTask) },
  ];

  return (
    <div className="space-y-6">
      <DemoPageHeader
        title="Workspace Anda siap"
        description="Buat task untuk mulai menjalankan orchestrator BuildLoop di sandbox terkontrol."
      />

      <DemoPanel>
        <ul className="space-y-3">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-3 text-sm">
              {item.done ? (
                <CheckCircle2 className="size-4 text-status-pass" aria-hidden="true" />
              ) : (
                <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
              )}
              <span className={item.done ? "text-foreground" : "text-muted-foreground"}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={onCreateTask}>Buat task baru</Button>
          {latestTask ? (
            <Button variant="outline" onClick={() => onOpenTask(latestTask.id)}>
              Buka task terakhir
            </Button>
          ) : null}
        </div>
      </DemoPanel>

      <DemoPanel title="Workspace demo">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Repository
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">{WORKSPACE_NAME}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Branch
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">main</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Safety status
            </p>
            <p className="mt-1 text-sm text-foreground">Protected</p>
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Task terakhir
          </p>
          {loading ? (
            <p className="mt-2 text-sm text-muted-foreground">Memuat…</p>
          ) : latestTask ? (
            <button
              type="button"
              onClick={() => onOpenTask(latestTask.id)}
              className="mt-3 block w-full rounded-lg border border-border bg-muted/20 p-4 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-foreground">
                  {latestTask.status}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatTaskRef(latestTask.id)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{latestTask.goal}</p>
            </button>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Belum ada task. Buat task pertama untuk melihat contract dan orchestration.
            </p>
          )}
        </div>

        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          BuildLoop tidak menjalankan tindakan sensitif tanpa contract dan approval yang eksplisit.
        </p>
      </DemoPanel>
    </div>
  );
}

function TaskForm({
  taskGoal,
  error,
  submitting,
  onGoalChange,
  onCancel,
  onSubmit,
}: {
  taskGoal: string;
  error: string | null;
  submitting: boolean;
  onGoalChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-6">
      <DemoPageHeader
        title="Definisikan batas task"
        description="Tulis goal yang jelas. BuildLoop akan membuat contract deterministik sebelum orchestrator dijalankan."
      />

      <DemoPanel title="Task baru">
        <div className="space-y-2">
          <Label htmlFor="task-goal">Apa yang perlu dikerjakan?</Label>
          <Textarea
            id="task-goal"
            value={taskGoal}
            onChange={(event) => onGoalChange(event.target.value)}
            placeholder="Contoh: Ubah teks penjelasan workspace agar lebih mudah dipahami pengguna awam."
            rows={4}
          />
          {error ? <p className="text-sm text-status-blocked">{error}</p> : null}
        </div>

        <dl className="mt-6 grid gap-x-8 gap-y-4 border-t border-border pt-5 sm:grid-cols-3">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Workspace
            </dt>
            <dd className="mt-1 font-mono text-sm text-foreground">{WORKSPACE_NAME}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Maks. percobaan koreksi
            </dt>
            <dd className="mt-1 text-sm text-foreground">{MAX_ATTEMPTS}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Protected paths
            </dt>
            <dd className="mt-1">
              <ul className="space-y-1">
                {PROTECTED_PATHS.map((path) => (
                  <li key={path} className="break-all font-mono text-xs text-foreground">
                    {path}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Batal
          </Button>
          <Button disabled={taskGoal.trim().length < 10 || submitting} onClick={onSubmit}>
            {submitting ? "Memeriksa…" : "Buat kontrak task"}
          </Button>
        </div>
      </DemoPanel>
    </div>
  );
}
