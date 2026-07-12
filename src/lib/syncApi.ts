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

export async function syncTasksToServer(userId: string): Promise<{ tasks: Task[]; completions: TaskCompletion[] } | null> {
  // Refresh access token before sync if needed
  const { refreshSession } = await import("./authService");
  let session = await getSession(userId);
  if (!session) return null;
  if (!session.accessToken.startsWith("local_")) {
    const expiresSoon = new Date(session.expiresAt).getTime() - Date.now() < 60_000;
    if (expiresSoon) {
      const refreshed = await refreshSession();
      if (refreshed) session = refreshed.session;
    }
  }
  session = (await getSession(userId)) || session;
  if (!session) return null;

  const [tasks, completions] = await Promise.all([
    getAllTasksByUserForSync(userId),
    getAllCompletionsByUser(userId),
  ]);
  const snapshotCompIds = new Set(completions.map((c) => c.id));

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

  const res = await fetch(`${getApiBase()}/api/tasks/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || (res.status === 401 ? "Unauthorized" : `Sync failed (${res.status})`));
  }
  const data = await res.json();
  const serverTasks: Task[] = data.tasks || [];
  const serverCompletions: TaskCompletion[] = data.completions || [];

  // Capture local state after the round-trip (includes in-flight edits)
  const [liveTasks, liveComps] = await Promise.all([
    getAllTasksByUserForSync(userId),
    getAllCompletionsByUser(userId),
  ]);
  const liveCompIds = new Set(liveComps.map((c) => c.id));

  await replaceTasksAndCompletionsFromServer(userId, serverTasks, serverCompletions);

  // Re-apply in-flight local edits that are newer than the server snapshot
  for (const t of liveTasks) {
    if (t.syncStatus !== "pending") continue;
    const s = serverTasks.find((x) => x.id === t.id);
    if (!s || (t.updatedAt && s.updatedAt && t.updatedAt > s.updatedAt)) {
      await saveTask({ ...t, syncStatus: "pending" });
    }
  }
  for (const c of liveComps) {
    if (c.syncStatus !== "pending") continue;
    const s = serverCompletions.find((x) => x.id === c.id);
    if (!s || (c.completedAt && s.completedAt && c.completedAt > s.completedAt)) {
      await saveCompletion({ ...c, syncStatus: "pending" });
    }
  }
  // Re-delete completions removed locally after the outbound snapshot was taken
  for (const id of snapshotCompIds) {
    if (!liveCompIds.has(id) && serverCompletions.some((c) => c.id === id)) {
      await deleteCompletion(id);
    }
  }

  return { tasks: serverTasks, completions: serverCompletions };
}
