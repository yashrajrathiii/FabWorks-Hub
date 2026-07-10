import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import StatusBadge from "@/components/StatusBadge";
import { formatDate, toLocalDateString } from "@/lib/format";
import { Users, HardHat, Calculator, TrendingUp, ArrowRight } from "lucide-react";
import type { Client, WorkerTask, Labourer } from "@/types";

interface DashboardStats {
  activeLeads: number;
  ongoingProjects: number;
  presentToday: number;
  activeWorkers: number;
  pendingQuotes: number;
  recentLeads: Client[];
  followUps: Client[];
  openTasks: (WorkerTask & { labourers: Pick<Labourer, "name"> | null })[];
}

const emptyStats: DashboardStats = {
  activeLeads: 0,
  ongoingProjects: 0,
  presentToday: 0,
  activeWorkers: 0,
  pendingQuotes: 0,
  recentLeads: [],
  followUps: [],
  openTasks: [],
};

async function fetchStats(): Promise<DashboardStats> {
  if (!isSupabaseConfigured) return emptyStats;
  const today = toLocalDateString();

  const [leads, projects, attendance, workers, quotes, recentLeads, followUps, openTasks] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).in("status", ["new_lead", "contacted", "quote_sent"]),
    supabase.from("clients").select("id", { count: "exact", head: true }).in("status", ["deal_closed", "in_progress"]),
    supabase.from("attendance").select("id", { count: "exact", head: true }).eq("date", today).in("status", ["present", "half_day"]),
    supabase.from("labourers").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("quotations").select("id", { count: "exact", head: true }).in("status", ["draft", "sent"]),
    supabase.from("clients").select("*").in("status", ["new_lead", "contacted", "quote_sent"]).order("created_at", { ascending: false }).limit(5),
    supabase.from("clients").select("*").lte("follow_up_date", today).not("status", "in", "(lost,completed)").order("follow_up_date").limit(5),
    supabase.from("worker_tasks").select("*, labourers(name)").neq("status", "completed").order("due_date", { ascending: true, nullsFirst: false }).limit(5),
  ]);

  return {
    activeLeads: leads.count ?? 0,
    ongoingProjects: projects.count ?? 0,
    presentToday: attendance.count ?? 0,
    activeWorkers: workers.count ?? 0,
    pendingQuotes: quotes.count ?? 0,
    recentLeads: (recentLeads.data as Client[]) ?? [],
    followUps: (followUps.data as Client[]) ?? [],
    openTasks: (openTasks.data as DashboardStats["openTasks"]) ?? [],
  };
}

export default function Dashboard() {
  const { data: stats = emptyStats } = useQuery({ queryKey: ["dashboard"], queryFn: fetchStats });

  const cards = [
    { label: "Active leads", value: stats.activeLeads, icon: TrendingUp, to: "/clients" },
    { label: "Ongoing projects", value: stats.ongoingProjects, icon: Users, to: "/clients" },
    {
      label: "Present today",
      value: `${stats.presentToday}/${stats.activeWorkers}`,
      icon: HardHat,
      to: "/labour",
    },
    { label: "Open quotations", value: stats.pendingQuotes, icon: Calculator, to: "/quotations" },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 md:space-y-8">
      {!isSupabaseConfigured && (
        <Alert>
          <AlertDescription>
            Backend not connected yet — data will appear once Supabase keys are added to <code>.env</code>.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, to }) => (
          <Link key={label} to={to}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-3 md:gap-5 p-4 md:p-6">
                <div className="flex h-10 w-10 md:h-16 md:w-16 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <Icon className="h-5 w-5 md:h-6 md:w-6 text-accent-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold leading-tight md:text-2xl lg:text-3xl">{value}</p>
                  <p className="truncate text-xs md:text-sm text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {stats.followUps.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="pb-3 md:pb-4 md:pt-6 md:px-5">
            <CardTitle className="text-base md:text-lg">Follow-ups due</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-5 md:px-5 md:pb-6">
            {stats.followUps.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 md:pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm md:text-base font-medium md:font-semibold">{c.name}</p>
                  <p className="truncate text-xs md:text-sm text-muted-foreground">
                    {[c.company, c.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 md:gap-3">
                  <span className="text-xs md:text-sm font-medium text-destructive">{formatDate(c.follow_up_date)}</span>
                  <StatusBadge status={c.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3 md:pb-4 md:pt-6 md:px-5">
            <CardTitle className="text-base md:text-lg">Recent leads</CardTitle>
            <Link to="/clients" className="flex items-center gap-1 text-xs md:text-sm font-medium text-primary">
              View all <ArrowRight className="h-3 w-3 md:h-4 md:w-4" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-5 md:px-5 md:pb-6">
            {stats.recentLeads.length === 0 && (
              <p className="py-6 text-center text-sm md:text-[15px] text-muted-foreground">No open leads yet.</p>
            )}
            {stats.recentLeads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 md:pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm md:text-base font-medium md:font-semibold">{lead.name}</p>
                  <p className="truncate text-xs md:text-sm text-muted-foreground">
                    {[lead.city, lead.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <StatusBadge status={lead.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3 md:pb-4 md:pt-6 md:px-5">
            <CardTitle className="text-base md:text-lg">Open worker tasks</CardTitle>
            <Link to="/labour" className="flex items-center gap-1 text-xs md:text-sm font-medium text-primary">
              View all <ArrowRight className="h-3 w-3 md:h-4 md:w-4" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-5 md:px-5 md:pb-6">
            {stats.openTasks.length === 0 && (
              <p className="py-6 text-center text-sm md:text-[15px] text-muted-foreground">No open tasks.</p>
            )}
            {stats.openTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 md:pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm md:text-base font-medium md:font-semibold">{task.title}</p>
                  <p className="truncate text-xs md:text-sm text-muted-foreground">
                    {task.labourers?.name ?? "Unassigned"} · due {formatDate(task.due_date)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
