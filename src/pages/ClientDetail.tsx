import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
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
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  Loader2,
  Calculator,
  Check,
  Package,
  ClipboardList,
  IndianRupee,
  Link2,
  Unlink,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { formatINR, formatDate, toLocalDateString } from "@/lib/format";
import { computeQuote, buildSpec, partPieces, partTotalKg } from "@/lib/quote";
import { defaultInstallments } from "@/lib/agreement";
import type { Client, Labourer, PaymentInstallment, Quotation, WorkerTask } from "@/types";
import { cn } from "@/lib/utils";

type TaskWithWorker = WorkerTask & { labourers: Pick<Labourer, "name"> | null };

export interface SupplierPayment {
  id: string;
  amount: number;
  date: string;
  note?: string;
}

export interface SupplierDetails {
  name: string;
  kg_rate: number;
  iron_kg: number;
  total_amount: number;
  payments: SupplierPayment[];
}

export function parseNotesAndSupplier(notesText: string | null): { notes: string; supplier: SupplierDetails | null } {
  if (!notesText) return { notes: "", supplier: null };
  const marker = "---SUPPLIER_DETAILS_JSON---";
  const index = notesText.indexOf(marker);
  if (index === -1) return { notes: notesText, supplier: null };
  
  const notes = notesText.substring(0, index).trim();
  const jsonStr = notesText.substring(index + marker.length).trim();
  try {
    const supplier = JSON.parse(jsonStr) as SupplierDetails;
    if (!supplier.payments) supplier.payments = [];
    return { notes, supplier };
  } catch (e) {
    return { notes, supplier: null };
  }
}

export function serializeNotesAndSupplier(notes: string, supplier: SupplierDetails | null): string {
  const cleanNotes = notes ? notes.trim() : "";
  if (!supplier) return cleanNotes;
  const marker = "\n\n---SUPPLIER_DETAILS_JSON---\n";
  return `${cleanNotes}${marker}${JSON.stringify(supplier)}`;
}

/** Pipeline steps in order; legacy "contacted"/"client" statuses map onto the nearest step. */
const PIPELINE_STEPS = [
  { label: "New lead", statuses: ["new_lead", "contacted"] },
  { label: "Quote sent", statuses: ["quote_sent"] },
  { label: "Deal closed", statuses: ["deal_closed"] },
  { label: "In progress", statuses: ["in_progress", "client"] },
  { label: "Completed", statuses: ["completed"] },
];

/** ₹ value of one installment: fixed amount when set (custom payments), else % of the agreed price. */
const instValue = (inst: PaymentInstallment, finalAmount: number) =>
  inst.amount ?? (finalAmount * inst.pct) / 100;

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachTaskOpen, setAttachTaskOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    labourer_id: "",
    title: "",
    description: "",
    start_date: toLocalDateString(),
    due_date: "",
  });

  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    kg_rate: "",
    iron_kg: "",
    total_amount: "",
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    date: toLocalDateString(),
    note: "",
  });

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ["client", id],
    enabled: !!id && isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Client | null;
    },
  });

  const { data: quotations = [] } = useQuery({
    queryKey: ["client-quotations", id],
    enabled: !!id && isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select("*")
        .eq("client_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Quotation[];
    },
  });

  // tasks need the client_id column (migration 20260707000001); degrade gracefully if it
  // hasn't been run yet instead of breaking the whole page
  const { data: tasksResult } = useQuery({
    queryKey: ["client-tasks", id],
    enabled: !!id && isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_tasks")
        .select("*, labourers(name)")
        .eq("client_id", id!)
        .order("created_at", { ascending: false });
      if (error) return { tasks: [] as TaskWithWorker[], unavailable: true };
      return { tasks: data as TaskWithWorker[], unavailable: false };
    },
  });
  const tasks = tasksResult?.tasks ?? [];

  // quotations not linked to any client — candidates for attaching
  const { data: unattached = [] } = useQuery({
    queryKey: ["unattached-quotations"],
    enabled: attachOpen && isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select("id, quote_number, project_title, total, created_at")
        .is("client_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pick<Quotation, "id" | "quote_number" | "project_title" | "total" | "created_at">[];
    },
  });

  function invalidateQuoteQueries(quoteId: string) {
    queryClient.invalidateQueries({ queryKey: ["client-quotations", id] });
    queryClient.invalidateQueries({ queryKey: ["quotations"] });
    queryClient.invalidateQueries({ queryKey: ["quotation", quoteId] });
    queryClient.invalidateQueries({ queryKey: ["unattached-quotations"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const attachMutation = useMutation({
    mutationFn: async ({ quotationId, clientName }: { quotationId: string; clientName: string }) => {
      const { error } = await supabase
        .from("quotations")
        .update({ client_id: id, client_name: clientName })
        .eq("id", quotationId);
      if (error) throw error;
    },
    onSuccess: (_, { quotationId }) => {
      invalidateQuoteQueries(quotationId);
      setAttachOpen(false);
      toast.success("Quotation attached");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detachMutation = useMutation({
    mutationFn: async (quotationId: string) => {
      const { error } = await supabase.from("quotations").update({ client_id: null }).eq("id", quotationId);
      if (error) throw error;
    },
    onSuccess: (_, quotationId) => {
      invalidateQuoteQueries(quotationId);
      toast.success("Quotation detached");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finalAmountMutation = useMutation({
    mutationFn: async ({ quotation, amount }: { quotation: Quotation; amount: number | null }) => {
      const patch: Record<string, unknown> = { final_amount: amount };
      // first time a price is agreed: seed the standard installment plan so
      // received-tracking rows exist (never reseed — keeps received ticks)
      if (amount != null && (quotation.payment_plan ?? []).length === 0) {
        patch.payment_plan = defaultInstallments.map((i) => ({ ...i, id: crypto.randomUUID() }));
      }
      const { error } = await supabase.from("quotations").update(patch).eq("id", quotation.id);
      if (error) throw error;
    },
    onSuccess: (_, { quotation }) => {
      invalidateQuoteQueries(quotation.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // one mutation for every payment_plan change: received ticks, edited
  // percentages, new stages, and custom recorded payments
  const planMutation = useMutation({
    mutationFn: async ({ quotation, plan }: { quotation: Quotation; plan: PaymentInstallment[] }) => {
      const { error } = await supabase.from("quotations").update({ payment_plan: plan }).eq("id", quotation.id);
      if (error) throw error;
    },
    onSuccess: (_, { quotation }) => {
      invalidateQuoteQueries(quotation.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: unattachedTasks = [] } = useQuery({
    queryKey: ["unattached-tasks"],
    enabled: attachTaskOpen && isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_tasks")
        .select("*, labourers(name)")
        .is("client_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TaskWithWorker[];
    },
  });

  const { data: labourers = [] } = useQuery({
    queryKey: ["labourers-active"],
    enabled: newTaskOpen && isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("labourers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Pick<Labourer, "id" | "name">[];
    },
  });

  const attachTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("worker_tasks")
        .update({ client_id: id })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-tasks", id] });
      queryClient.invalidateQueries({ queryKey: ["worker_tasks"] });
      queryClient.invalidateQueries({ queryKey: ["unattached-tasks"] });
      setAttachTaskOpen(false);
      toast.success("Task attached to client");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detachTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("worker_tasks")
        .update({ client_id: null })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-tasks", id] });
      queryClient.invalidateQueries({ queryKey: ["worker_tasks"] });
      toast.success("Task detached from client");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createTaskMutation = useMutation({
    mutationFn: async (payload: typeof taskForm) => {
      const { error } = await supabase.from("worker_tasks").insert({
        labourer_id: payload.labourer_id,
        client_id: id,
        title: payload.title,
        description: payload.description || null,
        start_date: payload.start_date,
        due_date: payload.due_date || null,
        status: "in_progress",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-tasks", id] });
      queryClient.invalidateQueries({ queryKey: ["worker_tasks"] });
      setNewTaskOpen(false);
      setTaskForm({
        labourer_id: "",
        title: "",
        description: "",
        start_date: toLocalDateString(),
        due_date: "",
      });
      toast.success("Task assigned and linked to client");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSupplierMutation = useMutation({
    mutationFn: async (supplier: SupplierDetails | null) => {
      const currentNotes = client?.notes ?? "";
      const { notes } = parseNotesAndSupplier(currentNotes);
      const finalizedNotes = serializeNotesAndSupplier(notes, supplier);
      
      const { error } = await supabase
        .from("clients")
        .update({ notes: finalizedNotes })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", id] });
      toast.success("Supplier details updated");
      setSupplierFormOpen(false);
      setAddPaymentOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { notes, supplier } = parseNotesAndSupplier(client?.notes ?? null);

  function openEditSupplier() {
    setSupplierForm({
      name: supplier?.name ?? "",
      kg_rate: supplier?.kg_rate != null ? String(supplier.kg_rate) : "",
      iron_kg: supplier?.iron_kg != null ? String(supplier.iron_kg) : "",
      total_amount: supplier?.total_amount != null ? String(supplier.total_amount) : "",
    });
    setSupplierFormOpen(true);
  }

  function handleSupplierFormChange(field: string, value: string) {
    setSupplierForm((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "kg_rate" || field === "iron_kg") {
        const rate = parseFloat(field === "kg_rate" ? value : prev.kg_rate) || 0;
        const kg = parseFloat(field === "iron_kg" ? value : prev.iron_kg) || 0;
        if (rate > 0 && kg > 0) {
          updated.total_amount = String(Math.round(rate * kg));
        }
      }
      return updated;
    });
  }

  if (clientLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">Client not found.</p>
        <Button variant="outline" onClick={() => navigate("/clients")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to clients
        </Button>
      </div>
    );
  }

  // deals = quotations with an agreed final price; money is tracked against them
  const deals = quotations.filter((q) => q.final_amount != null);
  const dealValue = deals.reduce((sum, q) => sum + (q.final_amount ?? 0), 0);
  const received = deals.reduce(
    (sum, q) =>
      sum +
      (q.payment_plan ?? [])
        .filter((inst) => inst.received)
        .reduce((s, inst) => s + instValue(inst, q.final_amount ?? 0), 0),
    0
  );
  const remaining = Math.max(0, dealValue - received);

  const isLost = client.status === "lost";
  const currentStep = PIPELINE_STEPS.findIndex((s) => s.statuses.includes(client.status));

  const totalKgAllQuotes = quotations.reduce((sum, q) => sum + computeQuote(q.data).totalKg, 0);
  const openTasks = tasks.filter((t) => t.status !== "completed");
  const doneTasks = tasks.filter((t) => t.status === "completed");

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 px-2" onClick={() => navigate("/clients")}>
        <ArrowLeft className="h-4 w-4" /> Clients
      </Button>

      {/* Header */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{client.name}</h2>
              <StatusBadge status={client.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {[client.company, client.city].filter(Boolean).join(" · ") || "—"}
              {client.work_type ? ` · ${client.work_type}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {client.phone && (
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <a href={`tel:${client.phone}`}>
                  <Phone className="h-3.5 w-3.5" /> Call
                </a>
              </Button>
            )}
            {(client.whatsapp || client.phone) && (
              <Button variant="outline" size="sm" className="gap-1.5 text-success" asChild>
                <a
                  href={`https://wa.me/${(client.whatsapp || client.phone || "").replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Project progress */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Project progress</CardTitle>
        </CardHeader>
        <CardContent>
          {isLost ? (
            <p className="text-sm text-muted-foreground">
              This lead is marked <span className="font-medium text-destructive">lost</span>.
            </p>
          ) : (
            <div className="flex items-start">
              {PIPELINE_STEPS.map((step, i) => {
                const done = i < currentStep;
                const active = i === currentStep;
                return (
                  <div key={step.label} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full items-center">
                      <div className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : done || active ? "bg-primary" : "bg-border")} />
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                          done && "border-primary bg-primary text-primary-foreground",
                          active && "border-primary bg-primary/15 text-primary",
                          !done && !active && "border-border bg-card text-muted-foreground"
                        )}
                      >
                        {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                      </div>
                      <div className={cn("h-0.5 flex-1", i === PIPELINE_STEPS.length - 1 ? "bg-transparent" : done ? "bg-primary" : "bg-border")} />
                    </div>
                    <p
                      className={cn(
                        "mt-1.5 text-center text-[11px] leading-tight",
                        active ? "font-semibold text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Work / quotations + materials */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calculator className="h-4 w-4 text-primary" /> Work &amp; quotations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quotations.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No quotations for this client yet.{" "}
                  <Link to="/quotations/new" className="text-primary underline underline-offset-4">
                    Create one
                  </Link>
                </p>
              ) : (
                quotations.map((q) => {
                  const totals = computeQuote(q.data);
                  return (
                    <div key={q.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link to={`/quotations/${q.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                          #{q.quote_number} · {q.project_title || "Untitled"}
                        </Link>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={q.status} />
                          <span className="text-sm font-semibold">
                            {formatINR(q.final_amount ?? q.total)}
                            {q.final_amount != null && (
                              <span className="ml-1 text-[10px] font-normal text-muted-foreground">agreed</span>
                            )}
                          </span>
                        </div>
                      </div>
                      {q.data.parts.length > 0 && (
                        <div className="mt-2 space-y-1 border-t pt-2">
                          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Package className="h-3.5 w-3.5" /> Material needed —{" "}
                            {totals.totalKg.toFixed(1)} kg total
                          </p>
                          {q.data.parts.map((part) => (
                            <div key={part.id} className="flex items-baseline justify-between gap-2 text-xs">
                              <span className="min-w-0 truncate">
                                <span className="font-medium">{part.name || "Member"}</span>{" "}
                                <span className="text-muted-foreground">· {buildSpec(part)}</span>
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                {partPieces(part)} pcs · {partTotalKg(part).toFixed(1)} kg
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {quotations.length > 1 && totalKgAllQuotes > 0 && (
                <p className="text-right text-xs text-muted-foreground">
                  All quotations combined: <span className="font-semibold text-foreground">{totalKgAllQuotes.toFixed(1)} kg</span>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Linked worker tasks */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ClipboardList className="h-4 w-4 text-primary" /> Worker tasks for this client
                </CardTitle>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAttachTaskOpen(true)}>
                    <Link2 className="h-3.5 w-3.5" /> Attach task
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setNewTaskOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> New task
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {tasksResult?.unavailable ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Task linking needs the latest database update — run the pending migration in Supabase.
                </p>
              ) : tasks.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  No tasks linked yet. Map existing tasks or create a new one above.
                </p>
              ) : (
                <>
                  {openTasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {task.labourers?.name ?? "Unassigned"} · {formatDate(task.start_date)}
                          {task.due_date ? ` → due ${formatDate(task.due_date)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status="in_progress" />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => detachTaskMutation.mutate(task.id)}
                          title="Unlink task"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {doneTasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 opacity-70">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {task.labourers?.name ?? "Unassigned"}
                          {task.completed_at ? ` · completed ${formatDate(task.completed_at)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status="completed" />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => detachTaskMutation.mutate(task.id)}
                          title="Unlink task"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {/* Supplier details & payments */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4 text-primary" /> Supplier details &amp; payments
                </CardTitle>
                {supplier && (
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={openEditSupplier}>
                      <Pencil className="h-3 w-3" /> Edit details
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                          disabled={updateSupplierMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove supplier details?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This clears the supplier info and its recorded payments
                            {supplier.payments.length > 0 &&
                              ` (${supplier.payments.length} payment${supplier.payments.length > 1 ? "s" : ""})`}{" "}
                            from this client. It can't be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => updateSupplierMutation.mutate(null)}
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!supplier ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    No supplier details added yet for this project.
                  </p>
                  <Button size="sm" className="gap-1.5" onClick={openEditSupplier}>
                    <Plus className="h-3.5 w-3.5" /> Add supplier details
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Supplier Name</p>
                      <p className="text-sm font-semibold truncate mt-0.5">{supplier.name}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Finalized Rate</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {supplier.kg_rate ? `${formatINR(supplier.kg_rate)}/kg` : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Iron Quantity</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {supplier.iron_kg ? `${supplier.iron_kg.toLocaleString()} kg` : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Total Deal Amount</p>
                      <p className="text-sm font-semibold mt-0.5">{formatINR(supplier.total_amount)}</p>
                    </div>
                  </div>

                  {/* Financials grid */}
                  {(() => {
                    const totalPaid = (supplier.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
                    const balance = Math.max(0, supplier.total_amount - totalPaid);
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-center pt-2">
                          <div className="rounded-lg border p-2">
                            <p className="text-[11px] text-muted-foreground">Deal amount</p>
                            <p className="text-sm font-semibold">{formatINR(supplier.total_amount)}</p>
                          </div>
                          <div className="rounded-lg border p-2">
                            <p className="text-[11px] text-muted-foreground">Paid to supplier</p>
                            <p className="text-sm font-semibold text-success">{formatINR(totalPaid)}</p>
                          </div>
                          <div className="rounded-lg border p-2">
                            <p className="text-[11px] text-muted-foreground">Balance to pay</p>
                            <p className={cn("text-sm font-semibold", balance > 0 ? "text-warning" : "text-success")}>
                              {formatINR(balance)}
                            </p>
                          </div>
                        </div>

                        {/* Payments list */}
                        <div className="border-t pt-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Supplier Payments
                            </h4>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-6 gap-1 text-[11px] px-2"
                              onClick={() => {
                                setPaymentForm({
                                  amount: "",
                                  date: toLocalDateString(),
                                  note: "",
                                });
                                setAddPaymentOpen(true);
                              }}
                            >
                              <Plus className="h-3 w-3" /> Record payment
                            </Button>
                          </div>

                          {(supplier.payments ?? []).length === 0 ? (
                            <p className="py-2 text-center text-xs text-muted-foreground">
                              No payments recorded yet.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {supplier.payments.map((p) => (
                                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
                                  <div>
                                    <p className="font-semibold text-success">{formatINR(p.amount)}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {formatDate(p.date)}{p.note ? ` · ${p.note}` : ""}
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                    onClick={() => {
                                      if (confirm("Are you sure you want to delete this payment record?")) {
                                        const updatedPayments = supplier.payments.filter(item => item.id !== p.id);
                                        updateSupplierMutation.mutate({
                                          ...supplier,
                                          payments: updatedPayments
                                        });
                                      }
                                    }}
                                    title="Delete payment"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Money */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <IndianRupee className="h-4 w-4 text-primary" /> Payments
                </CardTitle>
                {quotations.length === 1 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
                    title="Unlink quotation"
                    disabled={detachMutation.isPending}
                    onClick={() => detachMutation.mutate(quotations[0].id)}
                  >
                    <Unlink className="h-3.5 w-3.5" /> Unlink quotation
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setAttachOpen(true)}>
                    <Link2 className="h-3.5 w-3.5" /> Attach quotation
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {quotations.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  No quotations linked yet.
                  {client.estimated_value != null && (
                    <>
                      {" "}
                      Estimated value: <span className="font-medium text-foreground">{formatINR(client.estimated_value)}</span>
                    </>
                  )}
                </p>
              ) : (
                <>
                  {deals.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border p-2">
                        <p className="text-[11px] text-muted-foreground">Deal value</p>
                        <p className="text-sm font-semibold">{formatINR(dealValue)}</p>
                      </div>
                      <div className="rounded-lg border p-2">
                        <p className="text-[11px] text-muted-foreground">Received</p>
                        <p className="text-sm font-semibold text-success">{formatINR(received)}</p>
                      </div>
                      <div className="rounded-lg border p-2">
                        <p className="text-[11px] text-muted-foreground">To collect</p>
                        <p className={cn("text-sm font-semibold", remaining > 0 ? "text-warning" : "text-success")}>
                          {formatINR(remaining)}
                        </p>
                      </div>
                    </div>
                  )}
                  {quotations.map((q) => (
                    <QuotationDealBlock
                      key={q.id}
                      quotation={q}
                      onSaveAmount={(amount) => finalAmountMutation.mutate({ quotation: q, amount })}
                      onSavePlan={(plan) => planMutation.mutate({ quotation: q, plan })}
                      pending={finalAmountMutation.isPending || planMutation.isPending || detachMutation.isPending}
                    />
                  ))}
                  {deals.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Tick an installment once the money is in hand, or record a custom amount for
                      partial payments.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {client.estimated_value != null && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Estimated value</span>
                  <span className="font-medium">{formatINR(client.estimated_value)}</span>
                </div>
              )}
              {client.follow_up_date && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Next follow-up</span>
                  <span className="font-medium">{formatDate(client.follow_up_date)}</span>
                </div>
              )}
              {client.email && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Email</span>
                  <span className="min-w-0 truncate font-medium">{client.email}</span>
                </div>
              )}
              {client.address && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Address</span>
                  <span className="min-w-0 text-right font-medium">{client.address}</span>
                </div>
              )}
              {client.source && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Source</span>
                  <span className="font-medium capitalize">{client.source.replace(/_/g, " ")}</span>
                </div>
              )}
              {notes && (
                <div className="border-t pt-2">
                  <p className="text-xs text-muted-foreground">{notes}</p>
                </div>
              )}
              {!client.estimated_value && !client.follow_up_date && !client.email && !client.address && !client.source && !notes && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Nothing more on file — use Edit on the Clients page to add details.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Attach quotation dialog */}
      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attach a quotation</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {unattached.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No unattached quotations. Create one in{" "}
                <Link to="/quotations/new" className="text-primary underline underline-offset-4">
                  Quotations
                </Link>{" "}
                and leave the client unset, or pick this client while making it.
              </p>
            ) : (
              unattached.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  disabled={attachMutation.isPending}
                  onClick={() => attachMutation.mutate({ quotationId: q.id, clientName: client.name })}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary/40 disabled:opacity-60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      #{q.quote_number} · {q.project_title || "Untitled"}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(q.created_at)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">{formatINR(q.total)}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Attach task dialog */}
      <Dialog open={attachTaskOpen} onOpenChange={setAttachTaskOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attach a task</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {unattachedTasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No unattached worker tasks found. Create a new task or go to Labour → Tasks to assign tasks.
              </p>
            ) : (
              unattachedTasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={attachTaskMutation.isPending}
                  onClick={() => attachTaskMutation.mutate(t.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary/40 disabled:opacity-60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.labourers?.name ?? "Unassigned"} · {formatDate(t.start_date)}
                    </p>
                  </div>
                  <Plus className="h-4 w-4 shrink-0 text-primary" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create new task dialog */}
      <Dialog open={newTaskOpen} onOpenChange={setNewTaskOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create and map new task</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!taskForm.labourer_id) {
                toast.error("Please select a worker");
                return;
              }
              if (!taskForm.title.trim()) {
                toast.error("Please enter a task title");
                return;
              }
              createTaskMutation.mutate(taskForm);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Task title *</Label>
              <Input
                id="task-title"
                required
                placeholder="e.g. Grinding & Welding frames"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="task-worker">Assign worker *</Label>
              <Select
                value={taskForm.labourer_id}
                onValueChange={(val) => setTaskForm({ ...taskForm, labourer_id: val })}
              >
                <SelectTrigger id="task-worker">
                  <SelectValue placeholder="Select a worker" />
                </SelectTrigger>
                <SelectContent>
                  {labourers.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No active workers
                    </SelectItem>
                  ) : (
                    labourers.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-description">Details</Label>
              <Textarea
                id="task-description"
                placeholder="Optional task details or notes"
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="task-start">Start date</Label>
                <Input
                  id="task-start"
                  type="date"
                  value={taskForm.start_date}
                  onChange={(e) => setTaskForm({ ...taskForm, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-due">Due date</Label>
                <Input
                  id="task-due"
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setNewTaskOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTaskMutation.isPending}>
                {createTaskMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create task
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Supplier form dialog */}
      <Dialog open={supplierFormOpen} onOpenChange={setSupplierFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{supplier ? "Edit supplier details" : "Add supplier details"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!supplierForm.name.trim()) {
                toast.error("Please enter a supplier name");
                return;
              }
              const rate = parseFloat(supplierForm.kg_rate) || 0;
              const kg = parseFloat(supplierForm.iron_kg) || 0;
              const total = parseFloat(supplierForm.total_amount) || 0;

              updateSupplierMutation.mutate({
                name: supplierForm.name.trim(),
                kg_rate: rate > 0 ? rate : 0,
                iron_kg: kg > 0 ? kg : 0,
                total_amount: total > 0 ? total : 0,
                payments: supplier?.payments ?? [],
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="supplier-name">Supplier name *</Label>
              <Input
                id="supplier-name"
                required
                placeholder="e.g. Jindal Steel distributor"
                value={supplierForm.name}
                onChange={(e) => handleSupplierFormChange("name", e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="supplier-rate">Price /kg (₹)</Label>
                <Input
                  id="supplier-rate"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="e.g. 55"
                  value={supplierForm.kg_rate}
                  onChange={(e) => handleSupplierFormChange("kg_rate", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier-kg">Quantity (kg)</Label>
                <Input
                  id="supplier-kg"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="e.g. 1000"
                  value={supplierForm.iron_kg}
                  onChange={(e) => handleSupplierFormChange("iron_kg", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supplier-total">Total deal amount (₹)</Label>
              <Input
                id="supplier-total"
                type="number"
                min="0"
                inputMode="decimal"
                placeholder="Calculated automatically or custom"
                value={supplierForm.total_amount}
                onChange={(e) => handleSupplierFormChange("total_amount", e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setSupplierFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateSupplierMutation.isPending}>
                {updateSupplierMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save details
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record supplier payment dialog */}
      <Dialog open={addPaymentOpen} onOpenChange={setAddPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record supplier payment</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const amt = parseFloat(paymentForm.amount) || 0;
              if (amt <= 0) {
                toast.error("Please enter a valid payment amount");
                return;
              }
              if (!supplier) return;

              const newPayment = {
                id: crypto.randomUUID(),
                amount: amt,
                date: paymentForm.date,
                note: paymentForm.note.trim() || undefined,
              };

              updateSupplierMutation.mutate({
                ...supplier,
                payments: [...(supplier.payments ?? []), newPayment],
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">Amount paid (₹) *</Label>
              <Input
                id="payment-amount"
                type="number"
                min="1"
                required
                inputMode="decimal"
                placeholder="e.g. 20000"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-date">Payment date</Label>
              <Input
                id="payment-date"
                type="date"
                required
                value={paymentForm.date}
                onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-note">Note / Reference</Label>
              <Input
                id="payment-note"
                placeholder="e.g. Online transfer / Cash"
                value={paymentForm.note}
                onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddPaymentOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateSupplierMutation.isPending}>
                {updateSupplierMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record payment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One attached quotation inside the Payments card: final amount, installment plan, received tracking. */
function QuotationDealBlock({
  quotation: q,
  onSaveAmount,
  onSavePlan,
  pending,
}: {
  quotation: Quotation;
  onSaveAmount: (amount: number | null) => void;
  onSavePlan: (plan: PaymentInstallment[]) => void;
  pending: boolean;
}) {
  const [amountDraft, setAmountDraft] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<PaymentInstallment[] | null>(null);
  const [payDraft, setPayDraft] = useState<string | null>(null);

  const plan = q.payment_plan ?? [];
  const final = q.final_amount ?? 0;
  const pctSum = (planDraft ?? []).filter((i) => i.amount == null).reduce((s, i) => s + i.pct, 0);

  function saveAmount() {
    const n = parseFloat(amountDraft ?? "");
    onSaveAmount(Number.isFinite(n) && n > 0 ? n : null);
    setAmountDraft(null);
  }

  function recordPayment() {
    const n = parseFloat(payDraft ?? "");
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter the amount received");
      return;
    }
    onSavePlan([
      ...plan,
      {
        id: crypto.randomUUID(),
        label: `Payment received — ${formatDate(toLocalDateString())}`,
        pct: 0,
        amount: n,
        received: true,
      },
    ]);
    setPayDraft(null);
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          to={`/quotations/${q.id}`}
          className="min-w-0 truncate text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          #{q.quote_number} · {q.project_title || "Untitled"}
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">Quote total: {formatINR(q.total)}</p>

      {/* Final agreed amount */}
      {amountDraft != null ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min="0"
              inputMode="decimal"
              className="h-8 text-sm"
              placeholder="Final agreed price (₹)"
              autoFocus
              value={amountDraft}
              onChange={(e) => setAmountDraft(e.target.value)}
            />
            <Button size="sm" className="h-8" disabled={pending} onClick={saveAmount}>
              Save
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAmountDraft(null)} aria-label="Cancel">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {q.total > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={pending}
              onClick={() => {
                onSaveAmount(Math.round(q.total));
                setAmountDraft(null);
              }}
            >
              Use quote total ({formatINR(q.total)})
            </Button>
          )}
        </div>
      ) : q.final_amount != null ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm">
            Final agreed: <span className="font-semibold">{formatINR(q.final_amount)}</span>
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            onClick={() => setAmountDraft(String(q.final_amount))}
            title="Edit final amount"
            aria-label="Edit final amount"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">No final amount agreed yet.</p>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAmountDraft("")}>
            Set amount
          </Button>
        </div>
      )}

      {/* Installments: edit mode */}
      {q.final_amount != null && planDraft != null && (
        <div className="space-y-1.5 border-t pt-2">
          {planDraft.map((inst) => (
            <div key={inst.id} className="flex items-center gap-1.5">
              <Input
                className="h-8 flex-1 text-xs"
                placeholder="e.g. On delivery"
                value={inst.label}
                onChange={(e) =>
                  setPlanDraft((rows) => rows!.map((i) => (i.id === inst.id ? { ...i, label: e.target.value } : i)))
                }
              />
              {inst.amount == null ? (
                <div className="relative w-16 shrink-0">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    inputMode="decimal"
                    className="h-8 pr-5 text-xs"
                    value={inst.pct || ""}
                    onChange={(e) =>
                      setPlanDraft((rows) =>
                        rows!.map((i) => (i.id === inst.id ? { ...i, pct: parseFloat(e.target.value) || 0 } : i))
                      )
                    }
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                </div>
              ) : (
                <div className="relative w-24 shrink-0">
                  <Input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    className="h-8 pl-5 text-xs"
                    value={inst.amount || ""}
                    onChange={(e) =>
                      setPlanDraft((rows) =>
                        rows!.map((i) => (i.id === inst.id ? { ...i, amount: parseFloat(e.target.value) || 0 } : i))
                      )
                    }
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">₹</span>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => setPlanDraft((rows) => rows!.filter((i) => i.id !== inst.id))}
                aria-label="Remove installment"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setPlanDraft((rows) => [...rows!, { id: crypto.randomUUID(), label: "", pct: 0 }])}
            >
              <Plus className="h-3 w-3" /> Add stage
            </Button>
            <p className={cn("text-[11px]", Math.abs(pctSum - 100) < 0.01 ? "text-muted-foreground" : "font-medium text-destructive")}>
              {pctSum}%{Math.abs(pctSum - 100) >= 0.01 && " — should be 100%"}
            </p>
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={pending}
              onClick={() => {
                onSavePlan(planDraft.filter((i) => i.label.trim() || i.pct > 0 || (i.amount ?? 0) > 0));
                setPlanDraft(null);
              }}
            >
              Save plan
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPlanDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Installments: display mode */}
      {q.final_amount != null && planDraft == null && (
        <>
          {plan.map((inst) => (
            <label key={inst.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={!!inst.received}
                onCheckedChange={(v) =>
                  onSavePlan(plan.map((i) => (i.id === inst.id ? { ...i, received: v === true } : i)))
                }
              />
              <span className={cn("flex-1", inst.received && "text-muted-foreground line-through")}>
                {inst.label}
                {inst.amount == null && ` (${inst.pct}%)`}
              </span>
              <span className={cn("font-medium", inst.received ? "text-success" : "text-foreground")}>
                {formatINR(instValue(inst, final))}
              </span>
            </label>
          ))}

          {payDraft != null ? (
            <div className="flex items-center gap-1.5 border-t pt-2">
              <Input
                type="number"
                min="0"
                inputMode="decimal"
                className="h-8 text-sm"
                placeholder="Amount received (₹)"
                autoFocus
                value={payDraft}
                onChange={(e) => setPayDraft(e.target.value)}
              />
              <Button size="sm" className="h-8" disabled={pending} onClick={recordPayment}>
                Add
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPayDraft(null)} aria-label="Cancel">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-1.5 border-t pt-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => setPlanDraft(plan.map((i) => ({ ...i })))}
              >
                <Pencil className="h-3 w-3" /> Edit plan
              </Button>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setPayDraft("")}>
                <Plus className="h-3 w-3" /> Record payment
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
