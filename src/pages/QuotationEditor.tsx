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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Loader2, Save } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { Client, QuoteData, QuoteItem, QuoteStatus, Quotation } from "@/types";

/**
 * NOTE: These are placeholder v1 formulas.
 * They will be replaced with the owner's original quotation-calculator logic
 * once it's provided — the layout and saving flow stay the same.
 */
const materials = ["MS Pipe", "MS Angle", "MS Channel", "MS Flat", "MS Sheet", "SS 304", "Other"];

function newItem(): QuoteItem {
  return {
    id: crypto.randomUUID(),
    description: "",
    material: "MS Pipe",
    quantity: 1,
    weightKg: 0,
    ratePerKg: 0,
  };
}

const defaultData: QuoteData = {
  items: [newItem()],
  labourCharge: 0,
  transportCharge: 0,
  otherCharge: 0,
  marginPct: 15,
  gstPct: 18,
};

function lineTotal(item: QuoteItem): number {
  return item.quantity * item.weightKg * item.ratePerKg;
}

function computeTotals(data: QuoteData) {
  const materialCost = data.items.reduce((sum, item) => sum + lineTotal(item), 0);
  const baseCost = materialCost + data.labourCharge + data.transportCharge + data.otherCharge;
  const margin = (baseCost * data.marginPct) / 100;
  const subtotal = baseCost + margin;
  const gst = (subtotal * data.gstPct) / 100;
  const total = subtotal + gst;
  return { materialCost, baseCost, margin, subtotal, gst, total };
}

function num(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
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
  const [data, setData] = useState<QuoteData>(defaultData);

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
    const d = existing.data;
    setData({
      ...defaultData,
      ...d,
      items: d.items?.length ? d.items : [newItem()],
    });
  }, [existing]);

  const totals = computeTotals(data);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const row = {
        client_id: clientId || null,
        client_name: clientName || clients.find((c) => c.id === clientId)?.name || "",
        project_title: projectTitle,
        data: data as unknown as Record<string, unknown>,
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

  function updateItem(itemId: string, patch: Partial<QuoteItem>) {
    setData((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
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

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Project details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="q-title">Project title</Label>
                <Input
                  id="q-title"
                  placeholder="e.g. Main gate + staircase railing"
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Materials</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setData((d) => ({ ...d, items: [...d.items, newItem()] }))}
              >
                <Plus className="h-3.5 w-3.5" /> Add item
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.items.map((item, idx) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Item {idx + 1}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{formatINR(lineTotal(item), true)}</p>
                      {data.items.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setData((d) => ({ ...d, items: d.items.filter((it) => it.id !== item.id) }))
                          }
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Input
                        placeholder="e.g. 2×2 square pipe frame"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, { description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Material</Label>
                      <Select value={item.material} onValueChange={(v) => updateItem(item.id, { material: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {materials.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        value={item.quantity || ""}
                        onChange={(e) => updateItem(item.id, { quantity: num(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Weight (kg)</Label>
                      <Input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        value={item.weightKg || ""}
                        onChange={(e) => updateItem(item.id, { weightKg: num(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Rate (₹/kg)</Label>
                      <Input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        value={item.ratePerKg || ""}
                        onChange={(e) => updateItem(item.id, { ratePerKg: num(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Charges & margin</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div className="space-y-1.5">
                <Label className="text-xs">Labour (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={data.labourCharge || ""}
                  onChange={(e) => setData((d) => ({ ...d, labourCharge: num(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Transport (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={data.transportCharge || ""}
                  onChange={(e) => setData((d) => ({ ...d, transportCharge: num(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Other (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={data.otherCharge || ""}
                  onChange={(e) => setData((d) => ({ ...d, otherCharge: num(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Margin (%)</Label>
                <Input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={data.marginPct || ""}
                  onChange={(e) => setData((d) => ({ ...d, marginPct: num(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">GST (%)</Label>
                <Input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={data.gstPct || ""}
                  onChange={(e) => setData((d) => ({ ...d, gstPct: num(e.target.value) }))}
                />
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

        {/* Summary — sticky on desktop, inline on mobile */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quote summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Material cost</span>
                <span>{formatINR(totals.materialCost, true)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Labour</span>
                <span>{formatINR(data.labourCharge, true)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transport + other</span>
                <span>{formatINR(data.transportCharge + data.otherCharge, true)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Margin ({data.marginPct}%)</span>
                <span>{formatINR(totals.margin, true)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Subtotal</span>
                <span>{formatINR(totals.subtotal, true)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST ({data.gstPct}%)</span>
                <span>{formatINR(totals.gst, true)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span className="text-primary">{formatINR(totals.total, true)}</span>
              </div>
              <p className="pt-2 text-[11px] leading-snug text-muted-foreground">
                Formulas are v1 placeholders — they'll be aligned with your original calculator.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
