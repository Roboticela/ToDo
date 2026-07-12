import { v4 as uuidv4 } from "./uuid";
import { format } from "date-fns";
import type { Task, TaskFormData, TaskPriority, RepeatDay } from "../types/todo";
import {
  saveTask,
  getTask,
  getTasksByUserAndDate,
  getAllTasksByUser,
  getRepeatTasksByUser,
  saveCompletion,
  getCompletionsByUserAndDate,
  getCompletionsByTask,
  getAllCompletionsByUser,
  deleteNotificationsByTask,
} from "./db";
import { scheduleTaskNotifications, cancelTimersForTask } from "./notificationService";

// ─── Create Task ───────────────────────────────────────────────────────────────

export async function createTask(userId: string, data: TaskFormData): Promise<Task> {
  const now = new Date().toISOString();
  const isRepeating = data.isRepeating && data.repeatDays.length > 0;
  const task: Task = {
    id: uuidv4(),
    userId,
    title: data.title,
    description: data.description,
    type: data.type,
    category: data.category,
    priority: data.priority ?? "medium",
    date: data.date,
    time: data.time,
    startTime: data.startTime,
    endTime: data.endTime,
    isRepeating,
    repeatDays: isRepeating ? data.repeatDays : [],
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
  const isRepeating =
    data.isRepeating !== undefined
      ? Boolean(data.isRepeating && (data.repeatDays ?? task.repeatDays).length > 0)
      : task.isRepeating;
  const repeatDays =
    data.isRepeating === false
      ? []
      : data.repeatDays !== undefined
        ? data.repeatDays
        : task.repeatDays;

  const updated: Task = {
    ...task,
    ...data,
    isRepeating,
    repeatDays: isRepeating ? repeatDays : [],
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
  const task = await getTask(taskId);
  if (task) {
    const now = new Date().toISOString();
    await saveTask({ ...task, deletedAt: now, updatedAt: now, syncStatus: "pending" });
  }
}

// ─── Complete Task ─────────────────────────────────────────────────────────────

/** One completion row per (taskId, date) — upsert to avoid duplicates. */
async function upsertCompletionForDate(
  task: Task,
  date: string,
  status: "completed" | "skipped"
): Promise<void> {
  const now = new Date().toISOString();
  const completions = await getCompletionsByTask(task.id);
  const existing = completions.find((c) => c.date === date);
  if (existing) {
    await saveCompletion({
      ...existing,
      status,
      completedAt: now,
      syncStatus: "pending",
    });
    // Clean up any duplicate rows for the same date
    for (const c of completions) {
      if (c.date === date && c.id !== existing.id) {
        const { deleteCompletion } = await import("./db");
        await deleteCompletion(c.id);
      }
    }
    return;
  }
  await saveCompletion({
    id: uuidv4(),
    taskId: task.id,
    userId: task.userId,
    date,
    status,
    completedAt: now,
    syncStatus: "pending",
  });
}

export async function completeTask(task: Task, date: string): Promise<void> {
  const now = new Date().toISOString();

  if (task.isRepeating) {
    await upsertCompletionForDate(task, date, "completed");
    await saveTask({
      ...task,
      updatedAt: now,
      syncStatus: "pending",
    });
  } else {
    const updated: Task = {
      ...task,
      status: "completed",
      completedAt: now,
      updatedAt: now,
      syncStatus: "pending",
    };
    await saveTask(updated);
  }

  // Stop pending reminders for this task (one-time) or reschedule remaining (repeating)
  await cancelTimersForTask(task.id);
  await deleteNotificationsByTask(task.id);
  if (task.isRepeating) {
    const fresh = await getTask(task.id);
    if (fresh) await scheduleTaskNotifications(fresh);
  }
}

// ─── Skip repeating task for one date (hide this occurrence only) ──────────────

export async function skipTaskForDate(task: Task, date: string): Promise<void> {
  if (!task.isRepeating) return;
  await upsertCompletionForDate(task, date, "skipped");
  await saveTask({
    ...task,
    updatedAt: new Date().toISOString(),
    syncStatus: "pending",
  });
}

// ─── Set end date for repeating task (stops showing after this date) ────────────

export async function setTaskEndDate(task: Task, endDate: string): Promise<Task> {
  const updated: Task = {
    ...task,
    endDate,
    updatedAt: new Date().toISOString(),
    syncStatus: "pending",
  };
  await saveTask(updated);
  return updated;
}

/**
 * Stop a repeating series starting at `fromDate` (inclusive).
 * Sets endDate to the day before so fromDate and later no longer appear.
 */
export async function endRepeatingSeriesFromDate(task: Task, fromDate: string): Promise<Task> {
  const d = new Date(fromDate + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return setTaskEndDate(task, format(d, "yyyy-MM-dd"));
}

// ─── Uncomplete Task ───────────────────────────────────────────────────────────

export async function uncompleteTask(task: Task, date: string): Promise<void> {
  if (task.isRepeating) {
    const completions = await getCompletionsByTask(task.id);
    const comps = completions.filter((c) => c.date === date);
    const { deleteCompletion } = await import("./db");
    for (const comp of comps) {
      await deleteCompletion(comp.id);
    }
    await saveTask({
      ...task,
      updatedAt: new Date().toISOString(),
      syncStatus: "pending",
    });
  } else {
    const updated: Task = {
      ...task,
      status: "pending",
      completedAt: undefined,
      updatedAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    await saveTask(updated);
    await scheduleTaskNotifications(updated);
  }
}

// ─── Get Tasks for a Specific Date ────────────────────────────────────────────

export async function getTasksForDate(userId: string, date: string): Promise<Task[]> {
  const dayOfWeek = new Date(date + "T12:00:00").getDay() as RepeatDay;

  // One-time tasks assigned to this date only (repeating tasks use weekday matching below)
  const directTasks = (await getTasksByUserAndDate(userId, date)).filter((t) => !t.isRepeating);

  // Repeating tasks that match this weekday, on or after start date, and before/on endDate (if set)
  const repeatTasks = await getRepeatTasksByUser(userId);
  const dateCompletions = await getCompletionsByUserAndDate(userId, date);
  const skippedTaskIds = new Set(
    dateCompletions.filter((c) => c.status === "skipped").map((c) => c.taskId)
  );

  const matchingRepeat = repeatTasks.filter(
    (t) =>
      Array.isArray(t.repeatDays) &&
      t.repeatDays.includes(dayOfWeek) &&
      date >= t.date &&
      (!t.endDate || date <= t.endDate) &&
      !skippedTaskIds.has(t.id)
  );

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
  inProgressTasks: number;
  completionRate: number;
  doCompleted: number;
  doMissed: number;
  dontCompleted: number;
  dontMissed: number;
  dailyStats: Array<{
    date: string;
    completed: number;
    missed: number;
    inProgress: number;
    total: number;
    rate: number;
  }>;
}> {
  const allCompletions = await getAllCompletionsByUser(userId);
  const todayStr = getTodayString();

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
  let missedTasks = 0;
  let inProgressTasks = 0;
  let doCompleted = 0;
  let doMissed = 0;
  let dontCompleted = 0;
  let dontMissed = 0;
  const dailyStats: Array<{
    date: string;
    completed: number;
    missed: number;
    inProgress: number;
    total: number;
    rate: number;
  }> = [];

  for (const day of days) {
    const tasksForDay = await getTasksForDate(userId, day);
    const completionsForDay = allCompletions.filter(
      (c) => c.userId === userId && c.date === day && c.status === "completed"
    );

    let dayCompleted = 0;
    let dayMissed = 0;
    let dayInProgress = 0;
    for (const task of tasksForDay) {
      totalTasks++;
      const isCompleted = task.isRepeating
        ? completionsForDay.some((c) => c.taskId === task.id)
        : task.status === "completed";
      if (isCompleted) {
        dayCompleted++;
        if (task.category === "dont") dontCompleted++;
        else doCompleted++;
      } else if (day < todayStr) {
        dayMissed++;
        if (task.category === "dont") dontMissed++;
        else doMissed++;
      } else {
        dayInProgress++;
      }
    }

    completedTasks += dayCompleted;
    missedTasks += dayMissed;
    inProgressTasks += dayInProgress;
    dailyStats.push({
      date: day,
      completed: dayCompleted,
      missed: dayMissed,
      inProgress: dayInProgress,
      total: tasksForDay.length,
      rate: tasksForDay.length > 0 ? Math.round((dayCompleted / tasksForDay.length) * 100) : 0,
    });
  }

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    totalTasks,
    completedTasks,
    missedTasks,
    inProgressTasks,
    completionRate,
    doCompleted,
    doMissed,
    dontCompleted,
    dontMissed,
    dailyStats,
  };
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
  completions?: Array<{
    id: string;
    taskId: string;
    userId: string;
    date: string;
    status: string;
    completedAt: string;
  }>;
}

const EXPORT_VERSION = 2;

export async function getExportData(userId: string): Promise<ExportData> {
  const [tasks, completions] = await Promise.all([
    getAllTasksByUser(userId),
    getAllCompletionsByUser(userId),
  ]);
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "Roboticela ToDo",
    tasks,
    completions,
  };
}

export async function importTasksFromData(
  userId: string,
  data: unknown,
  plan?: string
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  const parsed = data as ExportData;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tasks)) {
    return { imported: 0, errors: ["Invalid export file: missing or invalid tasks array."] };
  }

  const { assertCanCreateTask } = await import("./planLimits");
  const { v4: uuidv4 } = await import("./uuid");
  let imported = 0;
  const idMap = new Map<string, string>();

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
      priority: (t.priority as TaskPriority) ?? "medium",
      date: t.date ?? getTodayString(),
      time: t.time,
      startTime: t.startTime,
      endTime: t.endTime,
      isRepeating: t.isRepeating ?? false,
      repeatDays: Array.isArray(t.repeatDays) ? (t.repeatDays as RepeatDay[]) : [],
    };
    try {
      await assertCanCreateTask(userId, plan, formData);
      const created = await createTask(userId, formData);
      if (t.id) idMap.set(t.id, created.id);
      if (t.endDate || t.status === "completed" || t.completedAt) {
        const patched: Task = {
          ...created,
          endDate: t.endDate,
          status: t.status === "completed" ? "completed" : created.status,
          completedAt: t.completedAt,
          updatedAt: new Date().toISOString(),
          syncStatus: "pending",
        };
        await saveTask(patched);
      }
      imported++;
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Failed to create task"}`);
    }
  }

  if (Array.isArray(parsed.completions)) {
    for (const c of parsed.completions) {
      if (!c?.taskId || !c?.date || !c?.status) continue;
      const newTaskId = idMap.get(c.taskId);
      if (!newTaskId) continue;
      try {
        await saveCompletion({
          id: uuidv4(),
          taskId: newTaskId,
          userId,
          date: c.date,
          status: c.status as "completed" | "missed" | "skipped",
          completedAt: c.completedAt || new Date().toISOString(),
          syncStatus: "pending",
        });
      } catch {
        // skip bad completion rows
      }
    }
  }

  return { imported, errors };
}
