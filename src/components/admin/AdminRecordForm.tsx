import { useMemo, useState } from "react";
import type { AdminField } from "../../lib/adminApi";
import { cn } from "../../lib/utils";

function valueToEditorString(value: unknown, type: string): string {
  if (value === null || value === undefined) return "";
  if (type === "intArray" || type === "json") {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }
  if (type === "boolean") return value === true ? "true" : value === false ? "false" : "";
  if (type === "datetime" && (value instanceof Date || typeof value === "string")) {
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return String(value);
}

function parseEditorValue(raw: string, field: AdminField): unknown {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "null") {
    return field.nullable ? null : trimmed === "" ? "" : null;
  }
  switch (field.type) {
    case "boolean":
      if (trimmed === "true") return true;
      if (trimmed === "false") return false;
      throw new Error(`${field.name} must be true or false`);
    case "number": {
      const n = Number(trimmed);
      if (Number.isNaN(n)) throw new Error(`${field.name} must be a number`);
      return n;
    }
    case "intArray":
    case "json":
      return JSON.parse(trimmed);
    default:
      return raw;
  }
}

type AdminRecordFormProps = {
  fields: AdminField[];
  initial: Record<string, unknown>;
  idField: string;
  mode: "create" | "edit";
  saving?: boolean;
  onCancel: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void> | void;
};

export default function AdminRecordForm({
  fields,
  initial,
  idField,
  mode,
  saving,
  onCancel,
  onSave,
}: AdminRecordFormProps) {
  const editableFields = useMemo(
    () =>
      fields.filter((f) => {
        if (f.name === "passwordHash") return false;
        if (mode === "edit" && f.readOnly) return false;
        if (mode === "create" && f.readOnly && f.name !== idField) return false;
        return true;
      }),
    [fields, mode, idField]
  );

  const [values, setValues] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const f of editableFields) {
      next[f.name] = valueToEditorString(initial[f.name], f.type);
    }
    return next;
  });
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data: Record<string, unknown> = {};
      for (const f of editableFields) {
        if (mode === "edit" && f.name === idField) continue;
        data[f.name] = parseEditorValue(values[f.name] ?? "", f);
      }
      await onSave(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid form data");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
        {editableFields.map((f) => {
          const isMultiline = f.type === "intArray" || f.type === "json" || f.name.includes("Token");
          const locked = mode === "edit" && f.name === idField;
          return (
            <label key={f.name} className="block space-y-1">
              <span className="text-[11px] font-semibold text-foreground/45 uppercase tracking-wider">
                {f.name}
                <span className="ml-1 font-normal normal-case text-foreground/30">
                  ({f.type}
                  {f.nullable ? ", nullable" : ""})
                </span>
              </span>
              {f.type === "boolean" ? (
                <select
                  value={values[f.name] ?? ""}
                  disabled={locked || saving}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm"
                >
                  {f.nullable && <option value="">null</option>}
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : isMultiline ? (
                <textarea
                  value={values[f.name] ?? ""}
                  disabled={locked || saving}
                  rows={3}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs font-mono"
                />
              ) : (
                <input
                  value={values[f.name] ?? ""}
                  disabled={locked || saving}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  placeholder={f.nullable ? "null if empty" : ""}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-mono disabled:opacity-50"
                />
              )}
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium",
            "disabled:opacity-50"
          )}
        >
          {saving ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-accent/30"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
