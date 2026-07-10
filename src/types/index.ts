export type AppRole = "admin" | "pending";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  created_at?: string;
}

export type ClientStatus =
  | "new_lead"
  | "contacted"
  | "quote_sent"
  | "deal_closed"
  | "in_progress"
  | "completed"
  | "lost"
  /** legacy status from v1 rows — no longer offered in forms */
  | "client";

export interface Client {
  id: string;
  name: string;
  company: string | null;
  contact_person: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  status: ClientStatus;
  source: string | null;
  work_type: string | null;
  estimated_value: number | null;
  follow_up_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type PayCycle = "daily" | "weekly" | "monthly";

export interface Labourer {
  id: string;
  name: string;
  phone: string | null;
  skill: string | null;
  /** wage per pay cycle (₹/day, ₹/week or ₹/month) */
  daily_wage: number;
  pay_cycle: PayCycle;
  joining_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export type AttendanceStatus = "present" | "absent" | "half_day";

export interface AttendanceRecord {
  id: string;
  labourer_id: string;
  date: string;
  status: AttendanceStatus;
  overtime_hours: number;
  note: string | null;
  /** Last time the status was marked/changed (the marking upsert refreshes it). */
  created_at: string;
}

export type TaskPeriod = "daily" | "weekly" | "monthly";
export type TaskStatus = "pending" | "in_progress" | "completed";

export interface WorkerTask {
  id: string;
  labourer_id: string;
  /** optional link to the client/project this task is for (added 2026-07-07) */
  client_id?: string | null;
  title: string;
  description: string | null;
  period: TaskPeriod;
  start_date: string;
  due_date: string | null;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected";

export type MemberShape = "box" | "sqbar" | "rndbar" | "flat" | "angle" | "manual";

/** One fabrication member in the material take-off (ported from the owner's v1 calculator). */
export interface QuotePart {
  id: string;
  name: string;
  shape: MemberShape;
  /** material density in kg/m³ (7850 = mild steel, 7200 = cast iron, 8000 = SS, 8960 = copper) */
  density: number;
  /** len in metres; w/h/t/side/dia/leg in mm; kg for manual; cc (mm) + span (m) for repeating members */
  dims: {
    len?: number;
    w?: number;
    h?: number;
    t?: number;
    side?: number;
    dia?: number;
    leg?: number;
    kg?: number;
    cc?: number;
    span?: number;
  };
  qty: number;
}

export interface ServiceLine {
  id: string;
  label: string;
  amount: number;
}

export interface QuoteData {
  parts: QuotePart[];
  /** supplier rate ₹/kg (today's) */
  ratePerKg: number;
  /** labour intensity multiplier: 1 / 1.5 / 2 / 2.5 */
  complexity: number;
  marginPct: number;
  fittings: number;
  delivery: number;
  services: ServiceLine[];
  gstPct: number;
  /** monthly costs → per-kg overhead */
  overhead: {
    labourPerMonth: number;
    elecPerMonth: number;
    throughputKg: number;
  };
}

/** One installment of the negotiated payment plan, e.g. "Advance" @ 50%. */
export interface PaymentInstallment {
  id: string;
  label: string;
  pct: number;
  /** fixed ₹ amount — overrides pct; used for custom recorded payments (partial receipts) */
  amount?: number;
  /** ticked once the money is actually collected (tracked on the client page) */
  received?: boolean;
}

export interface Quotation {
  id: string;
  quote_number: number;
  client_id: string | null;
  client_name: string;
  project_title: string;
  data: QuoteData;
  subtotal: number;
  gst_pct: number;
  total: number;
  /** final negotiated price — null until the deal is closed */
  final_amount: number | null;
  payment_plan: PaymentInstallment[];
  status: QuoteStatus;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
