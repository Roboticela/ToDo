import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, User, ChevronRight } from "lucide-react";
import { fetchAdminUsers, type AdminUserListItem } from "../../lib/adminApi";
import { cn } from "../../lib/utils";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminUsers({ search: query || undefined, page, pageSize });
      setUsers(data.users);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    document.title = "Admin — Users";
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-bold text-foreground">Users</h2>
        <p className="text-sm text-foreground/55 mt-1">
          {total} account{total === 1 ? "" : "s"}
        </p>
      </header>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/35" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or id"
            className="w-full h-11 pl-10 pr-3 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-foreground/35 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          type="submit"
          className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Search
        </button>
      </form>

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
        <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/50">
          {users.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-foreground/45">No users found</p>
          ) : (
            users.map((u, i) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.02 }}
              >
                <Link
                  to={`/admin/users/${u.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent/30 transition-colors"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                    {u.avatarUrl ? (
                      <img
                        src={u.avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-5 h-5 text-primary/60" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{u.name}</p>
                    <p className="text-xs text-foreground/50 truncate">{u.email}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md",
                          "bg-accent/60 text-foreground/70"
                        )}
                      >
                        {u.plan}
                      </span>
                      {u.counts && (
                        <span className="text-[10px] text-foreground/40">
                          {u.counts.tasks} tasks · {u.counts.sessions} sessions
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-foreground/30 shrink-0" />
                </Link>
              </motion.div>
            ))
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-10 px-4 rounded-xl border border-border text-sm font-medium disabled:opacity-40 hover:bg-accent/30"
          >
            Previous
          </button>
          <span className="text-xs text-foreground/50 tabular-nums">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="h-10 px-4 rounded-xl border border-border text-sm font-medium disabled:opacity-40 hover:bg-accent/30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
