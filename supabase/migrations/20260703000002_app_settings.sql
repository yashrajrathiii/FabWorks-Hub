-- App-wide settings (single row): overhead numbers used by the quotation calculator.
CREATE TABLE public.app_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  labour_per_month NUMERIC(12,2) NOT NULL DEFAULT 250000,
  elec_per_month NUMERIC(12,2) NOT NULL DEFAULT 20000,
  throughput_kg NUMERIC(12,2) NOT NULL DEFAULT 4000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage settings"
ON public.app_settings FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.app_settings (id) VALUES (1);

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
