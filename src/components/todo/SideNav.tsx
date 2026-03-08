import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Calendar, BarChart3, User, CreditCard, LogOut } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";

const NAV_ITEMS = [
  { path: "/todo", label: "Today", icon: Home },
  { path: "/todo/calendar", label: "Calendar", icon: Calendar },
  { path: "/todo/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/todo/subscription", label: "Subscription", icon: CreditCard },
  { path: "/todo/profile", label: "Profile", icon: User },
];

export default function SideNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:fixed lg:top-14 lg:bottom-0 lg:left-0 z-40 border-r border-border bg-card/95 backdrop-blur-xl shrink-0">
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors relative",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/60 hover:text-foreground hover:bg-accent/50"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sideNavActive"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
              <span className={cn("flex items-center justify-center w-9 h-9 rounded-lg shrink-0", isActive ? "bg-primary/15" : "bg-transparent")}>
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              </span>
              <span className="font-medium text-sm truncate">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* User section at bottom */}
      {user && (
        <div className="shrink-0 border-t border-border/60 p-3 space-y-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center overflow-hidden shrink-0">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-primary/60" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm text-foreground truncate">{user.name}</p>
              <p className="text-xs text-foreground/50 truncate">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-accent/50 transition-colors border border-border/60"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}
    </aside>
  );
}
