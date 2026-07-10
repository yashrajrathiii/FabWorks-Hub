import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Phone, Loader2, Trash2 } from "lucide-react";
import { formatINR, formatDate, toLocalDateString } from "@/lib/format";
import type { Labourer, PayCycle } from "@/types";

const skills = ["welder", "fitter", "helper", "painter", "grinder", "supervisor", "other"];

const payCycles: { value: PayCycle; label: string; unit: string }[] = [
  { value: "daily", label: "Daily", unit: "day" },
  { value: "weekly", label: "Weekly", unit: "week" },
  { value: "monthly", label: "Monthly", unit: "month" },
];

export const payCycleUnit = (cycle: PayCycle) => payCycles.find((c) => c.value === cycle)?.unit ?? "day";

const emptyForm = {
  name: "",
  phone: "",
  skill: "helper",
  daily_wage: "",
  pay_cycle: "daily" as PayCycle,
  joining_date: toLocalDateString(),
  is_active: true,
  notes: "",
};

type WorkerForm = typeof emptyForm;

export function useLabourers(includeInactive = true) {
  return useQuery({
    queryKey: ["labourers"],
    queryFn: async () => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase.from("labourers").select("*").order("name");
      if (error) throw error;
      return data as Labourer[];
    },
    select: includeInactive ? undefined : (rows: Labourer[]) => rows.filter((r) => r.is_active),
  });
}

export default function WorkersTab() {
  const queryClient = useQueryClient();
  const { data: workers = [], isLoading } = useLabourers();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Labourer | null>(null);
  const [form, setForm] = useState<WorkerForm>(emptyForm);

  const saveMutation = useMutation({
    mutationFn: async (payload: WorkerForm) => {
      const row = {
        name: payload.name,
        phone: payload.phone || null,
        skill: payload.skill,
        daily_wage: Number(payload.daily_wage) || 0,
        pay_cycle: payload.pay_cycle,
        joining_date: payload.joining_date || null,
        is_active: payload.is_active,
        notes: payload.notes || null,
      };
      if (editing) {
        const { error } = await supabase.from("labourers").update(row).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("labourers").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labourers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(editing ? "Worker updated" : "Worker added");
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("labourers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labourers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Worker removed");
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(worker: Labourer) {
    setEditing(worker);
    setForm({
      name: worker.name,
      phone: worker.phone ?? "",
      skill: worker.skill ?? "other",
      daily_wage: String(worker.daily_wage ?? ""),
      pay_cycle: worker.pay_cycle ?? "daily",
      joining_date: worker.joining_date ?? "",
      is_active: worker.is_active,
      notes: worker.notes ?? "",
    });
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex justify-end">
        <Button onClick={openAdd} className="gap-2 md:gap-3 md:h-12 md:px-6 md:text-base">
          <Plus className="h-4 w-4 md:h-5 md:w-5" /> Add worker
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : workers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm md:text-base text-muted-foreground">
            No workers yet. Add your labour team to start tracking attendance and tasks.
          </CardContent>
        </Card>
      ) : (
        <div className="grid auto-rows-fr gap-3 md:gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {workers.map((worker) => (
            <div 
              key={worker.id} 
              className={`rounded-lg border bg-card text-card-foreground shadow-sm ${!worker.is_active ? "opacity-60" : ""}`}
              style={{ display: "flex", flexDirection: "column", height: "100%" }}
            >
              <div 
                className="space-y-3 md:space-y-4 p-4 md:p-6"
                style={{ display: "flex", flexDirection: "column", flex: "1 1 auto" }}
              >
                {/* Top dynamic section */}
                <div className="space-y-3 md:space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold md:text-lg md:font-bold">{worker.name}</p>
                      <p className="text-xs md:text-sm capitalize text-muted-foreground">
                        {worker.skill ?? "—"} · joined {formatDate(worker.joining_date)}
                      </p>
                    </div>
                    <Badge variant={worker.is_active ? "secondary" : "outline"} className="shrink-0 md:text-xs md:px-2.5 md:py-0.5">
                      {worker.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>

                {/* Bottom fixed section */}
                <div className="space-y-3 md:space-y-4" style={{ marginTop: "auto" }}>
                  <div className="flex items-center justify-between text-sm md:text-base">
                    <span className="font-medium">
                      {formatINR(worker.daily_wage)}/{payCycleUnit(worker.pay_cycle ?? "daily")}
                    </span>
                    {worker.phone && (
                      <a href={`tel:${worker.phone}`} className="flex items-center gap-1.5 text-primary">
                        <Phone className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" /> {worker.phone}
                      </a>
                    )}
                  </div>
                  <div 
                    className="flex justify-end border-t pt-2 md:pt-3"
                    style={{ display: "flex" }}
                  >
                    <Button variant="ghost" size="sm" className="h-8 md:h-9 gap-1.5 px-2 md:px-3 text-xs md:text-sm" onClick={() => openEdit(worker)}>
                      <Pencil className="h-3.5 w-3.5 md:h-4 md:w-4" /> Edit
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit worker" : "Add worker"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="w-name">Name *</Label>
              <Input id="w-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="w-phone">Phone</Label>
                <Input id="w-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Skill</Label>
                <Select value={form.skill} onValueChange={(v) => setForm({ ...form, skill: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {skills.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Pay cycle</Label>
                <Select value={form.pay_cycle} onValueChange={(v) => setForm({ ...form, pay_cycle: v as PayCycle })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {payCycles.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-wage">Wage (₹/{payCycleUnit(form.pay_cycle)})</Label>
                <Input
                  id="w-wage"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={form.daily_wage}
                  onChange={(e) => setForm({ ...form, daily_wage: e.target.value })}
                />
              </div>
              <div className="col-span-2 space-y-1.5 sm:col-span-1">
                <Label htmlFor="w-joined">Joining date</Label>
                <Input
                  id="w-joined"
                  type="date"
                  value={form.joining_date}
                  onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive workers are hidden from attendance.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
            <DialogFooter className={editing ? "gap-2 sm:justify-between" : undefined}>
              {editing && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {editing.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes the worker along with their attendance and task
                        history. If you just want to hide them, mark them Inactive instead.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deleteMutation.mutate(editing.id)}
                      >
                        Remove worker
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : "Add worker"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
