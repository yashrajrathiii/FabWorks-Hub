import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, HardHat, Calculator, LogOut, Flame } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients & Leads", icon: Users },
  { to: "/labour", label: "Labour", icon: HardHat },
  { to: "/quotations", label: "Quotations", icon: Calculator },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/clients": "Clients & Leads",
  "/labour": "Labour",
  "/quotations": "Quotations",
};

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const title =
    pageTitles[location.pathname] ??
    (location.pathname.startsWith("/quotations") ? "Quotations" : "FabWorks Hub");

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
            <Flame className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-white">FabWorks Hub</p>
            <p className="text-[11px] text-sidebar-foreground/60">Iron Fabrication</p>
          </div>
        </div>
        <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <p className="truncate text-xs font-medium text-white">{profile?.full_name || profile?.email}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="mt-2 w-full justify-start gap-2 px-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/95 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Flame className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold">FabWorks</span>
          </div>
          <h1 className="hidden text-lg font-semibold md:block">{title}</h1>
          <Button variant="ghost" size="icon" onClick={signOut} className="md:hidden" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card/95 backdrop-blur md:hidden">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            <Icon className="h-5 w-5" />
            {label.split(" ")[0]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
