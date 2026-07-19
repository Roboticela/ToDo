// @refresh reset
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { syncTasksToServer } from "../lib/syncApi";

// Background polling only exists as a fallback to pick up changes made on other
// devices — most syncing happens on demand (local edits, reconnect, tab focus),
// so this can be infrequent without hurting freshness.
const BACKGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SCHEDULED_SYNC_DEBOUNCE_MS = 500; // when online, sync soon after changes

// Opportunistic syncs (interval / tab focus / reconnect) are throttled so that
// switching tabs, waking the laptop, etc. can't fire off a full sync round-trip
// more than once per this window when there is nothing local to push.
const MIN_OPPORTUNISTIC_GAP_MS = 20 * 1000;
// If sync keeps failing (bad connection, server down, etc.) back off instead of
// hammering the network/server on every retry.
const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 10 * 60 * 1000;

interface SyncStateType {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  syncError: string | null;
  pendingCount: number;
}

interface SyncActionsType {
  triggerSync: (opts?: { force?: boolean }) => Promise<void>;
  scheduleSync: () => void;
}

type SyncContextType = SyncStateType & SyncActionsType;

const SyncStateContext = createContext<SyncStateType | undefined>(undefined);
const SyncActionsContext = createContext<SyncActionsType | undefined>(undefined);

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
  const userId = user?.id ?? null;
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const scheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInProgressRef = useRef(false);
  const pendingCountRef = useRef(0);
  const lastAttemptAtRef = useRef(0);
  const failureCountRef = useRef(0);
  const backoffUntilRef = useRef(0);

  useEffect(() => {
    pendingCountRef.current = pendingCount;
  }, [pendingCount]);

  const refreshPendingCount = useCallback(async () => {
    if (!userId) {
      setPendingCount(0);
      return;
    }
    try {
      setPendingCount(await countPendingLocal(userId));
    } catch {
      // ignore
    }
  }, [userId]);

  const triggerSync = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force ?? false;
    if (!navigator.onLine) return;
    if (syncInProgressRef.current) return;

    const now = Date.now();
    if (!force) {
      // Nothing local to push and we checked the server recently — skip this
      // round-trip. Real edits (scheduleSync) and manual "Sync" clicks always
      // pass force so they're never dropped.
      if (pendingCountRef.current === 0 && now - lastAttemptAtRef.current < MIN_OPPORTUNISTIC_GAP_MS) {
        return;
      }
      if (now < backoffUntilRef.current) return;
    }

    lastAttemptAtRef.current = now;
    syncInProgressRef.current = true;
    setSyncError(null);
    setIsSyncing(true);
    try {
      if (userId) {
        const result = await syncTasksToServer(userId);
        if (result.ok) {
          failureCountRef.current = 0;
          backoffUntilRef.current = 0;
          setLastSyncAt(new Date().toISOString());
          setSyncError(null);
          window.dispatchEvent(new CustomEvent("tasks-synced"));
        } else if (result.reason === "busy") {
          // Another tab is syncing — not an error
          setSyncError(null);
        } else if (result.reason === "no_session") {
          setSyncError("Sign in again to sync");
        } else {
          failureCountRef.current += 1;
          backoffUntilRef.current =
            now + Math.min(BASE_BACKOFF_MS * 2 ** (failureCountRef.current - 1), MAX_BACKOFF_MS);
          setSyncError(result.message || "Sync failed");
        }
      }
      await refreshPendingCount();
    } catch (e) {
      failureCountRef.current += 1;
      backoffUntilRef.current =
        now + Math.min(BASE_BACKOFF_MS * 2 ** (failureCountRef.current - 1), MAX_BACKOFF_MS);
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      syncInProgressRef.current = false;
      setIsSyncing(false);
    }
  }, [userId, refreshPendingCount]);

  const scheduleSync = useCallback(() => {
    if (scheduleRef.current) clearTimeout(scheduleRef.current);
    scheduleRef.current = setTimeout(() => {
      scheduleRef.current = null;
      // Real local changes are pushed unconditionally (bypassing the
      // opportunistic throttle/backoff below).
      triggerSync({ force: true });
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

  // Fallback poll for changes made on other devices. Opportunistic — throttled
  // and backed off inside triggerSync — so it never spams the network.
  useEffect(() => {
    if (!userId || !navigator.onLine) return;
    const interval = setInterval(() => triggerSync(), BACKGROUND_SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, triggerSync]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && userId && navigator.onLine) {
        triggerSync();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [userId, triggerSync]);

  useEffect(() => {
    if (userId && navigator.onLine) triggerSync();
  }, [userId, triggerSync]);

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

  const stateValue = useMemo(
    () => ({ isOnline, isSyncing, lastSyncAt, syncError, pendingCount }),
    [isOnline, isSyncing, lastSyncAt, syncError, pendingCount]
  );

  const actionsValue = useMemo(
    () => ({ triggerSync, scheduleSync }),
    [triggerSync, scheduleSync]
  );

  return (
    <SyncActionsContext.Provider value={actionsValue}>
      <SyncStateContext.Provider value={stateValue}>{children}</SyncStateContext.Provider>
    </SyncActionsContext.Provider>
  );
}

/** Sync status (online / syncing / errors) — re-renders when those change. */
export function useSyncState() {
  const context = useContext(SyncStateContext);
  if (!context) throw new Error("useSyncState must be used within SyncProvider");
  return context;
}

/** Sync actions only — stable across isSyncing flips so task UI does not refresh. */
export function useSyncActions() {
  const context = useContext(SyncActionsContext);
  if (!context) throw new Error("useSyncActions must be used within SyncProvider");
  return context;
}

/** Combined hook for components that need both status and actions (e.g. header). */
export function useSync(): SyncContextType {
  return { ...useSyncState(), ...useSyncActions() };
}
