import { useState } from "react";
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
import { toast } from "sonner";
import { Plus, Loader2, CheckCircle2, Trash2 } from "lucide-react";
import { useLabourers } from "@/components/labour/WorkersTab";
import { formatDate, toLocalDateString } from "@/lib/format";
import type { Client, Labourer, WorkerTask } from "@/types";
import { cn } from "@/lib/utils";

type TaskWithWorker = WorkerTask & {
  labourers: Pick<Labourer, "name"> | null;
  clients?: Pick<Client, "name"> | null;
};

const emptyForm = {
  labourer_id: "",
  client_id: "",
  title: "",
  description: "",
  start_date: toLocalDateString(),
  due_date: "",
};

type TaskFilter = "all" | "in_progress" | "completed";

const filters: { value: TaskFilter; label: string }[] = [
  { value: "all", label: "All tasks" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

export default function TasksTab() {
  const queryClient = useQueryClient();
  const { data: workers = [] } = useLabourers(false);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["worker_tasks"],
    queryFn: async () => {
      if (!isSupabaseConfigured) return [];
      // clients(name) join needs the client_id migration; fall back if it isn't run yet
      let res = await supabase
        .from("worker_tasks")
        .select("*, labourers(name), clients(name)")
        .order("created_at", { ascending: false });
      if (res.error) {
        res = await supabase
          .from("worker_tasks")
          .select("*, labourers(name)")
          .order("created_at", { ascending: false });
      }
      if (res.error) throw res.error;
      return res.data as TaskWithWorker[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-for-tasks"],
    queryFn: async () => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data as Pick<Client, "id" | "name">[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) => {
      const { error } = await supabase.from("worker_tasks").insert({
        labourer_id: payload.labourer_id,
        title: payload.title,
        description: payload.description || null,
        start_date: payload.start_date,
        due_date: payload.due_date || null,
        status: "in_progress",
        // only send client_id when chosen so inserts keep working pre-migration
        ...(payload.client_id ? { client_id: payload.client_id } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker_tasks"] });
      queryClient.invalidateQueries({ queryKey: ["client-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Task assigned");
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("worker_tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker_tasks"] });
      queryClient.invalidateQueries({ queryKey: ["client-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Task completed");
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
      queryClient.invalidateQueries({ queryKey: ["client-tasks"] });
      toast.success("Task deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Anything not completed counts as in progress — tasks start the moment they're assigned.
  const inProgress = tasks.filter((t) => t.status !== "completed");
  const completed = tasks.filter((t) => t.status === "completed");

  function taskCard(task: TaskWithWorker) {
    const isDone = task.status === "completed";
    return (
      <Card key={task.id} className={isDone ? "opacity-70" : undefined}>
        <CardContent className="flex flex-col gap-3 p-4 md:p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium md:text-base md:font-semibold">{task.title}</p>
              {task.clients?.name && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 md:px-2.5 md:py-1 text-[10px] md:text-xs font-medium text-primary">
                  {task.clients.name}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs md:text-sm text-muted-foreground">
              {task.labourers?.name ?? "Unassigned"} · {formatDate(task.start_date)}
              {task.due_date ? ` → due ${formatDate(task.due_date)}` : ""}
              {isDone && task.completed_at ? ` · completed ${formatDate(task.completed_at)}` : ""}
            </p>
            {task.description && (
              <p className="mt-1 line-clamp-2 text-xs md:text-sm text-muted-foreground">{task.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
            {!isDone && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 md:h-9 gap-1.5 px-2 md:px-3 text-xs md:text-sm text-success hover:text-success"
                onClick={() => completeMutation.mutate(task.id)}
              >
                <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4" /> Done
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:h-9 md:w-9 text-muted-foreground hover:text-destructive"
              onClick={() => deleteMutation.mutate(task.id)}
              aria-label="Delete task"
            >
              <Trash2 className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium transition-colors",
                filter === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 md:gap-3 md:h-11 md:px-5 md:text-[15px]" disabled={workers.length === 0}>
          <Plus className="h-4 w-4 md:h-5 md:w-5" /> Assign task
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {filter !== "completed" && (
            <section className="space-y-2 md:space-y-3">
              <h3 className="text-sm md:text-[15px] font-semibold text-muted-foreground">
                In progress {inProgress.length > 0 && `(${inProgress.length})`}
              </h3>
              {inProgress.length === 0 ? (
                <Card>
                  <CardContent className="py-10 md:py-16 text-center text-sm md:text-[15px] text-muted-foreground">
                    {workers.length === 0
                      ? "Add workers first, then assign them tasks."
                      : "No tasks in progress. Assign one to get started."}
                  </CardContent>
                </Card>
              ) : (
                inProgress.map(taskCard)
              )}
            </section>
          )}

          {filter !== "in_progress" && (
            <section className="space-y-2 md:space-y-3">
              <h3 className="text-sm md:text-[15px] font-semibold text-muted-foreground">
                Completed {completed.length > 0 && `(${completed.length})`}
              </h3>
              {completed.length === 0 ? (
                <Card>
                  <CardContent className="py-10 md:py-16 text-center text-sm md:text-[15px] text-muted-foreground">
                    Nothing completed yet — tasks land here when you mark them done.
                  </CardContent>
                </Card>
              ) : (
                completed.map(taskCard)
              )}
            </section>
          )}
        </>
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
              <Label>Client / project (optional)</Label>
              <Select
                value={form.client_id || "none"}
                onValueChange={(v) => setForm({ ...form, client_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
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
            <div className="grid grid-cols-2 gap-3">
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
