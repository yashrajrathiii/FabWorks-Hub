import { useEffect, useState } from "react";
import { useAppSettings, useSaveAppSettings, defaultSettings } from "@/hooks/useAppSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";

function num(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export default function Settings() {
  const { data: settings, isLoading } = useAppSettings();
  const saveMutation = useSaveAppSettings();
  const [form, setForm] = useState(defaultSettings);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const perKgBase = (form.labour_per_month + form.elec_per_month) / (form.throughput_kg || 1);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Overhead — monthly costs → per-kg rate</CardTitle>
          <p className="text-xs text-muted-foreground">
            These numbers drive the overhead line in every new quotation. Quotes already saved keep the
            values they were made with.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-labour">Labour / month (₹)</Label>
              <Input
                id="s-labour"
                type="number"
                min="0"
                inputMode="decimal"
                value={form.labour_per_month || ""}
                onChange={(e) => setForm({ ...form, labour_per_month: num(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-elec">Electricity / month (₹)</Label>
              <Input
                id="s-elec"
                type="number"
                min="0"
                inputMode="decimal"
                value={form.elec_per_month || ""}
                onChange={(e) => setForm({ ...form, elec_per_month: num(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-through">Material processed / month (kg)</Label>
              <Input
                id="s-through"
                type="number"
                min="1"
                inputMode="decimal"
                value={form.throughput_kg || ""}
                onChange={(e) => setForm({ ...form, throughput_kg: num(e.target.value) })}
              />
            </div>
          </div>

          <div className="rounded-lg border border-dashed bg-accent/50 px-4 py-3 text-sm">
            ({form.labour_per_month.toLocaleString("en-IN")} + {form.elec_per_month.toLocaleString("en-IN")}) ÷{" "}
            {form.throughput_kg.toLocaleString("en-IN")} kg ={" "}
            <span className="font-semibold text-primary">₹{perKgBase.toFixed(2)}/kg</span> base overhead
            <p className="mt-1 text-xs text-muted-foreground">
              The quotation calculator multiplies this by the job's complexity (1.0× – 2.5×).
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
