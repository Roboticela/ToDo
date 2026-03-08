import { v4 as uuidv4 } from "./uuid";
import { format } from "date-fns";
import type { Task, TaskCompletion, TaskFormData, RepeatDay } from "../types/todo";
import {
  saveTask,
  getTasksByUserAndDate,
  getAllTasksByUser,
  getRepeatTasksByUser,
  deleteTask as dbDeleteTask,
  saveCompletion,
  getCompletionsByUserAndDate,
  getCompletionsByTask,
  getAllCompletionsByUser,
  deleteNotificationsByTask,
} from "./db";
import { scheduleTaskNotifications } from "./notificationService";

// ─── Create Task ───────────────────────────────────────────────────────────────

export async function createTask(userId: string, data: TaskFormData): Promise<Task> {
  const now = new Date().toISOString();
  const task: Task = {
    id: uuidv4(),
    userId,
    title: data.title,
    description: data.description,
    type: data.type,
    category: data.category,
    date: data.date,
    time: data.time,
    startTime: data.startTime,
    endTime: data.endTime,
    isRepeating: data.isRepeating,
    repeatDays: data.repeatDays,
    status: "pending",
    syncStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await saveTask(task);
  await scheduleTaskNotifications(task);
  return task;
}

// ─── Update Task ───────────────────────────────────────────────────────────────

export async function updateTask(task: Task, data: Partial<TaskFormData>): Promise<Task> {
  const updated: Task = {
    ...task,
    ...data,
    updatedAt: new Date().toISOString(),
    syncStatus: "pending",
  };
  await saveTask(updated);
  await deleteNotificationsByTask(task.id);
  await scheduleTaskNotifications(updated);
  return updated;
}

// ─── Delete Task ───────────────────────────────────────────────────────────────

export async function deleteTask(taskId: string): Promise<void> {
  await deleteNotificationsByTask(taskId);
  await dbDeleteTask(taskId);
}

// ─── Complete Task ─────────────────────────────────────────────────────────────

export async function completeTask(task: Task, date: string): Promise<void> {
  const now = new Date().toISOString();

  if (task.isRepeating) {
    // For repeating tasks, create a completion record for this specific date
    const completion: TaskCompletion = {
      id: uuidv4(),
      taskId: task.id,
      userId: task.userId,
      date,
      status: "completed",
      completedAt: now,
      syncStatus: "pending",
    };
    await saveCompletion(completion);
  } else {
    // For one-time tasks, update the task itself
    const updated: Task = {
      ...task,
      status: "completed",
      completedAt: now,
      updatedAt: now,
      syncStatus: "pending",
    };
    await saveTask(updated);
  }
}

// ─── Uncomplete Task ───────────────────────────────────────────────────────────

export async function uncompleteTask(task: Task, date: string): Promise<void> {
  if (task.isRepeating) {
    // Find and remove completion for this date
    const completions = await getCompletionsByTask(task.id);
    const comp = completions.find((c) => c.date === date);
    if (comp) {
      const { getDB } = await import("./db");
      const db = await getDB();
      await db.delete("completions", comp.id);
    }
  } else {
    const updated: Task = {
      ...task,
      status: "pending",
      completedAt: undefined,
      updatedAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    await saveTask(updated);
  }
}

// ─── Get Tasks for a Specific Date ────────────────────────────────────────────

export async function getTasksForDate(userId: string, date: string): Promise<Task[]> {
  const dayOfWeek = new Date(date + "T12:00:00").getDay() as RepeatDay;

  // Get tasks directly assigned to this date
  const directTasks = await getTasksByUserAndDate(userId, date);

  // Get repeating tasks that match this weekday
  const repeatTasks = await getRepeatTasksByUser(userId);
  const matchingRepeat = repeatTasks.filter((t) => t.repeatDays.includes(dayOfWeek));

  // Merge, avoiding duplicates
  const seen = new Set(directTasks.map((t) => t.id));
  const all = [...directTasks];
  for (const t of matchingRepeat) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      all.push(t);
    }
  }

  return all.sort((a, b) => {
    const timeA = a.time || a.startTime || "99:99";
    const timeB = b.time || b.startTime || "99:99";
    return timeA.localeCompare(timeB);
  });
}

// ─── Get Completion Status for a Date ─────────────────────────────────────────

export async function getTaskCompletionForDate(
  task: Task,
  date: string
): Promise<{ isCompleted: boolean; completionId?: string }> {
  if (task.isRepeating) {
    const completions = await getCompletionsByUserAndDate(task.userId, date);
    const comp = completions.find((c) => c.taskId === task.id);
    return { isCompleted: !!comp && comp.status === "completed", completionId: comp?.id };
  } else {
    return { isCompleted: task.status === "completed" };
  }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalyticsForDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{
  totalTasks: number;
  completedTasks: number;
  missedTasks: number;
  completionRate: number;
  dailyStats: Array<{ date: string; completed: number; total: number; rate: number }>;
}> {
  const allTasks = await getAllTasksByUser(userId);
  const allCompletions = await getAllCompletionsByUser(userId);

  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T23:59:59");
  const days: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(format(cur, "yyyy-MM-dd"));
    cur.setDate(cur.getDate() + 1);
  }

  let totalTasks = 0;
  let completedTasks = 0;
  const dailyStats: Array<{ date: string; completed: number; total: number; rate: number }> = [];

  for (const day of days) {
    const tasksForDay = await getTasksForDate(userId, day);
    const completionsForDay = allCompletions.filter(
      (c) => c.userId === userId && c.date === day && c.status === "completed"
    );

    let dayCompleted = 0;
    for (const task of tasksForDay) {
      totalTasks++;
      if (task.isRepeating) {
        const isComp = completionsForDay.some((c) => c.taskId === task.id);
        if (isComp) dayCompleted++;
      } else if (task.status === "completed") {
        dayCompleted++;
      }
    }

    completedTasks += dayCompleted;
    dailyStats.push({
      date: day,
      completed: dayCompleted,
      total: tasksForDay.length,
      rate: tasksForDay.length > 0 ? Math.round((dayCompleted / tasksForDay.length) * 100) : 0,
    });
  }

  const missedTasks = totalTasks - completedTasks;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return { totalTasks, completedTasks, missedTasks, completionRate, dailyStats };
}

// ─── Get Earliest Task Date ───────────────────────────────────────────────────

export async function getEarliestTaskDate(userId: string): Promise<string | null> {
  const tasks = await getAllTasksByUser(userId);
  if (tasks.length === 0) return null;
  const dates = tasks.map((t) => t.date).sort();
  return dates[0];
}

// ─── Date Helpers ──────────────────────────────────────────────────────────────

export function getTodayString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function getDateLabel(date: string): string {
  const today = getTodayString();
  const tomorrow = format(new Date(Date.now() + 86400000), "yyyy-MM-dd");
  const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");

  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  if (date === yesterday) return "Yesterday";

  return format(new Date(date + "T12:00:00"), "EEE, MMM d");
}

// ─── Export / Import ───────────────────────────────────────────────────────────

export interface ExportData {
  version: number;
  exportedAt: string;
  app: string;
  tasks: Task[];
}

const EXPORT_VERSION = 1;

export async function getExportData(userId: string): Promise<ExportData> {
  const tasks = await getAllTasksByUser(userId);
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "Roboticela ToDo",
    tasks,
  };
}

export async function importTasksFromData(
  userId: string,
  data: unknown
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  const parsed = data as ExportData;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tasks)) {
    return { imported: 0, errors: ["Invalid export file: missing or invalid tasks array."] };
  }
  let imported = 0;
  for (let i = 0; i < parsed.tasks.length; i++) {
    const t = parsed.tasks[i];
    if (!t || typeof t.title !== "string" || !t.title.trim()) {
      errors.push(`Row ${i + 1}: missing title`);
      continue;
    }
    const formData: TaskFormData = {
      title: t.title.trim(),
      description: t.description?.trim() || undefined,
      type: t.type ?? "daily",
      category: t.category ?? "do",
      date: t.date ?? getTodayString(),
      time: t.time,
      startTime: t.startTime,
      endTime: t.endTime,
      isRepeating: t.isRepeating ?? false,
      repeatDays: Array.isArray(t.repeatDays) ? (t.repeatDays as RepeatDay[]) : [],
    };
    try {
      await createTask(userId, formData);
      imported++;
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Failed to create task"}`);
    }
  }
  return { imported, errors };
}
