import type { Task, ScheduledNotification } from "../types/todo";
import { saveNotification, getPendingNotifications, markNotificationFired } from "./db";
import { v4 as uuidv4 } from "./uuid";

let notificationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

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

export async function scheduleTaskNotifications(task: Task): Promise<void> {
  if (task.type === "daily") return;

  const now = new Date();
  const notifs: ScheduledNotification[] = [];

  if (task.type === "time-based" && task.time) {
    const scheduledAt = new Date(`${task.date}T${task.time}:00`);
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
      const startAt = new Date(`${task.date}T${task.startTime}:00`);
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
      const endAt = new Date(`${task.date}T${task.endTime}:00`);
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

  for (const notif of notifs) {
    await saveNotification(notif);
    scheduleLocalTimer(notif, task);
  }
}

function scheduleLocalTimer(notif: ScheduledNotification, task: Task): void {
  const delay = new Date(notif.scheduledAt).getTime() - Date.now();
  if (delay < 0 || delay > 7 * 24 * 60 * 60 * 1000) return;

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
      icon: "/Favicon.svg",
      badge: "/Favicon.svg",
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
      // Re-schedule timer (we need task info, so just save minimal info)
      const delay = scheduledAt.getTime() - now.getTime();
      if (delay < 7 * 24 * 60 * 60 * 1000) {
        const timerId = setTimeout(async () => {
          if (Notification.permission === "granted") {
            try {
              new Notification("Roboticela ToDo", {
                body: `You have a scheduled task reminder`,
                icon: "/Favicon.svg",
                tag: notif.id,
              });
            } catch {
              // ignore
            }
          }
          await markNotificationFired(notif.id);
          notificationTimers.delete(notif.id);
        }, delay);
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
