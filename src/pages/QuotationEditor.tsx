import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Loader2, Save, Settings2 } from "lucide-react";
import { useAppSettings } from "@/hooks/useAppSettings";
import { formatINR } from "@/lib/format";
import {
  SHAPES,
  MATERIALS,
  COMPLEXITY_OPTIONS,
  DIM_TEMPLATES,
  unitWeight,
  partPieces,
  partTotalKg,
  buildSpec,
  computeQuote,
  defaultQuoteData,
} from "@/lib/quote";
import type { Client, MemberShape, QuoteData, QuotePart, QuoteStatus, Quotation, ServiceLine } from "@/types";
import { cn } from "@/lib/utils";

const marginPresets = [10, 15, 20, 25];

function num(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function defaultDims(shape: MemberShape): QuotePart["dims"] {
  const dims: QuotePart["dims"] = {};
  for (const [key, , def] of DIM_TEMPLATES[shape]) {
    (dims as Record<string, number>)[key] = def;
  }
  return dims;
}

export default function QuotationEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [clientId, setClientId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [status, setStatus] = useState<QuoteStatus>("draft");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [data, setData] = useState<QuoteData>(defaultQuoteData);

  // "new member" form state
  const [draft, setDraft] = useState<QuotePart>({
    id: "",
    name: "",
    shape: "box",
    density: 7850,
    dims: defaultDims("box"),
    qty: 1,
  });
  const [fittingsOn, setFittingsOn] = useState(false);
  const [deliveryOn, setDeliveryOn] = useState(false);

  // New quotes take the overhead numbers from app settings; saved quotes keep theirs.
  const { data: appSettings } = useAppSettings();
  useEffect(() => {
    if (isNew && appSettings) {
      setData((d) => ({
        ...d,
        overhead: {
          labourPerMonth: appSettings.labour_per_month,
          elecPerMonth: appSettings.elec_per_month,
          throughputKg: appSettings.throughput_kg,
        },
      }));
    }
  }, [isNew, appSettings]);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ["quotation", id],
    enabled: !isNew && isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotations").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Quotation;
    },
  });

  useEffect(() => {
    if (!existing) return;
    setClientId(existing.client_id ?? "");
    setClientName(existing.client_name);
    setProjectTitle(existing.project_title);
    setStatus(existing.status);
    setValidUntil(existing.valid_until ?? "");
    setNotes(existing.notes ?? "");
    const loaded: QuoteData = {
      ...defaultQuoteData,
      ...existing.data,
      overhead: { ...defaultQuoteData.overhead, ...existing.data?.overhead },
      parts: existing.data?.parts ?? [],
      services: existing.data?.services ?? [],
    };
    setData(loaded);
    setFittingsOn(loaded.fittings > 0);
    setDeliveryOn(loaded.delivery > 0);
  }, [existing]);

  const effectiveData: QuoteData = {
    ...data,
    fittings: fittingsOn ? data.fittings : 0,
    delivery: deliveryOn ? data.delivery : 0,
  };
  const totals = computeQuote(effectiveData);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const row = {
        client_id: clientId || null,
        client_name: clientName || clients.find((c) => c.id === clientId)?.name || "",
        project_title: projectTitle,
        data: effectiveData as unknown as Record<string, unknown>,
        subtotal: totals.subtotal,
        gst_pct: data.gstPct,
        total: totals.total,
        status,
        valid_until: validUntil || null,
        notes: notes || null,
      };
      if (isNew) {
        const { data: inserted, error } = await supabase.from("quotations").insert(row).select("id").single();
        if (error) throw error;
        return inserted.id as string;
      }
      const { error } = await supabase.from("quotations").update(row).eq("id", id!);
      if (error) throw error;
      return id!;
    },
    onSuccess: (savedId) => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      queryClient.invalidateQueries({ queryKey: ["quotation", savedId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Quotation saved");
      if (isNew) navigate(`/quotations/${savedId}`, { replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function setShape(shape: MemberShape) {
    setDraft((d) => ({ ...d, shape, dims: { ...defaultDims(shape), cc: d.dims.cc, span: d.dims.span } }));
  }

  function setDim(key: string, value: string) {
    setDraft((d) => ({
      ...d,
      dims: { ...d.dims, [key]: value === "" ? undefined : num(value) },
    }));
  }

  function addPart() {
    const part: QuotePart = { ...draft, id: crypto.randomUUID() };
    if (unitWeight(part) <= 0) {
      toast.error("Check the dimensions — weight came out as zero.");
      return;
    }
    setData((d) => ({ ...d, parts: [...d.parts, part] }));
    setDraft((d) => ({ ...d, name: "", qty: 1, dims: { ...d.dims, cc: undefined, span: undefined } }));
  }

  function updateService(sid: string, patch: Partial<ServiceLine>) {
    setData((d) => ({
      ...d,
      services: d.services.map((s) => (s.id === sid ? { ...s, ...patch } : s)),
    }));
  }

  if (!isNew && isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 px-2">
          <Link to="/quotations">
            <ArrowLeft className="h-4 w-4" /> Quotations
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as QuoteStatus)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        <div className="space-y-4">
          {/* ── Project details ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Project details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="q-title">Project title</Label>
                <Input
                  id="q-title"
                  placeholder="e.g. Balcony railing — 3m span"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select
                  value={clientId || "none"}
                  onValueChange={(v) => {
                    setClientId(v === "none" ? "" : v);
                    if (v !== "none") {
                      const c = clients.find((c) => c.id === v);
                      if (c) setClientName(c.name);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick from clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked client</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q-client-name">Client name (on quote)</Label>
                <Input id="q-client-name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q-valid">Valid until</Label>
                <Input id="q-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* ── ① Material take-off ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">① Material take-off</CardTitle>
              <p className="text-xs text-muted-foreground">
                Read dimensions off the drawing and add each member — the weight is worked out for you. Use
                "spacing @ C/C" when verticals repeat across a span.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Member type</Label>
                  <Select value={draft.shape} onValueChange={(v) => setShape(v as MemberShape)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHAPES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Material</Label>
                  <Select
                    value={String(draft.density)}
                    onValueChange={(v) => setDraft((d) => ({ ...d, density: Number(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MATERIALS.map((m) => (
                        <SelectItem key={m.density} value={String(m.density)}>
                          {m.label} — {m.density} kg/m³
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {DIM_TEMPLATES[draft.shape].map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={draft.dims[key as keyof QuotePart["dims"]] ?? ""}
                      onChange={(e) => setDim(key, e.target.value)}
                    />
                  </div>
                ))}
                {draft.shape !== "manual" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Span fill @ C/C (mm) — opt.</Label>
                      <Input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        placeholder="e.g. 100"
                        value={draft.dims.cc ?? ""}
                        onChange={(e) => setDim("cc", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Across span (m) — opt.</Label>
                      <Input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        placeholder="e.g. 3.0"
                        value={draft.dims.span ?? ""}
                        onChange={(e) => setDim("span", e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
                <div className="space-y-1">
                  <Label className="text-xs">Part name (optional)</Label>
                  <Input
                    placeholder="e.g. Balcony railing verticals"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={draft.qty || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, qty: Math.max(1, Math.round(num(e.target.value))) }))}
                  />
                </div>
                <Button onClick={addPart} className="gap-1.5 self-end">
                  <Plus className="h-4 w-4" /> Add member
                </Button>
              </div>

              {data.parts.length > 0 && (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                        <th className="p-2.5 font-medium">Member</th>
                        <th className="p-2.5 text-right font-medium">Pieces</th>
                        <th className="p-2.5 text-right font-medium">Unit kg</th>
                        <th className="p-2.5 text-right font-medium">Total kg</th>
                        <th className="w-10 p-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.parts.map((part) => (
                        <tr key={part.id} className="border-b last:border-0">
                          <td className="p-2.5">
                            <p className="font-medium">
                              {part.name || SHAPES.find((s) => s.value === part.shape)?.label}
                            </p>
                            <p className="text-xs text-muted-foreground">{buildSpec(part)}</p>
                          </td>
                          <td className="p-2.5 text-right tabular-nums">{partPieces(part)}</td>
                          <td className="p-2.5 text-right tabular-nums">{unitWeight(part).toFixed(2)}</td>
                          <td className="p-2.5 text-right font-medium tabular-nums">{partTotalKg(part).toFixed(1)}</td>
                          <td className="p-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setData((d) => ({ ...d, parts: d.parts.filter((p) => p.id !== part.id) }))
                              }
                              aria-label="Remove member"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-baseline justify-between rounded-lg border border-dashed border-primary/50 bg-accent/50 px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Estimated material required
                </span>
                <span className="text-2xl font-bold tabular-nums text-primary">
                  {totals.totalKg.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">kg</span>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ── ② Rate + ③ Pricing ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">② Supplier rate · ③ Pricing</CardTitle>
              <p className="text-xs text-muted-foreground">
                Enter today's supplier rate. Overhead (labour + electricity) is applied automatically per kg.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Supplier rate (₹/kg, today)</Label>
                  <Input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={data.ratePerKg || ""}
                    onChange={(e) => setData((d) => ({ ...d, ratePerKg: num(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Job complexity (labour intensity)</Label>
                  <Select
                    value={String(data.complexity)}
                    onValueChange={(v) => setData((d) => ({ ...d, complexity: Number(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPLEXITY_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={String(c.value)}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Profit margin</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {marginPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setData((d) => ({ ...d, marginPct: preset }))}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm font-medium tabular-nums transition-colors",
                        data.marginPct === preset
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      {preset}%
                    </button>
                  ))}
                  <Input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    placeholder="Custom %"
                    className="w-28"
                    value={marginPresets.includes(data.marginPct) ? "" : data.marginPct || ""}
                    onChange={(e) => setData((d) => ({ ...d, marginPct: num(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Include fittings</p>
                      <p className="text-xs text-muted-foreground">needs fitters / mounting</p>
                    </div>
                    <Switch checked={fittingsOn} onCheckedChange={setFittingsOn} />
                  </div>
                  {fittingsOn && (
                    <Input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      placeholder="₹"
                      value={data.fittings || ""}
                      onChange={(e) => setData((d) => ({ ...d, fittings: num(e.target.value) }))}
                    />
                  )}
                </div>
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Include delivery</p>
                      <p className="text-xs text-muted-foreground">transport to site</p>
                    </div>
                    <Switch checked={deliveryOn} onCheckedChange={setDeliveryOn} />
                  </div>
                  {deliveryOn && (
                    <Input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      placeholder="₹"
                      value={data.delivery || ""}
                      onChange={(e) => setData((d) => ({ ...d, delivery: num(e.target.value) }))}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Extra services (cutting, welding, painting…)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        services: [...d.services, { id: crypto.randomUUID(), label: "", amount: 0 }],
                      }))
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Add line
                  </Button>
                </div>
                {data.services.map((svc) => (
                  <div key={svc.id} className="grid grid-cols-[1fr_110px_36px] gap-2">
                    <Input
                      placeholder="Service (e.g. Painting & primer)"
                      value={svc.label}
                      onChange={(e) => updateService(svc.id, { label: e.target.value })}
                    />
                    <Input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      placeholder="₹"
                      value={svc.amount || ""}
                      onChange={(e) => updateService(svc.id, { amount: num(e.target.value) })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setData((d) => ({ ...d, services: d.services.filter((s) => s.id !== svc.id) }))
                      }
                      aria-label="Remove service"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>GST (%) — set 0 to quote without tax</Label>
                  <Input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={data.gstPct || ""}
                    onChange={(e) => setData((d) => ({ ...d, gstPct: num(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3.5 py-2.5 text-xs text-muted-foreground">
                <span>
                  Overhead: ({data.overhead.labourPerMonth.toLocaleString("en-IN")} +{" "}
                  {data.overhead.elecPerMonth.toLocaleString("en-IN")}) ÷{" "}
                  {data.overhead.throughputKg.toLocaleString("en-IN")} kg ={" "}
                  <span className="font-medium text-foreground">
                    ₹{totals.perKgBaseOverhead.toFixed(2)}/kg
                  </span>{" "}
                  × complexity
                </span>
                {isNew && (
                  <Link to="/settings" className="flex items-center gap-1 font-medium text-primary">
                    <Settings2 className="h-3.5 w-3.5" /> Change in Settings
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notes for client</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={3}
                placeholder="Payment terms, delivery time, warranty…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>

        {/* ── Breakdown — sticky on desktop ── */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quotation breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Material{" "}
                  {totals.totalKg > 0 && (
                    <span className="text-xs">
                      ({totals.totalKg.toFixed(0)}kg × ₹{data.ratePerKg})
                    </span>
                  )}
                </span>
                <span>{formatINR(totals.material)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Overhead{" "}
                  {totals.totalKg > 0 && (
                    <span className="text-xs">
                      ({totals.totalKg.toFixed(0)}kg × ₹{totals.perKgOverhead.toFixed(1)})
                    </span>
                  )}
                </span>
                <span>{formatINR(totals.overhead)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fittings</span>
                <span>{formatINR(totals.fittings)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery</span>
                <span>{formatINR(totals.delivery)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Extra services</span>
                <span>{formatINR(totals.services)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Subtotal (cost)</span>
                <span>{formatINR(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profit @ {data.marginPct}%</span>
                <span className="font-medium text-warning">{formatINR(totals.profit)}</span>
              </div>
              {data.gstPct > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST ({data.gstPct}%)</span>
                  <span>{formatINR(totals.gst)}</span>
                </div>
              )}
              <div className="mt-2 flex items-baseline justify-between rounded-lg bg-primary px-4 py-3 text-primary-foreground">
                <span className="text-xs font-medium uppercase tracking-wide">Final quotation</span>
                <span className="text-2xl font-bold">{formatINR(totals.total)}</span>
              </div>
              {totals.totalKg > 0 && (
                <p className="text-right text-xs text-muted-foreground">
                  Effective rate to customer: ₹{totals.effectivePerKg.toFixed(0)} / kg
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
