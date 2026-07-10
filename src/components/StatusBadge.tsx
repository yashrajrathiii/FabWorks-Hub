import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* Soft tinted chips tuned for the Horizon light theme. */
const styles: Record<string, string> = {
  // Client pipeline
  new_lead: "bg-sky-100 text-sky-700 hover:bg-sky-100",
  contacted: "bg-violet-100 text-violet-700 hover:bg-violet-100",
  quote_sent: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  deal_closed: "bg-teal-100 text-teal-700 hover:bg-teal-100",
  client: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  lost: "bg-slate-100 text-slate-600 hover:bg-slate-100",
  // Quotes
  draft: "bg-slate-100 text-slate-600 hover:bg-slate-100",
  sent: "bg-sky-100 text-sky-700 hover:bg-sky-100",
  accepted: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  rejected: "bg-red-100 text-red-700 hover:bg-red-100",
  // Tasks
  pending: "bg-slate-100 text-slate-600 hover:bg-slate-100",
  in_progress: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  completed: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  // Attendance
  present: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  half_day: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  absent: "bg-red-100 text-red-700 hover:bg-red-100",
};

const labels: Record<string, string> = {
  new_lead: "New lead",
  contacted: "Contacted",
  quote_sent: "Quote sent",
  deal_closed: "Deal closed",
  client: "Client",
  lost: "Lost",
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  present: "Present",
  half_day: "Half day",
  absent: "Absent",
};

export default function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("border-0 font-medium", styles[status], className)}>
      {labels[status] ?? status}
    </Badge>
  );
}
