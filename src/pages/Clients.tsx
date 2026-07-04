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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import { Plus, Search, Phone, Pencil, Trash2, Loader2, MessageCircle, CalendarClock } from "lucide-react";
import { formatINR, formatDate, toLocalDateString } from "@/lib/format";
import type { Client, ClientStatus } from "@/types";
import { cn } from "@/lib/utils";

const statusFilters: { value: ClientStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new_lead", label: "New leads" },
  { value: "contacted", label: "Contacted" },
  { value: "quote_sent", label: "Quote sent" },
  { value: "deal_closed", label: "Deal closed" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "lost", label: "Lost" },
];

const pipelineOptions: { value: ClientStatus; label: string }[] = [
  { value: "new_lead", label: "New lead" },
  { value: "contacted", label: "Contacted" },
  { value: "quote_sent", label: "Quote sent" },
  { value: "deal_closed", label: "Deal closed (advance received)" },
  { value: "in_progress", label: "In progress (materials / fabrication)" },
  { value: "completed", label: "Completed" },
  { value: "lost", label: "Lost" },
];

const emptyForm = {
  name: "",
  company: "",
  contact_person: "",
  phone: "",
  whatsapp: "",
  email: "",
  city: "",
  address: "",
  status: "new_lead" as ClientStatus,
  source: "",
  work_type: "",
  estimated_value: "",
  follow_up_date: "",
  notes: "",
};

type ClientForm = typeof emptyForm;

export default function Clients() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ClientStatus | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: ClientForm) => {
      const row = {
        ...payload,
        company: payload.company || null,
        contact_person: payload.contact_person || null,
        phone: payload.phone || null,
        whatsapp: payload.whatsapp || null,
        email: payload.email || null,
        city: payload.city || null,
        address: payload.address || null,
        source: payload.source || null,
        work_type: payload.work_type || null,
        estimated_value: payload.estimated_value ? Number(payload.estimated_value) : null,
        follow_up_date: payload.follow_up_date || null,
        notes: payload.notes || null,
      };
      if (editing) {
        const { error } = await supabase.from("clients").update(row).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(editing ? "Client updated" : "Client added");
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client deleted");
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const matchesFilter = filter === "all" || c.status === filter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").includes(q) ||
        (c.city ?? "").toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [clients, filter, search]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(client: Client) {
    setEditing(client);
    setForm({
      name: client.name,
      company: client.company ?? "",
      contact_person: client.contact_person ?? "",
      phone: client.phone ?? "",
      whatsapp: client.whatsapp ?? "",
      email: client.email ?? "",
      city: client.city ?? "",
      address: client.address ?? "",
      status: client.status,
      source: client.source ?? "",
      work_type: client.work_type ?? "",
      estimated_value: client.estimated_value != null ? String(client.estimated_value) : "",
      follow_up_date: client.follow_up_date ?? "",
      notes: client.notes ?? "",
    });
    setDialogOpen(true);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, city…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Add client / lead
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {statusFilters.map((f) => (
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

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {clients.length === 0
              ? "No clients or leads yet. Add your first one to get started."
              : "Nothing matches your search."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => (
            <Card key={client.id} className="transition-shadow hover:shadow-md">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{client.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[client.company, client.city].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <StatusBadge status={client.status} />
                </div>
                {(client.work_type || client.estimated_value != null) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {client.work_type}
                    {client.work_type && client.estimated_value != null && " · "}
                    {client.estimated_value != null && (
                      <span className="font-medium text-foreground">
                        est. {formatINR(client.estimated_value)}
                      </span>
                    )}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {client.phone && (
                    <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 text-sm text-primary">
                      <Phone className="h-3.5 w-3.5" /> {client.phone}
                    </a>
                  )}
                  {(client.whatsapp || client.phone) && (
                    <a
                      href={`https://wa.me/${(client.whatsapp || client.phone || "").replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-sm text-success"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  )}
                </div>
                {client.follow_up_date && client.status !== "lost" && client.status !== "completed" && (
                  <span
                    className={cn(
                      "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                      client.follow_up_date <= toLocalDateString()
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {client.follow_up_date <= toLocalDateString()
                      ? `Follow up due — ${formatDate(client.follow_up_date)}`
                      : `Follow-up ${formatDate(client.follow_up_date)}`}
                  </span>
                )}
                {client.notes && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{client.notes}</p>
                )}
                <div className="flex justify-end gap-1 border-t pt-2">
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => openEdit(client)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => setDeleting(client)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit client" : "Add client / lead"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company">Company</Label>
                <Input id="company" placeholder="e.g. ABC Builders" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact_person">Contact person</Label>
                <Input id="contact_person" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp">WhatsApp (if different)</Label>
                <Input id="whatsapp" type="tel" placeholder="defaults to phone" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="work_type">Type of work</Label>
                <Input id="work_type" placeholder="e.g. Factory shed, gate, railing" value={form.work_type} onChange={(e) => setForm({ ...form, work_type: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimated_value">Estimated value (₹)</Label>
                <Input id="estimated_value" type="number" min="0" inputMode="decimal" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="follow_up_date">Next follow-up</Label>
                <Input id="follow_up_date" type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Pipeline stage</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ClientStatus })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelineOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                    {form.status === "client" && <SelectItem value="client">Client (legacy)</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={form.source || "none"} onValueChange={(v) => setForm({ ...form, source: v === "none" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="How did they find you?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="walk_in">Walk-in</SelectItem>
                    <SelectItem value="phone">Phone enquiry</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the client and cannot be undone. Their saved quotations will remain but lose the client link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
