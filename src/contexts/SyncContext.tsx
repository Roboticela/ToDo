import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

interface SyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
  triggerSync: () => void;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const triggerSync = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const { getSyncQueue, removeSyncQueueItem } = await import("../lib/db");
      const queue = await getSyncQueue();
      for (const item of queue) {
        try {
          await new Promise((r) => setTimeout(r, 50));
          await removeSyncQueueItem(item.id);
        } catch {
          // Keep failed items in queue
        }
      }
      setPendingCount(0);
      setLastSyncAt(new Date().toISOString());
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

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
    <SyncContext.Provider value={{ isOnline, isSyncing, lastSyncAt, pendingCount, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used within SyncProvider");
  return context;
}
