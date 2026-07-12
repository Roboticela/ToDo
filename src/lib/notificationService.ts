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
import {
  ensureNotificationChannels,
  isNativePermissionGranted,
  requestNativeNotificationPermission,
  showTaskNotification,
  scheduleNativeNotification,
  cancelNativeNotification,
  cancelAllNativeNotifications,
} from "./nativeNotification";
import { isTauri } from "./tauri";

let notificationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

/** How many weeks ahead to schedule repeating timed reminders */
const REPEAT_WEEKS_AHEAD = 8;
/** Fire overdue reminders if missed by less than this (ms) instead of dropping them */
const OVERDUE_GRACE_MS = 30 * 60 * 1000;

export async function requestNotificationPermission(): Promise<boolean> {
  const granted = await requestNativeNotificationPermission();
  if (granted) await ensureNotificationChannels();
  return granted;
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
    await registerNativeBackup(notif, task);
  }
}

function notificationCopy(
  notif: ScheduledNotification,
  task: Task
): { title: string; body: string } {
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
  return { title, body };
}

/** OS-level schedule so reminders fire when the WebView is backgrounded/killed. */
async function registerNativeBackup(
  notif: ScheduledNotification,
  task: Task
): Promise<void> {
  if (!isTauri()) return;
  const user = await getUser(task.userId);
  const { title, body } = notificationCopy(notif, task);
  await scheduleNativeNotification({
    title,
    body,
    tag: notif.id,
    mode: user?.notificationSoundMode ?? "normal",
    customSoundUrl: user?.customSoundUrl,
    soundId: user?.notificationSoundId,
    scheduleAt: new Date(notif.scheduledAt),
  });
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

  const permitted = await isNativePermissionGranted().catch(() => false);
  if (!permitted) {
    // Still try web path if Notification.permission was granted outside plugin
    if (!("Notification" in window) || Notification.permission !== "granted") return;
  }

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

  try {
    await showTaskNotification({
      title,
      body,
      tag: notif.id,
      mode: user?.notificationSoundMode ?? "normal",
      customSoundUrl: user?.customSoundUrl,
      soundId: user?.notificationSoundId,
    });
  } catch {
    // Notification / sound may fail in some environments
  }

  await cancelNativeNotification(notif.id).catch(() => {});
  await markNotificationFired(notif.id);
}

export async function initNotificationScheduler(userId?: string): Promise<void> {
  const pending = await getPendingNotifications(userId);
  const now = Date.now();

  for (const notif of pending) {
    const scheduledAt = new Date(notif.scheduledAt).getTime();
    const task = await getTask(notif.taskId);
    if (!task) {
      await cancelNativeNotification(notif.id).catch(() => {});
      await markNotificationFired(notif.id);
      continue;
    }

    if (scheduledAt <= now) {
      // Fire recently missed reminders; drop ancient ones
      if (now - scheduledAt <= OVERDUE_GRACE_MS) {
        await fireNotification(notif, task);
      } else {
        await cancelNativeNotification(notif.id).catch(() => {});
        await markNotificationFired(notif.id);
      }
      continue;
    }

    scheduleLocalTimer(notif, task);
    await registerNativeBackup(notif, task);
  }
}

/**
 * Wipe pending notification rows/timers and reschedule from current local tasks.
 * Call after sync so reminders match cross-device changes and orphans are gone.
 */
export async function rebuildNotificationsForUser(userId: string): Promise<void> {
  clearAllTimers();
  await cancelAllNativeNotifications().catch(() => {});
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
