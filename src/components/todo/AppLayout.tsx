import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { TaskProvider } from "../../contexts/TaskContext";
import BottomNav from "./BottomNav";
import SideNav from "./SideNav";
import TodoHeader from "./TodoHeader";
import VerificationBanner from "./VerificationBanner";
import { initNotificationScheduler, requestNotificationPermission, clearAllTimers, reconcileNotificationsForUser } from "../../lib/notificationService";

// Opacity-only transition to avoid layout/scroll jump when changing pages quickly
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const pageTransition = { type: "tween" as const, duration: 0.15, ease: "easeOut" as const };

function scrollMainToTop(el: HTMLDivElement | null) {
  if (!el) return;
  el.scrollTop = 0;
}

const ROUTE_TITLES: Record<string, string> = {
  "/todo": "Today",
  "/todo/calendar": "Calendar",
  "/todo/analytics": "Analytics",
  "/todo/subscription": "Subscription",
  "/todo/settings": "Settings",
  "/todo/profile": "Settings",
};

export default function AppLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainScrollRef = useRef<HTMLDivElement>(null);

  // Reset scroll to top when route changes so new page is visible (runs after DOM update and again after paint)
  useLayoutEffect(() => {
    scrollMainToTop(mainScrollRef.current);
    const raf = requestAnimationFrame(() => {
      scrollMainToTop(mainScrollRef.current);
      requestAnimationFrame(() => scrollMainToTop(mainScrollRef.current));
    });
    return () => cancelAnimationFrame(raf);
  }, [location.pathname]);

  const headerTitle = useMemo(
    () => ROUTE_TITLES[location.pathname] ?? "Today",
    [location.pathname]
  );

  useEffect(() => {
    document.title = `${headerTitle} - ToDo`;
  }, [headerTitle]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/auth/login", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  // New signups must pick a plan before using the app
  useEffect(() => {
    if (
      !isLoading &&
      isAuthenticated &&
      user?.plan === "pending" &&
      location.pathname !== "/todo/subscription"
    ) {
      navigate("/todo/subscription", { replace: true });
    }
  }, [isAuthenticated, isLoading, user?.plan, location.pathname, navigate]);

  useEffect(() => {
    if (isAuthenticated && user) {
      clearAllTimers();
      requestNotificationPermission()
        .then((granted) => {
          if (granted) {
            void import("../../lib/nativeNotification")
              .then((m) => m.ensureNotificationChannels())
              .catch(console.error);
          }
          initNotificationScheduler(user.id).catch(console.error);
        })
        .catch(console.error);
    }
    return () => clearAllTimers();
  }, [isAuthenticated, user]);

  // Re-arm timers when returning from background (browser tab / Android resume)
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const refresh = () => {
      void initNotificationScheduler(user.id);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isAuthenticated, user]);

  // Soft-reconcile reminders after sync (do not wipe timers — that was skipping fires)
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const reconcile = () => {
      void reconcileNotificationsForUser(user.id);
    };
    window.addEventListener("tasks-synced", reconcile);
    return () => window.removeEventListener("tasks-synced", reconcile);
  }, [isAuthenticated, user]);

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen bg-background flex items-center justify-center safe-area-top"
      >
        <div className="flex flex-col items-center gap-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 border-2 border-border border-t-primary rounded-full"
          />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-foreground/50"
          >
            Loading...
          </motion.p>
        </div>
      </motion.div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <TaskProvider>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="h-dvh min-h-dvh overflow-hidden flex flex-col w-full bg-background safe-area-top"
      >
        <VerificationBanner />
        <div className="flex-1 flex min-h-0 lg:flex-row w-full overflow-hidden">
          <SideNav />
          <main className="flex-1 flex flex-col min-h-0 min-w-0 w-full max-w-2xl md:max-w-4xl lg:max-w-none mx-auto lg:mx-0 lg:pl-56">
            <TodoHeader title={headerTitle} />
          <div
            ref={mainScrollRef}
            className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden pb-bottom-nav lg:pb-0 w-full custom-scrollbar"
          >
            <div className="min-h-full min-w-0 overflow-x-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={location.pathname}
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={pageTransition}
                  className="min-h-full min-w-0 flex flex-col overflow-x-hidden"
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
            <BottomNav />
          </main>
        </div>
      </motion.div>
    </TaskProvider>
  );
}
