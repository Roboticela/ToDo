import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, User, Trash2 } from "lucide-react";
import {
  deleteAdminUser,
  fetchAdminUser,
  type AdminUserDetail,
} from "../../lib/adminApi";
import { cn } from "../../lib/utils";

function Field({ label, value }: { label: string; value: unknown }) {
  const display =
    value === null || value === undefined
      ? "—"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return (
    <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3">
      <dt className="text-xs font-semibold text-foreground/40 uppercase tracking-wider">{label}</dt>
      <dd className="text-sm text-foreground break-all whitespace-pre-wrap">{display}</dd>
    </div>
  );
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    document.title = "Admin — User";
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchAdminUser(id);
        if (!cancelled) setUser(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load user");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    setError("");
    try {
      await deleteAdminUser(id);
      navigate("/admin/users", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-primary">
          <ArrowLeft className="w-4 h-4" /> Back to users
        </Link>
        <p className="text-sm text-red-400">{error || "User not found"}</p>
      </div>
    );
  }

  const skipKeys = new Set(["counts", "avatarUrl", "name", "email", "id"]);
  const extraEntries = Object.entries(user).filter(([k]) => !skipKeys.has(k));

  return (
    <div className="space-y-5">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-foreground/55 hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> Users
      </Link>

      {error && (
        <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 overflow-hidden flex items-center justify-center shrink-0">
          {user.avatarUrl ? (
            <img
              src={String(user.avatarUrl)}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-8 h-8 text-primary/60" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-foreground truncate">{user.name}</h2>
          <p className="text-sm text-foreground/55 truncate">{user.email}</p>
          <p className="text-xs text-foreground/40 mt-1 font-mono truncate">{user.id}</p>
        </div>
      </div>

      {user.counts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              ["Tasks", user.counts.tasks],
              ["Sessions", user.counts.sessions],
              ["Subscriptions", user.counts.subscriptions],
              ["Completions", user.counts.completions],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="bg-card border border-border rounded-2xl px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40">
                {label}
              </p>
              <p className="text-lg font-bold tabular-nums text-foreground">{n}</p>
            </div>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <p className="text-xs font-semibold text-foreground/40 uppercase tracking-wider px-1">
          Profile
        </p>
        <dl className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/50">
          {extraEntries.map(([key, value]) => (
            <Field key={key} label={key} value={value} />
          ))}
        </dl>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold text-red-400/80 uppercase tracking-wider px-1">
          Danger
        </p>
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className={cn(
                "inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-medium",
                "bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
              )}
            >
              <Trash2 className="w-4 h-4" />
              Delete user
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-foreground/70">
                Permanently delete <span className="font-semibold">{user.email}</span> and all related
                data (tasks, sessions, subscriptions)? This cannot be undone.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="h-11 px-4 rounded-xl bg-red-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Confirm delete"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                  className="h-11 px-4 rounded-xl border border-border text-sm font-medium hover:bg-accent/30"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
