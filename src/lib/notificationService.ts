import type { Task, ScheduledNotification } from "../types/todo";
import {
  saveNotification,
  getPendingNotifications,
  markNotificationFired,
  getTask,
  deleteNotificationsByTask,
  getUser,
} from "./db";
import { v4 as uuidv4 } from "./uuid";
import { format, addDays } from "date-fns";
import { playNotificationSound } from "./notificationSound";

let notificationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

const ICON = "/favicon.svg";
/** How many weeks ahead to schedule repeating timed reminders */
const REPEAT_WEEKS_AHEAD = 8;

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function isNotificationSupported(): boolean {
  return "Notification" in window;
}

/** Occurrence dates to schedule for a task (one-time = [date]; repeating = matching weekdays). */
function getOccurrenceDates(task: Task): string[] {
  if (!task.isRepeating || !task.repeatDays?.length) {
    return [task.date];
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const start = task.date > today ? task.date : today;
  const horizon = format(addDays(new Date(), REPEAT_WEEKS_AHEAD * 7), "yyyy-MM-dd");
  const end = task.endDate && task.endDate < horizon ? task.endDate : horizon;

  const dates: string[] = [];
  let cur = new Date(start + "T12:00:00");
  const endDate = new Date(end + "T12:00:00");
  while (cur <= endDate) {
    const ymd = format(cur, "yyyy-MM-dd");
    const dow = cur.getDay();
    if (task.repeatDays.includes(dow as 0 | 1 | 2 | 3 | 4 | 5 | 6) && ymd >= task.date) {
      dates.push(ymd);
    }
    cur = addDays(cur, 1);
  }
  return dates;
}

export async function scheduleTaskNotifications(task: Task): Promise<void> {
  if (task.type === "daily") return;
  // One-time tasks that are already done should not get reminders
  if (!task.isRepeating && task.status === "completed") return;

  const user = await getUser(task.userId);
  if (user && user.taskNotificationsEnabled === false) return;

  const now = new Date();
  const occurrenceDates = getOccurrenceDates(task);
  const notifs: ScheduledNotification[] = [];

  // Skip dates that already have a completion/skip record
  let doneDates = new Set<string>();
  if (task.isRepeating) {
    const { getCompletionsByTask } = await import("./db");
    const comps = await getCompletionsByTask(task.id);
    doneDates = new Set(
      comps
        .filter((c) => c.status === "completed" || c.status === "skipped")
        .map((c) => c.date)
    );
  }

  for (const date of occurrenceDates) {
    if (doneDates.has(date)) continue;
    if (task.type === "time-based" && task.time) {
      const scheduledAt = new Date(`${date}T${task.time}:00`);
      if (scheduledAt > now) {
        notifs.push({
          id: uuidv4(),
          taskId: task.id,
          userId: task.userId,
          scheduledAt: scheduledAt.toISOString(),
          type: "reminder",
          fired: false,
        });
      }
    }

    if (task.type === "duration") {
      if (task.startTime) {
        const startAt = new Date(`${date}T${task.startTime}:00`);
        if (startAt > now) {
          notifs.push({
            id: uuidv4(),
            taskId: task.id,
            userId: task.userId,
            scheduledAt: startAt.toISOString(),
            type: "start",
            fired: false,
          });
        }
      }
      if (task.endTime) {
        let endAt = new Date(`${date}T${task.endTime}:00`);
        // Overnight duration: end time is next calendar day
        if (task.startTime && task.endTime <= task.startTime) {
          endAt = addDays(endAt, 1);
        }
        if (endAt > now) {
          notifs.push({
            id: uuidv4(),
            taskId: task.id,
            userId: task.userId,
            scheduledAt: endAt.toISOString(),
            type: "end",
            fired: false,
          });
        }
      }
    }
  }

  for (const notif of notifs) {
    await saveNotification(notif);
    scheduleLocalTimer(notif, task);
  }
}

function scheduleLocalTimer(notif: ScheduledNotification, task: Task): void {
  const delay = new Date(notif.scheduledAt).getTime() - Date.now();
  if (delay < 0) return;

  // Browsers clamp setTimeout; chain wake-ups for reminders further out
  const MAX_DELAY = 7 * 24 * 60 * 60 * 1000;
  if (delay > MAX_DELAY) {
    const timerId = setTimeout(() => {
      notificationTimers.delete(notif.id);
      scheduleLocalTimer(notif, task);
    }, MAX_DELAY);
    notificationTimers.set(notif.id, timerId);
    return;
  }

  const timerId = setTimeout(async () => {
    await fireNotification(notif, task);
    notificationTimers.delete(notif.id);
  }, delay);

  notificationTimers.set(notif.id, timerId);
}

async function fireNotification(notif: ScheduledNotification, task: Task): Promise<void> {
  const user = await getUser(task.userId);
  if (user && user.taskNotificationsEnabled === false) {
    await markNotificationFired(notif.id);
    return;
  }

  if (Notification.permission !== "granted") return;

  let title = task.title;
  let body = "";

  if (notif.type === "reminder") {
    body = `Time for: ${task.title}`;
    if (task.description) body += `\n${task.description}`;
  } else if (notif.type === "start") {
    title = `Starting: ${task.title}`;
    body = task.startTime ? `Starting at ${task.startTime}` : "Starting now";
  } else if (notif.type === "end") {
    title = `Ending: ${task.title}`;
    body = task.endTime ? `Ending at ${task.endTime}` : "Ending now";
  }

  const useCustomAudio =
    user?.notificationSoundMode === "ringtone" || user?.notificationSoundMode === "custom";

  try {
    new Notification(title, {
      body,
      icon: ICON,
      badge: ICON,
      tag: notif.id,
      requireInteraction: false,
      silent: useCustomAudio,
    });
  } catch {
    // Notification may fail in some environments
  }

  try {
    await playNotificationSound({
      mode: user?.notificationSoundMode ?? "normal",
      customSoundUrl: user?.customSoundUrl,
    });
  } catch {
    // Sound is best-effort
  }

  await markNotificationFired(notif.id);
}

export async function initNotificationScheduler(userId?: string): Promise<void> {
  const pending = await getPendingNotifications(userId);
  const now = new Date();

  for (const notif of pending) {
    const scheduledAt = new Date(notif.scheduledAt);
    if (scheduledAt <= now) {
      // Drop overdue pending rows so they don't accumulate forever
      await markNotificationFired(notif.id);
      continue;
    }

    const task = await getTask(notif.taskId);
    if (!task) {
      // Orphan reminder (task deleted remotely) — drop it
      await markNotificationFired(notif.id);
      continue;
    }
    scheduleLocalTimer(notif, task);
  }
}

/**
 * Wipe pending notification rows/timers and reschedule from current local tasks.
 * Call after sync so reminders match cross-device changes and orphans are gone.
 */
export async function rebuildNotificationsForUser(userId: string): Promise<void> {
  clearAllTimers();
  const pending = await getPendingNotifications();
  const taskIds = new Set(pending.map((n) => n.taskId));
  for (const taskId of taskIds) {
    await deleteNotificationsByTask(taskId);
  }
  const { getAllTasksByUser } = await import("./db");
  const tasks = await getAllTasksByUser(userId);
  for (const task of tasks) {
    await scheduleTaskNotifications(task);
  }
}

export function clearAllTimers(): void {
  for (const timer of notificationTimers.values()) {
    clearTimeout(timer);
  }
  notificationTimers.clear();
}

/** Clear in-memory timers for a task's pending notifications (call before deleting DB rows). */
export async function cancelTimersForTask(taskId: string): Promise<void> {
  const pending = await getPendingNotifications();
  for (const n of pending) {
    if (n.taskId !== taskId) continue;
    const timer = notificationTimers.get(n.id);
    if (timer) {
      clearTimeout(timer);
      notificationTimers.delete(n.id);
    }
  }
}
