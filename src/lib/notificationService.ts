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
import { formatTime, localDateTime } from "./timeFormat";

let notificationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
let dueWatchdog: ReturnType<typeof setInterval> | null = null;
let firingIds = new Set<string>();

/** Stay under Android's 500 concurrent AlarmManager limit */
const MAX_NATIVE_ALARMS = 400;
/** Fire overdue reminders if missed by less than this (ms) instead of dropping them */
const OVERDUE_GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours
/** Poll for due reminders — WebView timers are unreliable when backgrounded/throttled */
const DUE_WATCHDOG_MS = 15_000;

let nativeSyncChain: Promise<void> = Promise.resolve();
let nativeSyncQueued = false;

export async function requestNotificationPermission(): Promise<boolean> {
  const granted = await requestNativeNotificationPermission();
  if (granted) await ensureNotificationChannels();
  return granted;
}

export function isNotificationSupported(): boolean {
  return "Notification" in window || isTauri();
}

/** Only schedule reminders for today (re-armed daily on app open / sync). */
function getOccurrenceDates(task: Task): string[] {
  const today = format(new Date(), "yyyy-MM-dd");

  if (!task.isRepeating || !task.repeatDays?.length) {
    return task.date === today ? [today] : [];
  }

  if (task.date > today) return [];
  if (task.endDate && task.endDate < today) return [];
  const dow = new Date(today + "T12:00:00").getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  if (!task.repeatDays.includes(dow)) return [];
  return [today];
}

async function buildNotificationsForTask(task: Task): Promise<ScheduledNotification[]> {
  if (task.type === "daily") return [];
  if (task.deletedAt) return [];
  if (!task.isRepeating && task.status === "completed") return [];

  const user = await getUser(task.userId);
  if (user && user.taskNotificationsEnabled === false) return [];

  const now = new Date();
  const occurrenceDates = getOccurrenceDates(task);
  const notifs: ScheduledNotification[] = [];

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
      const scheduledAt = localDateTime(date, task.time);
      if (scheduledAt && scheduledAt > now) {
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
        const startAt = localDateTime(date, task.startTime);
        if (startAt && startAt > now) {
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
        let endAt = localDateTime(date, task.endTime);
        if (!endAt) continue;
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

  return notifs;
}

function scheduleKey(n: { taskId: string; type: string; scheduledAt: string }): string {
  return `${n.taskId}|${n.type}|${n.scheduledAt}`;
}

export async function scheduleTaskNotifications(task: Task): Promise<void> {
  const notifs = await buildNotificationsForTask(task);
  for (const notif of notifs) {
    await saveNotification(notif);
    scheduleLocalTimer(notif, task);
  }
  queueNativeAlarmSync(task.userId);
}

function notificationCopy(
  notif: ScheduledNotification,
  task: Task,
  timeFormat: "12h" | "24h" = "12h"
): { title: string; body: string } {
  let title = task.title;
  let body = "";
  if (notif.type === "reminder") {
    body = `Time for: ${task.title}`;
    if (task.description) body += `\n${task.description}`;
  } else if (notif.type === "start") {
    title = `Starting: ${task.title}`;
    body = task.startTime
      ? `Starting at ${formatTime(task.startTime, timeFormat)}`
      : "Starting now";
  } else if (notif.type === "end") {
    title = `Ending: ${task.title}`;
    body = task.endTime
      ? `Ending at ${formatTime(task.endTime, timeFormat)}`
      : "Ending now";
  }
  return { title, body };
}

function queueNativeAlarmSync(userId?: string): void {
  if (!isTauri()) return;
  nativeSyncQueued = true;
  nativeSyncChain = nativeSyncChain
    .then(async () => {
      if (!nativeSyncQueued) return;
      nativeSyncQueued = false;
      await syncNativeAlarms(userId);
      if (nativeSyncQueued) {
        nativeSyncQueued = false;
        await syncNativeAlarms(userId);
      }
    })
    .catch(() => {
      // ignore — next queue will retry
    });
}

async function syncNativeAlarms(userId?: string): Promise<void> {
  if (!isTauri()) return;

  await cancelAllNativeNotifications().catch(() => {});

  const pending = await getPendingNotifications(userId);
  const now = Date.now();
  const eligible = pending
    .filter((n) => new Date(n.scheduledAt).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )
    .slice(0, MAX_NATIVE_ALARMS);

  for (const notif of eligible) {
    const task = await getTask(notif.taskId);
    if (!task) continue;
    const user = await getUser(task.userId);
    const timeFormat = user?.timeFormat === "24h" ? "24h" : "12h";
    const { title, body } = notificationCopy(notif, task, timeFormat);
    await scheduleNativeNotification({
      title,
      body,
      tag: notif.id,
      mode: user?.notificationSoundMode ?? "preset",
      customSoundUrl: user?.customSoundUrl,
      soundId: user?.notificationSoundId || "notify-correct",
      scheduleAt: new Date(notif.scheduledAt),
    });
  }
}

function scheduleLocalTimer(notif: ScheduledNotification, task: Task): void {
  const delay = new Date(notif.scheduledAt).getTime() - Date.now();
  if (delay < 0) return;

  const existing = notificationTimers.get(notif.id);
  if (existing) {
    clearTimeout(existing);
    notificationTimers.delete(notif.id);
  }

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

  const timerId = setTimeout(() => {
    notificationTimers.delete(notif.id);
    void fireNotification(notif, task);
  }, delay);

  notificationTimers.set(notif.id, timerId);
}

async function canShowNotification(): Promise<boolean> {
  if (isTauri()) {
    const granted = await isNativePermissionGranted().catch(() => false);
    if (granted) return true;
    // Still attempt on Tauri — some WebViews report false negatives
    return true;
  }
  return "Notification" in window && Notification.permission === "granted";
}

async function fireNotification(notif: ScheduledNotification, task: Task): Promise<void> {
  if (firingIds.has(notif.id)) return;
  firingIds.add(notif.id);
  try {
    // Skip if already fired / deleted
    const pending = await getPendingNotifications(notif.userId);
    if (!pending.some((n) => n.id === notif.id)) return;

    const user = await getUser(task.userId);
    if (user && user.taskNotificationsEnabled === false) {
      await markNotificationFired(notif.id);
      return;
    }

    // Mark fired first to prevent double delivery (timer + watchdog + native)
    await markNotificationFired(notif.id);
    await cancelNativeNotification(notif.id).catch(() => {});

    const timer = notificationTimers.get(notif.id);
    if (timer) {
      clearTimeout(timer);
      notificationTimers.delete(notif.id);
    }

    if (!(await canShowNotification())) return;

    const { title, body } = notificationCopy(
      notif,
      task,
      user?.timeFormat === "24h" ? "24h" : "12h"
    );

    try {
      await showTaskNotification({
        title,
        body,
        tag: notif.id,
        mode: user?.notificationSoundMode ?? "preset",
        customSoundUrl: user?.customSoundUrl,
        soundId: user?.notificationSoundId || "notify-correct",
      });
    } catch {
      // Notification / sound may fail in some environments
    }
  } finally {
    firingIds.delete(notif.id);
  }
}

/** Fire any pending reminders whose time has arrived (or recently passed). */
export async function fireDueNotifications(userId?: string): Promise<void> {
  const pending = await getPendingNotifications(userId);
  const now = Date.now();

  for (const notif of pending) {
    const scheduledAt = new Date(notif.scheduledAt).getTime();
    if (scheduledAt > now) continue;

    const task = await getTask(notif.taskId);
    if (!task) {
      await markNotificationFired(notif.id);
      continue;
    }

    if (now - scheduledAt <= OVERDUE_GRACE_MS) {
      await fireNotification(notif, task);
    } else {
      await cancelNativeNotification(notif.id).catch(() => {});
      await markNotificationFired(notif.id);
    }
  }
}

function startDueWatchdog(userId: string): void {
  stopDueWatchdog();
  dueWatchdog = setInterval(() => {
    void fireDueNotifications(userId);
  }, DUE_WATCHDOG_MS);
}

function stopDueWatchdog(): void {
  if (dueWatchdog) {
    clearInterval(dueWatchdog);
    dueWatchdog = null;
  }
}

export async function initNotificationScheduler(userId?: string): Promise<void> {
  await fireDueNotifications(userId);

  const pending = await getPendingNotifications(userId);
  const now = Date.now();

  for (const notif of pending) {
    const scheduledAt = new Date(notif.scheduledAt).getTime();
    if (scheduledAt <= now) continue;

    const task = await getTask(notif.taskId);
    if (!task) {
      await cancelNativeNotification(notif.id).catch(() => {});
      await markNotificationFired(notif.id);
      continue;
    }

    scheduleLocalTimer(notif, task);
  }

  if (userId) {
    await ensureMissingSchedules(userId);
    startDueWatchdog(userId);
  }

  queueNativeAlarmSync(userId);
}

/**
 * Soft reconcile after sync: fire due reminders and fill missing schedules
 * without wiping existing timers/alarms (full rebuild was canceling fires).
 */
export async function reconcileNotificationsForUser(userId: string): Promise<void> {
  await fireDueNotifications(userId);
  await ensureMissingSchedules(userId);
  queueNativeAlarmSync(userId);
}

async function ensureMissingSchedules(userId: string): Promise<void> {
  const { getAllTasksByUser } = await import("./db");
  const tasks = await getAllTasksByUser(userId);
  const pending = await getPendingNotifications(userId);
  const existingKeys = new Set(pending.map(scheduleKey));
  const pendingTaskTypes = new Set(pending.map((n) => `${n.taskId}|${n.type}`));

  for (const task of tasks) {
    const desired = await buildNotificationsForTask(task);
    for (const notif of desired) {
      if (existingKeys.has(scheduleKey(notif))) continue;
      // Avoid duplicate same-type reminder for this task today
      if (pendingTaskTypes.has(`${notif.taskId}|${notif.type}`)) continue;

      await saveNotification(notif);
      scheduleLocalTimer(notif, task);
      existingKeys.add(scheduleKey(notif));
      pendingTaskTypes.add(`${notif.taskId}|${notif.type}`);
    }
  }

  // Drop pending for tasks that no longer need reminders
  for (const n of pending) {
    const task = await getTask(n.taskId);
    if (!task || task.deletedAt || (!task.isRepeating && task.status === "completed")) {
      const timer = notificationTimers.get(n.id);
      if (timer) {
        clearTimeout(timer);
        notificationTimers.delete(n.id);
      }
      await cancelNativeNotification(n.id).catch(() => {});
      await markNotificationFired(n.id);
    }
  }
}

/**
 * Wipe pending notification rows/timers and reschedule from current local tasks.
 * Use sparingly (settings toggle) — prefer reconcileNotificationsForUser after sync.
 */
export async function rebuildNotificationsForUser(userId: string): Promise<void> {
  // Fire anything already due before wiping schedules
  await fireDueNotifications(userId);

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
    const notifs = await buildNotificationsForTask(task);
    for (const notif of notifs) {
      await saveNotification(notif);
      scheduleLocalTimer(notif, task);
    }
  }
  startDueWatchdog(userId);
  queueNativeAlarmSync(userId);
}

export function clearAllTimers(): void {
  stopDueWatchdog();
  for (const timer of notificationTimers.values()) {
    clearTimeout(timer);
  }
  notificationTimers.clear();
  firingIds.clear();
  nativeSyncChain = Promise.resolve();
  nativeSyncQueued = false;
}

/** Clear in-memory timers + native alarms for a task's pending notifications. */
export async function cancelTimersForTask(taskId: string): Promise<void> {
  const pending = await getPendingNotifications();
  for (const n of pending) {
    if (n.taskId !== taskId) continue;
    const timer = notificationTimers.get(n.id);
    if (timer) {
      clearTimeout(timer);
      notificationTimers.delete(n.id);
    }
    await cancelNativeNotification(n.id).catch(() => {});
  }
}
