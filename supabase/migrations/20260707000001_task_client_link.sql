-- Link worker tasks to a client/project so the client detail page can show them.
ALTER TABLE public.worker_tasks
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_worker_tasks_client ON public.worker_tasks (client_id);
