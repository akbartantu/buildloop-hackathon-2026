-- Spec Kit and related multi-file specification sets for workspace planning

CREATE TABLE IF NOT EXISTS public.project_specification_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  document_type text NOT NULL DEFAULT 'Spec Kit',
  parse_status text NOT NULL DEFAULT 'ready',
  summary text,
  requirement_count integer,
  constraint_count integer,
  flow_count integer,
  file_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_specification_sets_document_type_check CHECK (
    document_type IN ('PRD', 'FRD', 'BRD', 'Architecture', 'API Spec', 'ADR', 'Spec Kit', 'Other')
  ),
  CONSTRAINT project_specification_sets_parse_status_check CHECK (
    parse_status IN ('pending', 'ready', 'failed', 'unsupported')
  )
);

CREATE TABLE IF NOT EXISTS public.project_specification_set_files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  set_id uuid NOT NULL REFERENCES public.project_specification_sets(id) ON DELETE CASCADE,
  filename text NOT NULL,
  relative_path text NOT NULL,
  file_role text NOT NULL DEFAULT 'other',
  sort_order integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  parse_status text NOT NULL DEFAULT 'ready',
  summary text,
  requirement_count integer,
  constraint_count integer,
  flow_count integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_specification_set_files_role_check CHECK (
    file_role IN ('constitution', 'spec', 'plan', 'tasks', 'other')
  ),
  CONSTRAINT project_specification_set_files_parse_status_check CHECK (
    parse_status IN ('pending', 'ready', 'failed', 'unsupported')
  ),
  CONSTRAINT project_specification_set_files_relative_path_unique UNIQUE (set_id, relative_path)
);

CREATE INDEX IF NOT EXISTS project_specification_sets_project_id_idx
  ON public.project_specification_sets (project_id);

CREATE INDEX IF NOT EXISTS project_specification_set_files_set_id_idx
  ON public.project_specification_set_files (set_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_specification_sets TO authenticated;
GRANT ALL ON public.project_specification_sets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_specification_set_files TO authenticated;
GRANT ALL ON public.project_specification_set_files TO service_role;

ALTER TABLE public.project_specification_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_specification_set_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their project specification sets" ON public.project_specification_sets;
CREATE POLICY "Users can view their project specification sets"
  ON public.project_specification_sets FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create their project specification sets" ON public.project_specification_sets;
CREATE POLICY "Users can create their project specification sets"
  ON public.project_specification_sets FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their project specification sets" ON public.project_specification_sets;
CREATE POLICY "Users can update their project specification sets"
  ON public.project_specification_sets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their project specification sets" ON public.project_specification_sets;
CREATE POLICY "Users can delete their project specification sets"
  ON public.project_specification_sets FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their specification set files" ON public.project_specification_set_files;
CREATE POLICY "Users can view their specification set files"
  ON public.project_specification_set_files FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_specification_sets s
      WHERE s.id = set_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create their specification set files" ON public.project_specification_set_files;
CREATE POLICY "Users can create their specification set files"
  ON public.project_specification_set_files FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_specification_sets s
      WHERE s.id = set_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their specification set files" ON public.project_specification_set_files;
CREATE POLICY "Users can update their specification set files"
  ON public.project_specification_set_files FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_specification_sets s
      WHERE s.id = set_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_specification_sets s
      WHERE s.id = set_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their specification set files" ON public.project_specification_set_files;
CREATE POLICY "Users can delete their specification set files"
  ON public.project_specification_set_files FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_specification_sets s
      WHERE s.id = set_id AND s.user_id = auth.uid()
    )
  );

CREATE TRIGGER update_project_specification_sets_updated_at
  BEFORE UPDATE ON public.project_specification_sets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_specification_set_files_updated_at
  BEFORE UPDATE ON public.project_specification_set_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
