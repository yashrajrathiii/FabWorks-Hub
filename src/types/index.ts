export type AppRole = "admin" | "pending";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
}

export type ClientStatus = "new_lead" | "contacted" | "quote_sent" | "client" | "lost";

export interface Client {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  status: ClientStatus;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Labourer {
  id: string;
  name: string;
  phone: string | null;
  skill: string | null;
  daily_wage: number;
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
}

export type TaskPeriod = "daily" | "weekly" | "monthly";
export type TaskStatus = "pending" | "in_progress" | "completed";

export interface WorkerTask {
  id: string;
  labourer_id: string;
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
  status: QuoteStatus;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
