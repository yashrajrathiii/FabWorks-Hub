-- Pipeline: add post-quote stages (existing: new_lead, contacted, quote_sent, client, lost).
-- 'client' is kept for old rows but no longer offered in the UI.
ALTER TYPE public.client_status ADD VALUE IF NOT EXISTS 'deal_closed';
ALTER TYPE public.client_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE public.client_status ADD VALUE IF NOT EXISTS 'completed';

-- CRM fields from the client's notes
ALTER TABLE public.clients
  ADD COLUMN company TEXT,
  ADD COLUMN whatsapp TEXT,
  ADD COLUMN work_type TEXT,
  ADD COLUMN estimated_value NUMERIC(12,2),
  ADD COLUMN follow_up_date DATE;

-- Labour pay cycle: attendance stays daily; wage is per cycle
CREATE TYPE public.pay_cycle AS ENUM ('daily', 'weekly', 'monthly');
ALTER TABLE public.labourers ADD COLUMN pay_cycle pay_cycle NOT NULL DEFAULT 'daily';

-- Deal / payment plan on quotations
ALTER TABLE public.quotations
  ADD COLUMN final_amount NUMERIC(12,2),                       -- negotiated price (null until deal closed)
  ADD COLUMN payment_plan JSONB NOT NULL DEFAULT '[]'::jsonb;  -- [{id, label, pct}]
