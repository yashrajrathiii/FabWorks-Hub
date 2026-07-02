-- FabWorks Hub — initial schema
-- Only approved admins (business owners) can use the app. Labourers are records, not users.

-- ===== PROFILES & ROLES =====
CREATE TYPE public.app_role AS ENUM ('admin', 'pending');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role app_role NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Security definer helper so RLS policies can check roles without recursion
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'admin');
$$;

CREATE POLICY "Users read own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR public.is_admin(auth.uid()));

CREATE POLICY "Users update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- Auto-create profile on signup; the very first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin')
         THEN 'admin'::public.app_role
         ELSE 'pending'::public.app_role
    END
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== CLIENTS & LEADS (one table, pipeline status) =====
CREATE TYPE public.client_status AS ENUM ('new_lead', 'contacted', 'quote_sent', 'client', 'lost');

CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  status client_status NOT NULL DEFAULT 'new_lead',
  source TEXT,               -- referral / walk-in / phone / online / other
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage clients"
ON public.clients FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== LABOURERS =====
CREATE TABLE public.labourers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  skill TEXT,                -- welder / fitter / helper / painter / other
  daily_wage NUMERIC(10,2) NOT NULL DEFAULT 0,
  joining_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.labourers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage labourers"
ON public.labourers FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_labourers_updated_at
BEFORE UPDATE ON public.labourers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== ATTENDANCE (one row per labourer per day) =====
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'half_day');

CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labourer_id UUID NOT NULL REFERENCES public.labourers(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status attendance_status NOT NULL DEFAULT 'present',
  overtime_hours NUMERIC(4,1) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (labourer_id, date)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage attendance"
ON public.attendance FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_attendance_date ON public.attendance (date);
CREATE INDEX idx_attendance_labourer ON public.attendance (labourer_id, date DESC);

-- ===== WORKER TASKS (weekly / monthly assignments) =====
CREATE TYPE public.task_period AS ENUM ('daily', 'weekly', 'monthly');
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed');

CREATE TABLE public.worker_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labourer_id UUID NOT NULL REFERENCES public.labourers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  period task_period NOT NULL DEFAULT 'weekly',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status task_status NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.worker_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage worker tasks"
ON public.worker_tasks FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_worker_tasks_labourer ON public.worker_tasks (labourer_id, status);

CREATE TRIGGER update_worker_tasks_updated_at
BEFORE UPDATE ON public.worker_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== QUOTATIONS =====
-- Calculator inputs live in `data` (jsonb) so the quote formula can evolve
-- without schema changes; totals are denormalised for lists and dashboards.
CREATE TYPE public.quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected');

CREATE TABLE public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number SERIAL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL DEFAULT '',
  project_title TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_pct NUMERIC(5,2) NOT NULL DEFAULT 18,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status quote_status NOT NULL DEFAULT 'draft',
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage quotations"
ON public.quotations FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_quotations_client ON public.quotations (client_id);

CREATE TRIGGER update_quotations_updated_at
BEFORE UPDATE ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
