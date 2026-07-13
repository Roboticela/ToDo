import { getApiBase } from "./apiBase";
import { getAnySession } from "./db";

const API = () => getApiBase();

async function authHeaders(): Promise<HeadersInit> {
  const session = await getAnySession();
  if (!session?.accessToken) throw new Error("Not signed in");
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API()}/api/admin${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers || {}) },
    signal: init?.signal ?? AbortSignal.timeout(20000),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export type AdminTableInfo = { name: string; count: number };

export type AdminUserListItem = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  plan: string;
  effectivePlan: string;
  planExpiresAt: string | null;
  emailVerifiedAt: string | null;
  googleId: string | null;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
  counts?: {
    tasks: number;
    sessions: number;
    subscriptions: number;
    completions: number;
  };
};

export type AdminUserDetail = AdminUserListItem & Record<string, unknown>;

export async function fetchAdminTables(): Promise<AdminTableInfo[]> {
  const data = await adminFetch<{ tables: AdminTableInfo[] }>("/tables");
  return data.tables;
}

export async function fetchAdminUsers(opts: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ users: AdminUserListItem[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  if (opts.search) params.set("search", opts.search);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.pageSize) params.set("pageSize", String(opts.pageSize));
  const qs = params.toString();
  return adminFetch(`/users${qs ? `?${qs}` : ""}`);
}

export async function fetchAdminUser(id: string): Promise<AdminUserDetail> {
  const data = await adminFetch<{ user: AdminUserDetail }>(`/users/${encodeURIComponent(id)}`);
  return data.user;
}

export async function deleteAdminUser(id: string): Promise<void> {
  await adminFetch(`/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchAdminTableRows(
  model: string,
  opts: { page?: number; pageSize?: number; q?: string } = {}
): Promise<{
  model: string;
  idField: string;
  page: number;
  pageSize: number;
  total: number;
  rows: Record<string, unknown>[];
}> {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.pageSize) params.set("pageSize", String(opts.pageSize));
  if (opts.q) params.set("q", opts.q);
  const qs = params.toString();
  return adminFetch(`/tables/${encodeURIComponent(model)}${qs ? `?${qs}` : ""}`);
}

export async function fetchAdminTableRow(
  model: string,
  id: string
): Promise<{ model: string; idField: string; row: Record<string, unknown> }> {
  return adminFetch(`/tables/${encodeURIComponent(model)}/${encodeURIComponent(id)}`);
}

export async function deleteAdminTableRow(model: string, id: string): Promise<void> {
  await adminFetch(`/tables/${encodeURIComponent(model)}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export const ADMIN_TABLE_NAMES = [
  "User",
  "Session",
  "Task",
  "TaskCompletion",
  "Subscription",
  "PasswordResetToken",
  "DesktopAuthCode",
  "DesktopPendingAuth",
] as const;
