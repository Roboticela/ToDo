import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { TaskProvider } from "../../contexts/TaskContext";
import BottomNav from "./BottomNav";
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
      <div className="min-h-screen bg-background flex flex-col max-w-2xl mx-auto">
        <div className="flex-1 pb-16">
          <Outlet />
        </div>
        <BottomNav />
      </div>
    </TaskProvider>
  );
}
