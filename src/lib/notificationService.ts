import type { Task, ScheduledNotification } from "../types/todo";
import {
  saveNotification,
  getPendingNotifications,
  markNotificationFired,
  getTask,
} from "./db";
import { v4 as uuidv4 } from "./uuid";
import { format, addDays } from "date-fns";

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

  const now = new Date();
  const occurrenceDates = getOccurrenceDates(task);
  const notifs: ScheduledNotification[] = [];

  for (const date of occurrenceDates) {
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

  try {
    new Notification(title, {
      body,
      icon: ICON,
      badge: ICON,
      tag: notif.id,
      requireInteraction: false,
    });
  } catch {
    // Notification may fail in some environments
  }

  await markNotificationFired(notif.id);
}

export async function initNotificationScheduler(): Promise<void> {
  const pending = await getPendingNotifications();
  const now = new Date();

  for (const notif of pending) {
    const scheduledAt = new Date(notif.scheduledAt);
    if (scheduledAt > now) {
      const task = await getTask(notif.taskId);
      if (task) {
        scheduleLocalTimer(notif, task);
      } else {
        // Keep a generic wake-up even if task lookup fails (chained if far out)
        const delay = scheduledAt.getTime() - now.getTime();
        const MAX_DELAY = 7 * 24 * 60 * 60 * 1000;
        const wait = Math.min(delay, MAX_DELAY);
        const timerId = setTimeout(async () => {
          if (delay > MAX_DELAY) {
            notificationTimers.delete(notif.id);
            await initNotificationScheduler();
            return;
          }
          if (Notification.permission === "granted") {
            try {
              new Notification("Roboticela ToDo", {
                body: "You have a scheduled task reminder",
                icon: ICON,
                tag: notif.id,
              });
            } catch {
              // ignore
            }
          }
          await markNotificationFired(notif.id);
          notificationTimers.delete(notif.id);
        }, wait);
        notificationTimers.set(notif.id, timerId);
      }
    }
  }
}

export function clearAllTimers(): void {
  for (const timer of notificationTimers.values()) {
    clearTimeout(timer);
  }
  notificationTimers.clear();
}
