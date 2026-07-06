import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSettings, useSaveAppSettings, defaultSettings } from "@/hooks/useAppSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Save, KeyRound, UserRound } from "lucide-react";

function num(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function OverheadTab() {
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
  );
}

function AccountTab() {
  const { profile, user } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
  }, [profile?.full_name]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", user.id);
    setSavingName(false);
    if (error) toast.error(error.message);
    else toast.success("Name updated");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password changed");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="h-4 w-4 text-primary" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveName} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="a-name">Full name</Label>
                <Input id="a-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-email">Email</Label>
                <Input id="a-email" value={profile?.email ?? user?.email ?? ""} disabled />
                <p className="text-xs text-muted-foreground">Login email — can't be changed here.</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingName} className="gap-2">
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save profile
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" /> Change password
          </CardTitle>
          <p className="text-xs text-muted-foreground">At least 8 characters. You stay signed in after changing it.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="a-pw">New password</Label>
                <Input
                  id="a-pw"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-pw2">Confirm new password</Label>
                <Input
                  id="a-pw2"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingPassword || !newPassword} className="gap-2">
                {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Change password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="mx-auto max-w-2xl">
      <Tabs defaultValue="overhead">
        <TabsList className="mb-4 grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
          <TabsTrigger value="overhead">Overhead</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>
        <TabsContent value="overhead">
          <OverheadTab />
        </TabsContent>
        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
