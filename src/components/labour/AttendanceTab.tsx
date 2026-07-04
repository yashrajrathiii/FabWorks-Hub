import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useLabourers } from "@/components/labour/WorkersTab";
import { toLocalDateString } from "@/lib/format";
import type { AttendanceRecord, AttendanceStatus, Labourer } from "@/types";
import { cn } from "@/lib/utils";

const statusOptions: { value: AttendanceStatus; label: string; activeClass: string }[] = [
  { value: "present", label: "Present", activeClass: "bg-success text-success-foreground border-success" },
  { value: "half_day", label: "Half day", activeClass: "bg-warning text-warning-foreground border-warning" },
  { value: "absent", label: "Absent", activeClass: "bg-destructive text-destructive-foreground border-destructive" },
];

const toDateString = toLocalDateString;

export default function AttendanceTab() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(toDateString(new Date()));
  const { data: workers = [], isLoading: workersLoading } = useLabourers(false);

  const monthStart = date.slice(0, 8) + "01";
  const { data: records = [] } = useQuery({
    queryKey: ["attendance", monthStart],
    queryFn: async () => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .gte("date", monthStart)
        .lte("date", monthStart.slice(0, 8) + "31");
      if (error) throw error;
      return data as AttendanceRecord[];
    },
  });

  const markMutation = useMutation({
    mutationFn: async ({ labourerId, status }: { labourerId: string; status: AttendanceStatus }) => {
      const { error } = await supabase
        .from("attendance")
        .upsert({ labourer_id: labourerId, date, status }, { onConflict: "labourer_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const todaysRecords = new Map(records.filter((r) => r.date === date).map((r) => [r.labourer_id, r]));

  function shiftDate(days: number) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    setDate(toDateString(d));
  }

  function countDays(rows: AttendanceRecord[]) {
    const present = rows.filter((r) => r.status === "present").length;
    const half = rows.filter((r) => r.status === "half_day").length;
    return present + half * 0.5;
  }

  /** Mon–Sun window containing the selected date (weekly workers are usually paid per week). */
  function weekRange() {
    const d = new Date(date + "T00:00:00");
    const day = (d.getDay() + 6) % 7; // 0 = Monday
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: toDateString(start), end: toDateString(end) };
  }

  function summaryFor(worker: Labourer) {
    const rows = records.filter((r) => r.labourer_id === worker.id);
    if (worker.pay_cycle === "monthly") {
      return `${countDays(rows)} days this month`;
    }
    const { start, end } = weekRange();
    const weekRows = rows.filter((r) => r.date >= start && r.date <= end);
    return `${countDays(weekRows)} days this week`;
  }

  const isToday = date === toDateString(new Date());

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDate(-1)} aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => shiftDate(1)}
            disabled={isToday}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={() => setDate(toDateString(new Date()))}>
              Today
            </Button>
          )}
          <p className="ml-auto text-xs text-muted-foreground">
            Marked {todaysRecords.size}/{workers.length}
          </p>
        </CardContent>
      </Card>

      {workersLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : workers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Add workers in the Workers tab first, then mark attendance here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {workers.map((worker) => {
            const record = todaysRecords.get(worker.id);
            return (
              <Card key={worker.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{worker.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="capitalize">{worker.skill ?? "—"}</span> · {summaryFor(worker)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => markMutation.mutate({ labourerId: worker.id, status: opt.value })}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:flex-none",
                          record?.status === opt.value
                            ? opt.activeClass
                            : "border-border bg-card text-muted-foreground hover:border-primary/40"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">This month at a glance</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Attendance is saved per worker per day — tap a status to mark or change it. Half-days count as
          0.5. Daily/weekly-paid workers show days for the current week (Mon–Sun); monthly-paid workers
          show days for the month.
        </CardContent>
      </Card>
    </div>
  );
}
