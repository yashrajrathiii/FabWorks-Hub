import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import { Plus, Loader2, CheckCircle2, PlayCircle, Trash2 } from "lucide-react";
import { useLabourers } from "@/components/labour/WorkersTab";
import { formatDate, toLocalDateString } from "@/lib/format";
import type { Labourer, TaskPeriod, TaskStatus, WorkerTask } from "@/types";
import { cn } from "@/lib/utils";

type TaskWithWorker = WorkerTask & { labourers: Pick<Labourer, "name"> | null };

const emptyForm = {
  labourer_id: "",
  title: "",
  description: "",
  period: "weekly" as TaskPeriod,
  start_date: toLocalDateString(),
  due_date: "",
};

const filters: { value: TaskStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

export default function TasksTab() {
  const queryClient = useQueryClient();
  const { data: workers = [] } = useLabourers(false);
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["worker_tasks"],
    queryFn: async () => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase
        .from("worker_tasks")
        .select("*, labourers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TaskWithWorker[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) => {
      const { error } = await supabase.from("worker_tasks").insert({
        labourer_id: payload.labourer_id,
        title: payload.title,
        description: payload.description || null,
        period: payload.period,
        start_date: payload.start_date,
        due_date: payload.due_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker_tasks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Task assigned");
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase
        .from("worker_tasks")
        .update({ status, completed_at: status === "completed" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker_tasks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("worker_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker_tasks"] });
      toast.success("Task deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(
    () => tasks.filter((t) => filter === "all" || t.status === filter),
    [tasks, filter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2" disabled={workers.length === 0}>
          <Plus className="h-4 w-4" /> Assign task
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {workers.length === 0
              ? "Add workers first, then assign them weekly or monthly tasks."
              : "No tasks here yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <Card key={task.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{task.title}</p>
                    <StatusBadge status={task.status} />
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {task.period}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {task.labourers?.name ?? "Unassigned"} · {formatDate(task.start_date)}
                    {task.due_date ? ` → ${formatDate(task.due_date)}` : ""}
                  </p>
                  {task.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {task.status === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => statusMutation.mutate({ id: task.id, status: "in_progress" })}
                    >
                      <PlayCircle className="h-3.5 w-3.5" /> Start
                    </Button>
                  )}
                  {task.status !== "completed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-success hover:text-success"
                      onClick={() => statusMutation.mutate({ id: task.id, status: "completed" })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Done
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(task.id)}
                    aria-label="Delete task"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign task</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.labourer_id) {
                toast.error("Choose a worker");
                return;
              }
              addMutation.mutate(form);
            }}
          >
            <div className="space-y-1.5">
              <Label>Worker *</Label>
              <Select value={form.labourer_id} onValueChange={(v) => setForm({ ...form, labourer_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose worker" />
                </SelectTrigger>
                <SelectContent>
                  {workers.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-title">Task *</Label>
              <Input
                id="t-title"
                required
                placeholder="e.g. Fabricate main gate frame"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-desc">Details</Label>
              <Textarea
                id="t-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Repeat</Label>
                <Select value={form.period} onValueChange={(v) => setForm({ ...form, period: v as TaskPeriod })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-start">Start</Label>
                <Input
                  id="t-start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-due">Due</Label>
                <Input
                  id="t-due"
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={addMutation.isPending}>
                {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Assign
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
