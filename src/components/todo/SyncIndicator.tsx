import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, RefreshCw, CheckCircle } from "lucide-react";
import { useSync } from "../../contexts/SyncContext";

export default function SyncIndicator() {
  const { isOnline, isSyncing, pendingCount } = useSync();

  return (
    <AnimatePresence>
      {(!isOnline || isSyncing || pendingCount > 0) && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{
            background: isOnline
              ? pendingCount > 0
                ? "rgba(var(--color-primary), 0.12)"
                : "rgba(34, 197, 94, 0.12)"
              : "rgba(239, 68, 68, 0.12)",
            color: isOnline
              ? pendingCount > 0
                ? "var(--color-primary)"
                : "rgb(34, 197, 94)"
              : "rgb(239, 68, 68)",
          }}
        >
          {!isOnline ? (
            <>
              <WifiOff className="w-3 h-3" />
              <span>Offline</span>
            </>
          ) : isSyncing ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Syncing...</span>
            </>
          ) : pendingCount > 0 ? (
            <>
              <Wifi className="w-3 h-3" />
              <span>{pendingCount} pending</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-3 h-3" />
              <span>Synced</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
