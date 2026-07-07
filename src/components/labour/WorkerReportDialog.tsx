import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { AttendanceRecord, AttendanceStatus, Labourer } from "@/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const statusClasses: Record<AttendanceStatus, string> = {
  present: "bg-success/20 text-success",
  half_day: "bg-warning/20 text-warning",
  absent: "bg-destructive/20 text-destructive",
};

const pad = (n: number) => String(n).padStart(2, "0");

export default function WorkerReportDialog({
  worker,
  onClose,
}: {
  worker: Labourer | null;
  onClose: () => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based

  const monthKey = `${year}-${pad(month + 1)}`;
  const { data: records = [], isLoading } = useQuery({
    queryKey: ["attendance-report", worker?.id, monthKey],
    enabled: !!worker && isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("labourer_id", worker!.id)
        .gte("date", `${monthKey}-01`)
        .lte("date", `${monthKey}-31`);
      if (error) throw error;
      return data as AttendanceRecord[];
    },
  });

  const byDate = new Map(records.map((r) => [r.date, r.status]));

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const present = records.filter((r) => r.status === "present").length;
  const half = records.filter((r) => r.status === "half_day").length;
  const absent = records.filter((r) => r.status === "absent").length;

  return (
    <Dialog open={!!worker} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{worker?.name}</DialogTitle>
          <DialogDescription className="capitalize">
            {worker?.skill ?? "—"} · attendance report
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-semibold">
            {MONTHS[month]} {year}
          </p>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => shiftMonth(1)}
            disabled={isCurrentMonth}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((d) => (
              <p key={d} className="py-1 text-xs font-medium text-muted-foreground">
                {d}
              </p>
            ))}
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${monthKey}-${pad(day)}`;
              const status = byDate.get(dateStr);
              const isFuture = dateStr > todayStr;
              return (
                <div key={day} className="flex justify-center">
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-sm",
                      status
                        ? cn("font-semibold", statusClasses[status])
                        : isFuture
                          ? "text-muted-foreground/30"
                          : "text-muted-foreground",
                      dateStr === todayStr && "ring-1 ring-primary"
                    )}
                  >
                    {day}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-success" /> Present {present}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-warning" /> Half day {half}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Absent {absent}
          </span>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          View only — mark or change attendance from the Attendance tab.
        </p>
      </DialogContent>
    </Dialog>
  );
}
