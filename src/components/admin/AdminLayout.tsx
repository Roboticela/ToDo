import { NavLink, Outlet, Navigate, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Database,
  ArrowLeft,
  Table2,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import { ADMIN_TABLE_NAMES } from "../../lib/adminApi";

const NAV = [
  { to: "/admin", end: true, label: "Overview", icon: LayoutDashboard },
  { to: "/admin/users", end: false, label: "Users", icon: Users },
];

export default function AdminLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center safe-area-top">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  if (!user?.isAdmin) {
    return <Navigate to="/todo" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col lg:flex-row safe-area-top">
      <aside className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-card/40 lg:min-h-screen">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-foreground/40 uppercase tracking-wider">
                Admin
              </p>
              <h1 className="text-lg font-bold text-foreground">Dashboard</h1>
            </div>
            <Link
              to="/todo/settings"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium text-foreground/60 hover:text-foreground hover:bg-accent/40 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              App
            </Link>
          </div>

          <nav className="space-y-1">
            {NAV.map(({ to, end, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-foreground/65 hover:bg-accent/40 hover:text-foreground"
                  )
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="pt-2">
            <p className="text-xs font-semibold text-foreground/40 uppercase tracking-wider px-1 mb-2 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              Tables
            </p>
            <nav className="space-y-0.5 max-h-[50vh] overflow-y-auto">
              {ADMIN_TABLE_NAMES.map((name) => (
                <NavLink
                  key={name}
                  to={`/admin/tables/${name}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "text-foreground/55 hover:bg-accent/40 hover:text-foreground"
                    )
                  }
                >
                  <Table2 className="w-3.5 h-3.5 shrink-0" />
                  {name}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="px-4 md:px-6 py-6 lg:max-w-5xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
