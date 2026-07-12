import type { Task, TaskCompletion } from "../types/todo";
import {
  getSession,
  getAllTasksByUserForSync,
  getAllCompletionsByUser,
  replaceTasksAndCompletionsFromServer,
  saveTask,
  saveCompletion,
  deleteCompletion,
} from "./db";
import { getApiBase } from "./apiBase";

export type SyncResult =
  | { ok: true; tasks: Task[]; completions: TaskCompletion[] }
  | { ok: false; reason: "no_session" | "busy" | "error"; message?: string };

async function doSync(userId: string): Promise<SyncResult> {
  const { refreshSession } = await import("./authService");
  let session = await getSession(userId);
  if (!session) return { ok: false, reason: "no_session" };
  if (!session.accessToken.startsWith("local_")) {
    const expiresSoon = new Date(session.expiresAt).getTime() - Date.now() < 60_000;
    if (expiresSoon) {
      const refreshed = await refreshSession();
      if (refreshed) session = refreshed.session;
    }
  }
  session = (await getSession(userId)) || session;
  if (!session) return { ok: false, reason: "no_session" };

  const syncStartedAt = new Date().toISOString();
  const [tasks, completions] = await Promise.all([
    getAllTasksByUserForSync(userId),
    getAllCompletionsByUser(userId),
  ]);
  const snapshotCompIds = new Set(completions.map((c) => c.id));
  const snapshotTaskIds = new Set(tasks.map((t) => t.id));

  const body = {
    tasks: tasks.map((t) => ({
      id: t.id,
      userId: t.userId,
      title: t.title,
      description: t.description,
      type: t.type,
      category: t.category,
      priority: t.priority ?? "medium",
      date: t.date,
      time: t.time,
      startTime: t.startTime,
      endTime: t.endTime,
      isRepeating: t.isRepeating,
      repeatDays: t.repeatDays,
      endDate: t.endDate,
      status: t.status,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      deletedAt: t.deletedAt,
    })),
    completions: completions.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      userId: c.userId,
      date: c.date,
      status: c.status,
      completedAt: c.completedAt,
    })),
  };

  async function postSync(accessToken: string) {
    return fetch(`${getApiBase()}/api/tasks/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  }

  let res = await postSync(session.accessToken);

  if (res.status === 401 && !session.accessToken.startsWith("local_")) {
    const refreshed = await refreshSession();
    if (!refreshed) return { ok: false, reason: "no_session" };
    session = refreshed.session;
    res = await postSync(session.accessToken);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || (res.status === 401 ? "Unauthorized" : `Sync failed (${res.status})`));
  }
  const data = await res.json();
  const serverTasks: Task[] = data.tasks || [];
  const serverCompletions: TaskCompletion[] = data.completions || [];
  const rejectedTaskIds = new Set<string>(
    Array.isArray(data.rejectedTaskIds) ? data.rejectedTaskIds : []
  );

  const [liveTasks, liveComps] = await Promise.all([
    getAllTasksByUserForSync(userId),
    getAllCompletionsByUser(userId),
  ]);
  const liveCompIds = new Set(liveComps.map((c) => c.id));
  const rejectedLocals = liveTasks.filter((t) => rejectedTaskIds.has(t.id));

  await replaceTasksAndCompletionsFromServer(userId, serverTasks, serverCompletions);

  // Keep plan-limit-rejected tasks locally so they are not silently deleted
  for (const t of rejectedLocals) {
    await saveTask({ ...t, syncStatus: "pending" });
  }

  // Re-apply only true in-flight edits (newer than server, or created during this round-trip).
  // Do not resurrect tasks the server rejected (were in snapshot but missing from response).
  for (const t of liveTasks) {
    if (rejectedTaskIds.has(t.id)) continue;
    if (t.syncStatus !== "pending") continue;
    const s = serverTasks.find((x) => x.id === t.id);
    if (s && t.updatedAt && s.updatedAt && t.updatedAt > s.updatedAt) {
      await saveTask({ ...t, syncStatus: "pending" });
    } else if (!s && t.updatedAt && t.updatedAt > syncStartedAt && !snapshotTaskIds.has(t.id)) {
      await saveTask({ ...t, syncStatus: "pending" });
    }
  }
  for (const c of liveComps) {
    if (c.syncStatus !== "pending") continue;
    const s =
      serverCompletions.find((x) => x.id === c.id) ||
      serverCompletions.find((x) => x.taskId === c.taskId && x.date === c.date);
    if (s && c.completedAt && s.completedAt && c.completedAt > s.completedAt) {
      await saveCompletion({ ...c, syncStatus: "pending" });
    } else if (
      !s &&
      c.completedAt &&
      c.completedAt > syncStartedAt &&
      !snapshotCompIds.has(c.id)
    ) {
      await saveCompletion({ ...c, syncStatus: "pending" });
    }
  }
  for (const id of snapshotCompIds) {
    if (!liveCompIds.has(id) && serverCompletions.some((c) => c.id === id)) {
      await deleteCompletion(id);
    }
  }

  return { ok: true, tasks: serverTasks, completions: serverCompletions };
}

/** Sync under a cross-tab lock so overlapping replaces cannot clobber local DB. */
export async function syncTasksToServer(userId: string): Promise<SyncResult> {
  const lockName = `todo-sync-${userId}`;
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
      if (!lock) return { ok: false as const, reason: "busy" as const };
      return doSync(userId);
    });
  }

  // Fallback: localStorage lock with TTL
  const key = `todo-sync-lock:${userId}`;
  const now = Date.now();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number };
      if (now - parsed.at < 30_000) {
        return { ok: false, reason: "busy" };
      }
    }
    localStorage.setItem(key, JSON.stringify({ at: now }));
  } catch {
    // ignore storage errors
  }
  try {
    return await doSync(userId);
  } finally {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
