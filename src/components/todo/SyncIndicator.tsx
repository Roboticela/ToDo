import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { useSync } from "../../contexts/SyncContext";

function formatLastSync(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return d.toLocaleDateString();
}

export default function SyncIndicator() {
  const { isOnline, isSyncing, lastSyncAt, syncError, pendingCount } = useSync();

  const status = !isOnline
    ? "offline"
    : syncError
      ? "error"
      : isSyncing
        ? "syncing"
        : pendingCount > 0
          ? "pending"
          : "synced";

  const label =
    status === "offline"
      ? "Offline"
      : status === "error"
        ? syncError ?? "Sync failed"
        : status === "syncing"
          ? "Syncing..."
          : status === "pending"
            ? `${pendingCount} pending`
            : lastSyncAt
              ? formatLastSync(lastSyncAt)
              : "Synced";

  const style =
    status === "offline"
      ? { background: "rgba(239, 68, 68, 0.12)", color: "rgb(239, 68, 68)" }
      : status === "error"
        ? { background: "rgba(239, 68, 68, 0.12)", color: "rgb(239, 68, 68)" }
        : status === "syncing" || status === "pending"
          ? { background: "rgba(var(--color-primary), 0.12)", color: "var(--color-primary)" }
          : { background: "rgba(34, 197, 94, 0.12)", color: "rgb(34, 197, 94)" };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium leading-none min-w-[4.5rem]"
        style={style}
        title={lastSyncAt && status === "synced" ? `Last synced ${formatLastSync(lastSyncAt)}` : label}
      >
        {status === "offline" ? (
          <WifiOff className="w-3 h-3 shrink-0" />
        ) : status === "error" ? (
          <AlertCircle className="w-3 h-3 shrink-0" />
        ) : status === "syncing" ? (
          <RefreshCw className="w-3 h-3 shrink-0 animate-spin" />
        ) : status === "pending" ? (
          <Wifi className="w-3 h-3 shrink-0" />
        ) : (
          <CheckCircle className="w-3 h-3 shrink-0" />
        )}
        <span className="leading-none truncate max-w-[6rem]">{label}</span>
      </motion.div>
    </AnimatePresence>
  );
}
