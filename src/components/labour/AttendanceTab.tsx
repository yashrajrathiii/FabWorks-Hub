import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useLabourers } from "@/components/labour/WorkersTab";
import WorkerReportDialog from "@/components/labour/WorkerReportDialog";
import { toLocalDateString } from "@/lib/format";
import type { AttendanceRecord, AttendanceStatus, Labourer } from "@/types";
import { cn } from "@/lib/utils";

const statusOptions: { value: AttendanceStatus; label: string; activeClass: string }[] = [
  { value: "present", label: "Present", activeClass: "bg-success text-success-foreground border-success" },
  { value: "half_day", label: "Half day", activeClass: "bg-warning text-warning-foreground border-warning" },
  { value: "absent", label: "Absent", activeClass: "bg-destructive text-destructive-foreground border-destructive" },
];

const toDateString = toLocalDateString;

const formatMarkedTime = (iso: string) =>
  new Date(iso)
    .toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })
    .toUpperCase();

export default function AttendanceTab() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(toDateString(new Date()));
  const [reportWorker, setReportWorker] = useState<Labourer | null>(null);
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
        .upsert(
          // created_at doubles as "marked at" — refreshed on every (re-)mark
          { labourer_id: labourerId, date, status, created_at: new Date().toISOString() },
          { onConflict: "labourer_id,date" }
        );
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

  const isToday = date === toDateString(new Date());

  return (
    <div className="space-y-4 md:space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 md:gap-3 p-3 md:p-5">
          <Button variant="outline" size="icon" className="h-9 w-9 md:h-11 md:w-11" onClick={() => shiftDate(-1)} aria-label="Previous day">
            <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40 md:w-52 md:h-11 md:text-base" />
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 md:h-11 md:w-11"
            onClick={() => shiftDate(1)}
            disabled={isToday}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" className="md:h-11 md:text-sm md:px-4" onClick={() => setDate(toDateString(new Date()))}>
              Today
            </Button>
          )}
          <p className="ml-auto text-xs md:text-sm text-muted-foreground">
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
          <CardContent className="py-16 text-center text-sm md:text-base text-muted-foreground">
            Add workers in the Workers tab first, then mark attendance here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 md:space-y-3">
          {workers.map((worker) => {
            const record = todaysRecords.get(worker.id);
            return (
              <Card
                key={worker.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer transition-colors hover:border-primary/40"
                onClick={() => setReportWorker(worker)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setReportWorker(worker);
                  }
                }}
              >
                <CardContent className="flex flex-col gap-3 p-4 md:p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-left">
                    <p className="truncate font-medium md:text-lg md:font-semibold">{worker.name}</p>
                    <p className="flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground">
                      <span className="capitalize">{worker.skill ?? "—"}</span>
                      {record && record.status !== "absent" && (
                        <>
                          <span
                            className={cn(
                              "h-2 w-2 md:h-2.5 md:w-2.5 rounded-full",
                              record.status === "present" ? "bg-success" : "bg-warning"
                            )}
                          />
                          <span>{formatMarkedTime(record.created_at)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2 md:gap-3">
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={(e) => {
                          e.stopPropagation();
                          markMutation.mutate({ labourerId: worker.id, status: opt.value });
                        }}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 md:px-5 md:py-2.5 text-xs md:text-sm font-medium transition-colors sm:flex-none md:h-11",
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
        <CardHeader className="pb-2 md:pb-3 md:pt-4">
          <CardTitle className="text-sm md:text-base">How this works</CardTitle>
        </CardHeader>
        <CardContent className="text-xs md:text-sm text-muted-foreground">
          Attendance is saved per worker per day — tap a status to mark or change it. Tap anywhere on
          a worker's card to see their month-by-month attendance report.
        </CardContent>
      </Card>

      <WorkerReportDialog key={reportWorker?.id ?? "none"} worker={reportWorker} onClose={() => setReportWorker(null)} />
    </div>
  );
}
