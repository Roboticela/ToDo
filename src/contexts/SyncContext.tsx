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

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const scheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInProgressRef = useRef(false);

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) return;
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    setSyncError(null);
    setIsSyncing(true);
    try {
      if (user) {
        const result = await syncTasksToServer(user.id);
        if (result) {
          setLastSyncAt(new Date().toISOString());
          setSyncError(null);
          window.dispatchEvent(new CustomEvent("tasks-synced"));
        } else {
          setSyncError("Sync failed");
        }
      }
      const { getSyncQueue, removeSyncQueueItem } = await import("../lib/db");
      const queue = await getSyncQueue();
      for (const item of queue) {
        try {
          await new Promise((r) => setTimeout(r, 50));
          await removeSyncQueueItem(item.id);
        } catch {
          // keep failed items
        }
      }
      setPendingCount(0);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      syncInProgressRef.current = false;
      setIsSyncing(false);
    }
  }, [user]);

  const scheduleSync = useCallback(() => {
    if (scheduleRef.current) clearTimeout(scheduleRef.current);
    scheduleRef.current = setTimeout(() => {
      scheduleRef.current = null;
      triggerSync();
    }, SCHEDULED_SYNC_DEBOUNCE_MS);
  }, [triggerSync]);

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
  }, [user]);

  useEffect(() => {
    async function checkPending() {
      try {
        const { getSyncQueue } = await import("../lib/db");
        const queue = await getSyncQueue();
        setPendingCount(queue.length);
      } catch {
        // ignore
      }
    }
    checkPending();
    const interval = setInterval(checkPending, 30000);
    return () => clearInterval(interval);
  }, []);

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
