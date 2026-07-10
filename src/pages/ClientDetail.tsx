import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  X,
} from "lucide-react";
import { formatINR, formatDate } from "@/lib/format";
import { computeQuote, buildSpec, partPieces, partTotalKg } from "@/lib/quote";
import { defaultInstallments, installmentAmount } from "@/lib/agreement";
import type { Client, Labourer, Quotation, WorkerTask } from "@/types";
import { cn } from "@/lib/utils";

type TaskWithWorker = WorkerTask & { labourers: Pick<Labourer, "name"> | null };

/** Pipeline steps in order; legacy "contacted"/"client" statuses map onto the nearest step. */
const PIPELINE_STEPS = [
  { label: "New lead", statuses: ["new_lead", "contacted"] },
  { label: "Quote sent", statuses: ["quote_sent"] },
  { label: "Deal closed", statuses: ["deal_closed"] },
  { label: "In progress", statuses: ["in_progress", "client"] },
  { label: "Completed", statuses: ["completed"] },
];

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [attachOpen, setAttachOpen] = useState(false);
  /** which quotation's final amount is being edited inline, and the draft value */
  const [amountDraft, setAmountDraft] = useState<{ id: string; value: string } | null>(null);

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
      setAmountDraft(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receivedMutation = useMutation({
    mutationFn: async ({ quotation, installmentId, received }: { quotation: Quotation; installmentId: string; received: boolean }) => {
      const plan = (quotation.payment_plan ?? []).map((inst) =>
        inst.id === installmentId ? { ...inst, received } : inst
      );
      const { error } = await supabase.from("quotations").update({ payment_plan: plan }).eq("id", quotation.id);
      if (error) throw error;
    },
    onSuccess: (_, { quotation }) => {
      invalidateQuoteQueries(quotation.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
        .reduce((s, inst) => s + installmentAmount(q.final_amount ?? 0, inst.pct), 0),
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
              <CardTitle className="flex items-center gap-2 text-sm">
                <ClipboardList className="h-4 w-4 text-primary" /> Worker tasks for this client
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tasksResult?.unavailable ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Task linking needs the latest database update — run the pending migration in Supabase.
                </p>
              ) : tasks.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  No tasks linked yet. Pick this client when assigning a task in Labour → Tasks.
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
                      <StatusBadge status="in_progress" />
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
                      <StatusBadge status="completed" />
                    </div>
                  ))}
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
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setAttachOpen(true)}>
                  <Link2 className="h-3.5 w-3.5" /> Attach quotation
                </Button>
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
                  {quotations.map((q) => {
                    const editing = amountDraft?.id === q.id;
                    return (
                      <div key={q.id} className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            to={`/quotations/${q.id}`}
                            className="min-w-0 truncate text-xs font-medium text-primary underline-offset-4 hover:underline"
                          >
                            #{q.quote_number} · {q.project_title || "Untitled"}
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => detachMutation.mutate(q.id)}
                            aria-label="Detach quotation"
                          >
                            <Unlink className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Quote total: {formatINR(q.total)}</p>
                        {editing ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                min="0"
                                inputMode="decimal"
                                className="h-8 text-sm"
                                placeholder="Final agreed price (₹)"
                                autoFocus
                                value={amountDraft.value}
                                onChange={(e) => setAmountDraft({ id: q.id, value: e.target.value })}
                              />
                              <Button
                                size="sm"
                                className="h-8"
                                disabled={finalAmountMutation.isPending}
                                onClick={() => {
                                  const n = parseFloat(amountDraft.value);
                                  finalAmountMutation.mutate({
                                    quotation: q,
                                    amount: Number.isFinite(n) && n > 0 ? n : null,
                                  });
                                }}
                              >
                                Save
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setAmountDraft(null)}
                                aria-label="Cancel"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {q.total > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={finalAmountMutation.isPending}
                                onClick={() =>
                                  finalAmountMutation.mutate({ quotation: q, amount: Math.round(q.total) })
                                }
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
                              onClick={() => setAmountDraft({ id: q.id, value: String(q.final_amount) })}
                              aria-label="Edit final amount"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">No final amount agreed yet.</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setAmountDraft({ id: q.id, value: "" })}
                            >
                              Set amount
                            </Button>
                          </div>
                        )}
                        {q.final_amount != null &&
                          (q.payment_plan ?? []).map((inst) => (
                            <label key={inst.id} className="flex cursor-pointer items-center gap-2 text-sm">
                              <Checkbox
                                checked={!!inst.received}
                                onCheckedChange={(v) =>
                                  receivedMutation.mutate({ quotation: q, installmentId: inst.id, received: v === true })
                                }
                              />
                              <span className={cn("flex-1", inst.received && "text-muted-foreground line-through")}>
                                {inst.label} ({inst.pct}%)
                              </span>
                              <span className={cn("font-medium", inst.received ? "text-success" : "text-foreground")}>
                                {formatINR(installmentAmount(q.final_amount ?? 0, inst.pct))}
                              </span>
                            </label>
                          ))}
                      </div>
                    );
                  })}
                  {deals.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Tick an installment once the money is in hand.
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
              {client.notes && (
                <div className="border-t pt-2">
                  <p className="text-xs text-muted-foreground">{client.notes}</p>
                </div>
              )}
              {!client.estimated_value && !client.follow_up_date && !client.email && !client.address && !client.source && !client.notes && (
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
    </div>
  );
}
