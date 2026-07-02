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

/** A single line in the quotation calculator (v1 logic — to be aligned with the owner's formulas). */
export interface QuoteItem {
  id: string;
  description: string;
  /** e.g. MS pipe, angle, channel, flat, sheet */
  material: string;
  quantity: number;
  /** total weight in kg for this line */
  weightKg: number;
  /** material rate ₹/kg */
  ratePerKg: number;
}

export interface QuoteData {
  items: QuoteItem[];
  labourCharge: number;
  transportCharge: number;
  otherCharge: number;
  marginPct: number;
  gstPct: number;
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
