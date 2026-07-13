// @refresh reset
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { syncTasksToServer } from "../lib/syncApi";

const BACKGROUND_SYNC_INTERVAL_MS = 60 * 1000; // 1 minute
const SCHEDULED_SYNC_DEBOUNCE_MS = 500; // when online, sync soon after changes

interface SyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  syncError: string | null;
  pendingCount: number;
  triggerSync: () => Promise<void>;
  scheduleSync: () => void;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

async function countPendingLocal(userId: string): Promise<number> {
  const { getAllTasksByUserForSync, getAllCompletionsByUser } = await import("../lib/db");
  const [tasks, comps] = await Promise.all([
    getAllTasksByUserForSync(userId),
    getAllCompletionsByUser(userId),
  ]);
  return (
    tasks.filter((t) => t.syncStatus === "pending").length +
    comps.filter((c) => c.syncStatus === "pending").length
  );
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const scheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInProgressRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    if (!user) {
      setPendingCount(0);
      return;
    }
    try {
      setPendingCount(await countPendingLocal(user.id));
    } catch {
      // ignore
    }
  }, [user]);

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) return;
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    setSyncError(null);
    setIsSyncing(true);
    try {
      if (user) {
        const result = await syncTasksToServer(user.id);
        if (result.ok) {
          setLastSyncAt(new Date().toISOString());
          setSyncError(null);
          window.dispatchEvent(new CustomEvent("tasks-synced"));
        } else if (result.reason === "busy") {
          // Another tab is syncing — not an error
          setSyncError(null);
        } else if (result.reason === "no_session") {
          setSyncError("Sign in again to sync");
        } else {
          setSyncError(result.message || "Sync failed");
        }
      }
      await refreshPendingCount();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      syncInProgressRef.current = false;
      setIsSyncing(false);
    }
  }, [user, refreshPendingCount]);

  const scheduleSync = useCallback(() => {
    if (scheduleRef.current) clearTimeout(scheduleRef.current);
    scheduleRef.current = setTimeout(() => {
      scheduleRef.current = null;
      triggerSync();
    }, SCHEDULED_SYNC_DEBOUNCE_MS);
    // Optimistic pending bump while waiting for debounce
    void refreshPendingCount();
  }, [triggerSync, refreshPendingCount]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [triggerSync]);

  useEffect(() => {
    if (!user || !navigator.onLine) return;
    const interval = setInterval(triggerSync, BACKGROUND_SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, triggerSync]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && user && navigator.onLine) {
        triggerSync();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user, triggerSync]);

  useEffect(() => {
    if (user && navigator.onLine) triggerSync();
  }, [user, triggerSync]);

  useEffect(() => {
    void refreshPendingCount();
    const onChanged = () => {
      void refreshPendingCount();
    };
    window.addEventListener("tasks-changed", onChanged);
    window.addEventListener("tasks-synced", onChanged);
    const interval = setInterval(() => {
      void refreshPendingCount();
    }, 30000);
    return () => {
      window.removeEventListener("tasks-changed", onChanged);
      window.removeEventListener("tasks-synced", onChanged);
      clearInterval(interval);
    };
  }, [refreshPendingCount]);

  return (
    <SyncContext.Provider value={{ isOnline, isSyncing, lastSyncAt, syncError, pendingCount, triggerSync, scheduleSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used within SyncProvider");
  return context;
}
