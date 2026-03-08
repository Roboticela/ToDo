import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { TaskProvider } from "../../contexts/TaskContext";
import BottomNav from "./BottomNav";
import SideNav from "./SideNav";
import { initNotificationScheduler, requestNotificationPermission } from "../../lib/notificationService";

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/auth/login", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      requestNotificationPermission().then(() => {
        initNotificationScheduler();
      });
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-border border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-foreground/50">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <TaskProvider>
      <div className="min-h-screen bg-background flex flex-col lg:flex-row w-full">
        <SideNav />
        <main className="flex-1 flex flex-col min-w-0 w-full max-w-2xl md:max-w-4xl lg:max-w-none mx-auto lg:mx-0 lg:pl-56">
          <div className="flex-1 pb-16 lg:pb-0 w-full min-w-0">
            <Outlet />
          </div>
          <BottomNav />
        </main>
      </div>
    </TaskProvider>
  );
}
