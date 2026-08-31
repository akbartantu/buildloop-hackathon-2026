-- Soft disconnect for workspaces: preserve repository identity and audit history.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS disconnected_at timestamp with time zone;
