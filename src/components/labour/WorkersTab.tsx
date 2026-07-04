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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Phone, Loader2 } from "lucide-react";
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
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Add worker
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : workers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No workers yet. Add your labour team to start tracking attendance and tasks.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workers.map((worker) => (
            <Card key={worker.id} className={!worker.is_active ? "opacity-60" : undefined}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{worker.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {worker.skill ?? "—"} · joined {formatDate(worker.joining_date)}
                    </p>
                  </div>
                  <Badge variant={worker.is_active ? "secondary" : "outline"} className="shrink-0">
                    {worker.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {formatINR(worker.daily_wage)}/{payCycleUnit(worker.pay_cycle ?? "daily")}
                  </span>
                  {worker.phone && (
                    <a href={`tel:${worker.phone}`} className="flex items-center gap-1.5 text-primary">
                      <Phone className="h-3.5 w-3.5" /> {worker.phone}
                    </a>
                  )}
                </div>
                <div className="flex justify-end border-t pt-2">
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => openEdit(worker)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
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
            <DialogFooter>
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
