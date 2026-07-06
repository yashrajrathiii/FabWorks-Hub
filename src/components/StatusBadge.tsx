import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* Translucent chips tuned for the dark navy theme. */
const styles: Record<string, string> = {
  // Client pipeline
  new_lead: "bg-sky-500/15 text-sky-400 hover:bg-sky-500/15",
  contacted: "bg-violet-500/15 text-violet-400 hover:bg-violet-500/15",
  quote_sent: "bg-amber-500/15 text-amber-400 hover:bg-amber-500/15",
  deal_closed: "bg-teal-500/15 text-teal-400 hover:bg-teal-500/15",
  client: "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15",
  lost: "bg-white/10 text-slate-400 hover:bg-white/10",
  // Quotes
  draft: "bg-white/10 text-slate-300 hover:bg-white/10",
  sent: "bg-sky-500/15 text-sky-400 hover:bg-sky-500/15",
  accepted: "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15",
  rejected: "bg-red-500/15 text-red-400 hover:bg-red-500/15",
  // Tasks
  pending: "bg-white/10 text-slate-300 hover:bg-white/10",
  in_progress: "bg-amber-500/15 text-amber-400 hover:bg-amber-500/15",
  completed: "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15",
  // Attendance
  present: "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15",
  half_day: "bg-amber-500/15 text-amber-400 hover:bg-amber-500/15",
  absent: "bg-red-500/15 text-red-400 hover:bg-red-500/15",
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
