import type { Task, TaskCompletion } from "../types/todo";
import {
  getSession,
  getAllTasksByUser,
  getAllCompletionsByUser,
  replaceTasksAndCompletionsFromServer,
} from "./db";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export async function syncTasksToServer(userId: string): Promise<{ tasks: Task[]; completions: TaskCompletion[] } | null> {
  const session = await getSession(userId);
  if (!session) return null;

  const [tasks, completions] = await Promise.all([
    getAllTasksByUser(userId),
    getAllCompletionsByUser(userId),
  ]);

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

  const res = await fetch(`${API_BASE}/api/tasks/sync`, {
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
  await replaceTasksAndCompletionsFromServer(userId, serverTasks, serverCompletions);
  return { tasks: serverTasks, completions: serverCompletions };
}
