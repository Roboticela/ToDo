import { memo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Calendar, BarChart3, User } from "lucide-react";
import { cn } from "../../lib/utils";

const NAV_ITEMS = [
  { path: "/todo", label: "Today", icon: Home },
  { path: "/todo/calendar", label: "Calendar", icon: Calendar },
  { path: "/todo/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/todo/profile", label: "Profile", icon: User },
];

function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/80 backdrop-blur-xl safe-area-bottom">
      <div className="flex items-center justify-around h-16 w-full max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto px-4 md:px-6">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 relative transition-colors",
                isActive ? "text-primary" : "text-foreground/40 hover:text-foreground/70"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
              <motion.div
                animate={{ scale: isActive ? 1.1 : 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              </motion.div>
              <span className={cn("text-[10px] font-medium", isActive ? "text-primary" : "")}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default memo(BottomNav);
