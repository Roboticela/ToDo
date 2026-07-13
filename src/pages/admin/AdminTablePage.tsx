import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  ADMIN_TABLE_NAMES,
  createAdminTableRow,
  deleteAdminTableRow,
  fetchAdminTableRows,
  updateAdminTableRow,
  type AdminField,
} from "../../lib/adminApi";
import AdminRecordForm from "../../components/admin/AdminRecordForm";
import { cn } from "../../lib/utils";

function previewColumns(row: Record<string, unknown>): [string, string][] {
  const preferred = [
    "id",
    "code",
    "requestId",
    "userId",
    "email",
    "title",
    "status",
    "plan",
    "date",
    "createdAt",
    "updatedAt",
    "expiresAt",
  ];
  const entries: [string, string][] = [];
  for (const key of preferred) {
    if (key in row) {
      const v = row[key];
      entries.push([
        key,
        v === null || v === undefined
          ? "—"
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v),
      ]);
    }
    if (entries.length >= 4) break;
  }
  if (entries.length === 0) {
    for (const [k, v] of Object.entries(row)) {
      entries.push([
        k,
        v === null || v === undefined
          ? "—"
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v),
      ]);
      if (entries.length >= 3) break;
    }
  }
  return entries;
}

export default function AdminTablePage() {
  const { model: modelParam } = useParams<{ model: string }>();
  const model = modelParam || "";
  const valid = (ADMIN_TABLE_NAMES as readonly string[]).includes(model);

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fields, setFields] = useState<AdminField[]>([]);
  const [idField, setIdField] = useState("id");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pageSize = 25;

  const load = useCallback(async () => {
    if (!valid) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminTableRows(model, {
        page,
        pageSize,
        q: query || undefined,
      });
      setRows(data.rows);
      setTotal(data.total);
      setIdField(data.idField);
      setFields(data.fields || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load table");
    } finally {
      setLoading(false);
    }
  }, [model, page, query, valid]);

  useEffect(() => {
    document.title = `Admin — ${model || "Table"}`;
    setPage(1);
    setQuery("");
    setSearch("");
    setExpanded(null);
    setEditingId(null);
    setCreating(false);
  }, [model]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(rowId: string) {
    if (!window.confirm(`Delete this ${model} row?\n${idField}=${rowId}`)) return;
    setDeletingId(rowId);
    setError("");
    try {
      await deleteAdminTableRow(model, rowId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate(data: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      await createAdminTableRow(model, data);
      setCreating(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(rowId: string, data: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      await updateAdminTableRow(model, rowId, data);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  if (!valid) {
    return (
      <p className="text-sm text-red-400">Unknown table. Pick one from the sidebar.</p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground font-mono">{model}</h2>
          <p className="text-sm text-foreground/55 mt-1">
            {total} row{total === 1 ? "" : "s"} · primary key{" "}
            <span className="font-mono">{idField}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setEditingId(null);
            setExpanded(null);
          }}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New row
        </button>
      </header>

      {creating && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Create {model}</p>
          <AdminRecordForm
            key={`create-${model}`}
            fields={fields}
            initial={{}}
            idField={idField}
            mode="create"
            saving={saving}
            onCancel={() => setCreating(false)}
            onSave={handleCreate}
          />
        </div>
      )}

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
            placeholder="Search…"
            className="w-full h-11 pl-10 pr-3 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-foreground/35 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          type="submit"
          className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
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
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl px-4 py-10 text-center text-sm text-foreground/45">
              No rows
            </div>
          ) : (
            rows.map((row) => {
              const rowId = String(row[idField] ?? "");
              const isOpen = expanded === rowId;
              const isEditing = editingId === rowId;
              const cols = previewColumns(row);
              return (
                <div
                  key={rowId || JSON.stringify(row).slice(0, 40)}
                  className="bg-card border border-border rounded-2xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(isOpen ? null : rowId);
                      if (isEditing) setEditingId(null);
                    }}
                    className="w-full text-left px-4 py-3.5 hover:bg-accent/20 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        {cols.map(([k, v]) => (
                          <p key={k} className="text-xs truncate">
                            <span className="text-foreground/40 font-medium">{k}: </span>
                            <span className="text-foreground font-mono">{v}</span>
                          </p>
                        ))}
                      </div>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-foreground/35 shrink-0 mt-0.5" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-foreground/35 shrink-0 mt-0.5" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/60 px-4 py-3 space-y-3 bg-accent/10">
                      {isEditing ? (
                        <AdminRecordForm
                          key={`edit-${rowId}`}
                          fields={fields}
                          initial={row}
                          idField={idField}
                          mode="edit"
                          saving={saving}
                          onCancel={() => setEditingId(null)}
                          onSave={(data) => handleUpdate(rowId, data)}
                        />
                      ) : (
                        <>
                          <pre className="text-[11px] leading-relaxed text-foreground/80 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                            {JSON.stringify(row, null, 2)}
                          </pre>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setCreating(false);
                                setEditingId(rowId);
                              }}
                              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            {model !== "User" && rowId && (
                              <button
                                type="button"
                                disabled={deletingId === rowId}
                                onClick={() => handleDelete(rowId)}
                                className={cn(
                                  "inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium",
                                  "bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                                )}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                {deletingId === rowId ? "Deleting…" : "Delete"}
                              </button>
                            )}
                            {model === "User" && (
                              <p className="text-xs text-foreground/45 self-center">
                                Prefer Users page for avatar/billing-safe user delete.
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
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
