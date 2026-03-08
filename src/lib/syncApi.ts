import type { Task, TaskCompletion } from "../types/todo";
import { getAnySession, getAllTasksByUser, getAllCompletionsByUser } from "./db";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export async function syncTasksToServer(userId: string): Promise<{ tasks: Task[]; completions: TaskCompletion[] } | null> {
  const session = await getAnySession();
  if (!session || session.userId !== userId) return null;

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

  if (!res.ok) return null;
  const data = await res.json();
  return { tasks: data.tasks || [], completions: data.completions || [] };
}
