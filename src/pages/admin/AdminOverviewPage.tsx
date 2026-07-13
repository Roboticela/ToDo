import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, Database, Table2 } from "lucide-react";
import { fetchAdminTables, type AdminTableInfo } from "../../lib/adminApi";
import { cn } from "../../lib/utils";

export default function AdminOverviewPage() {
  const [tables, setTables] = useState<AdminTableInfo[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Admin — Overview";
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchAdminTables();
        if (!cancelled) setTables(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const userCount = tables.find((t) => t.name === "User")?.count ?? 0;

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-bold text-foreground">Overview</h2>
        <p className="text-sm text-foreground/55 mt-1">
          Database snapshot for support and debugging.
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <Link
            to="/admin/users"
            className="block bg-card border border-border rounded-2xl p-5 hover:bg-accent/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Users</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">{userCount}</p>
              </div>
            </div>
          </Link>

          <section className="space-y-2">
            <p className="text-xs font-semibold text-foreground/40 uppercase tracking-wider px-1 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              All tables
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tables.map((t, i) => (
                <motion.div
                  key={t.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Link
                    to={`/admin/tables/${t.name}`}
                    className={cn(
                      "flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3.5",
                      "hover:bg-accent/20 transition-colors"
                    )}
                  >
                    <Table2 className="w-4 h-4 text-foreground/40 shrink-0" />
                    <span className="flex-1 text-sm font-medium text-foreground truncate">
                      {t.name}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground/60">
                      {t.count}
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
