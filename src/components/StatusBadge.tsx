import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  // Client pipeline
  new_lead: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  contacted: "bg-violet-100 text-violet-800 hover:bg-violet-100",
  quote_sent: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  client: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  lost: "bg-zinc-100 text-zinc-600 hover:bg-zinc-100",
  // Quotes
  draft: "bg-zinc-100 text-zinc-700 hover:bg-zinc-100",
  sent: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  accepted: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  rejected: "bg-red-100 text-red-700 hover:bg-red-100",
  // Tasks
  pending: "bg-zinc-100 text-zinc-700 hover:bg-zinc-100",
  in_progress: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  completed: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  // Attendance
  present: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  half_day: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  absent: "bg-red-100 text-red-700 hover:bg-red-100",
};

const labels: Record<string, string> = {
  new_lead: "New lead",
  contacted: "Contacted",
  quote_sent: "Quote sent",
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
