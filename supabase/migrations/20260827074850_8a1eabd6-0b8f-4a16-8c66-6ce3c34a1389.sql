CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  workspace text NOT NULL,
  goal text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  contract jsonb NOT NULL DEFAULT '{}'::jsonb,
  blocked_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  runner_state jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  locked_at timestamp with time zone
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks"
  ON public.tasks FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.task_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  status text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (task_id, attempt_no)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_attempts TO authenticated;
GRANT ALL ON public.task_attempts TO service_role;

ALTER TABLE public.task_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attempts of their own tasks"
  ON public.task_attempts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()
  ));

CREATE POLICY "Users can create attempts on their own tasks"
  ON public.task_attempts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()
  ));

CREATE POLICY "Users can update attempts of their own tasks"
  ON public.task_attempts FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()
  ));

CREATE TABLE public.task_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  decision text NOT NULL,
  actor_user_id uuid NOT NULL,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.task_approvals TO authenticated;
GRANT ALL ON public.task_approvals TO service_role;

ALTER TABLE public.task_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view approvals of their own tasks"
  ON public.task_approvals FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()
  ));

CREATE POLICY "Users can create approvals on their own tasks"
  ON public.task_approvals FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = actor_user_id
    AND EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_task_attempts_updated_at
  BEFORE UPDATE ON public.task_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX tasks_user_id_created_at_idx ON public.tasks (user_id, created_at DESC);
CREATE INDEX task_attempts_task_id_idx ON public.task_attempts (task_id);
CREATE INDEX task_approvals_task_id_idx ON public.task_approvals (task_id);