-- Workspace-level specification documents for task planning context

CREATE TABLE IF NOT EXISTS public.project_specifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  filename text NOT NULL,
  original_path text,
  document_type text NOT NULL,
  content text NOT NULL,
  parse_status text NOT NULL DEFAULT 'ready',
  summary text,
  requirement_count integer,
  constraint_count integer,
  flow_count integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  parsed_at timestamp with time zone,
  CONSTRAINT project_specifications_document_type_check CHECK (
    document_type IN ('PRD', 'FRD', 'BRD', 'Architecture', 'API Spec', 'ADR', 'Spec Kit', 'Other')
  ),
  CONSTRAINT project_specifications_parse_status_check CHECK (
    parse_status IN ('pending', 'ready', 'failed', 'unsupported')
  )
);

CREATE INDEX IF NOT EXISTS project_specifications_project_id_idx
  ON public.project_specifications (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_specifications TO authenticated;
GRANT ALL ON public.project_specifications TO service_role;

ALTER TABLE public.project_specifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their project specifications" ON public.project_specifications;
CREATE POLICY "Users can view their project specifications"
  ON public.project_specifications FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create their project specifications" ON public.project_specifications;
CREATE POLICY "Users can create their project specifications"
  ON public.project_specifications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their project specifications" ON public.project_specifications;
CREATE POLICY "Users can update their project specifications"
  ON public.project_specifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their project specifications" ON public.project_specifications;
CREATE POLICY "Users can delete their project specifications"
  ON public.project_specifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_project_specifications_updated_at
  BEFORE UPDATE ON public.project_specifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
