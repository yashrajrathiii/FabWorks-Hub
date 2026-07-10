import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, createSignupClient, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, ShieldCheck, ShieldOff, UsersRound } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { Profile } from "@/types";

const emptyForm = { full_name: "", email: "", password: "", confirm: "" };

export default function UsersTab() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, created_at")
        .order("created_at");
      if (error) throw error;
      return data as Profile[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) => {
      // Create the account on a throwaway client so the admin session survives.
      const signupClient = createSignupClient();
      const { data, error } = await signupClient.auth.signUp({
        email: payload.email.trim(),
        password: payload.password,
        options: { data: { full_name: payload.full_name.trim() } },
      });
      if (error) throw error;
      const newId = data.user?.id;
      if (!newId) throw new Error("Account created but no user id returned — approve it from the list.");
      // Grant access straight away (created accounts default to 'pending').
      const { error: roleError } = await supabase.from("profiles").update({ role: "admin" }).eq("id", newId);
      if (roleError) {
        throw new Error(
          `Account created but granting access failed: ${roleError.message}. Use Approve in the list below.`
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("User created with access. Share the email and password with them.");
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.error(e.message);
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: "admin" | "pending" }) => {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profiles"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    addMutation.mutate(form);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersRound className="h-4 w-4 text-primary" /> Users with access
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Everyone here can use the whole app. "Pending" accounts exist but can't see any data until
              approved.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add user
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            users.map((u) => {
              const isSelf = u.id === currentUser?.id;
              return (
                <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {u.full_name || u.email}
                      {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.email} · added {formatDate(u.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={
                        u.role === "admin"
                          ? "border-0 bg-emerald-100 text-emerald-700"
                          : "border-0 bg-amber-100 text-amber-700"
                      }
                    >
                      {u.role === "admin" ? "Has access" : "Pending"}
                    </Badge>
                    {!isSelf &&
                      (u.role === "admin" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                          disabled={roleMutation.isPending}
                          onClick={() => roleMutation.mutate({ id: u.id, role: "pending" })}
                        >
                          <ShieldOff className="h-3.5 w-3.5" /> Revoke
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-success hover:text-success"
                          disabled={roleMutation.isPending}
                          onClick={() => roleMutation.mutate({ id: u.id, role: "admin" })}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" /> Approve
                        </Button>
                      ))}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">
          Adding users from the app needs <b>"Allow new users to sign up"</b> turned on in Supabase
          (Authentication → Sign In / Up). That's safe: new accounts start as "Pending" with no data
          access. If the new user can't log in, also turn off "Confirm email" there, or confirm them from
          the Supabase dashboard.
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Full name</Label>
              <Input
                id="u-name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email *</Label>
              <Input
                id="u-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="u-pw">Password *</Label>
                <Input
                  id="u-pw"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-pw2">Confirm *</Label>
                <Input
                  id="u-pw2"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Share these login details with the person — they can change the password later from
              Settings → Account.
            </p>
            <DialogFooter>
              <Button type="submit" disabled={addMutation.isPending} className="gap-2">
                {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create user with access
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
