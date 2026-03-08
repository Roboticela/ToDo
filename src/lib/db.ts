import { openDB, type IDBPDatabase } from "idb";
import type {
  Task,
  TaskCompletion,
  ScheduledNotification,
  User,
  AuthSession,
  SyncQueueItem,
} from "../types/todo";

const DB_NAME = "roboticela-todo";
const DB_VERSION = 1;

export interface TodoDB {
  tasks: {
    key: string;
    value: Task;
    indexes: {
      "by-userId": string;
      "by-date": string;
      "by-userId-date": [string, string];
      "by-syncStatus": string;
    };
  };
  completions: {
    key: string;
    value: TaskCompletion;
    indexes: {
      "by-taskId": string;
      "by-userId-date": [string, string];
      "by-syncStatus": string;
    };
  };
    notifications: {
    key: string;
    value: ScheduledNotification;
    indexes: {
      "by-taskId": string;
      "by-scheduledAt": string;
    };
  };
  users: {
    key: string;
    value: User;
  };
  sessions: {
    key: string;
    value: AuthSession;
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: {
      "by-createdAt": string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<TodoDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<TodoDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TodoDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Tasks store
        const tasksStore = db.createObjectStore("tasks", { keyPath: "id" });
        tasksStore.createIndex("by-userId", "userId");
        tasksStore.createIndex("by-date", "date");
        tasksStore.createIndex("by-userId-date", ["userId", "date"]);
        tasksStore.createIndex("by-syncStatus", "syncStatus");

        // Completions store
        const completionsStore = db.createObjectStore("completions", { keyPath: "id" });
        completionsStore.createIndex("by-taskId", "taskId");
        completionsStore.createIndex("by-userId-date", ["userId", "date"]);
        completionsStore.createIndex("by-syncStatus", "syncStatus");

        // Notifications store
        const notifStore = db.createObjectStore("notifications", { keyPath: "id" });
        notifStore.createIndex("by-taskId", "taskId");
        notifStore.createIndex("by-scheduledAt", "scheduledAt");

        // Users store
        db.createObjectStore("users", { keyPath: "id" });

        // Sessions store
        db.createObjectStore("sessions", { keyPath: "userId" });

        // Sync queue store
        const syncStore = db.createObjectStore("syncQueue", { keyPath: "id" });
        syncStore.createIndex("by-createdAt", "createdAt");
      },
    });
  }
  return dbPromise;
}

// ─── Task Operations ───────────────────────────────────────────────────────────

export async function saveTask(task: Task): Promise<void> {
  const db = await getDB();
  await db.put("tasks", task);
}

export async function getTask(id: string): Promise<Task | undefined> {
  const db = await getDB();
  return db.get("tasks", id);
}

export async function getTasksByUserAndDate(userId: string, date: string): Promise<Task[]> {
  const db = await getDB();
  const tasks = await db.getAllFromIndex("tasks", "by-userId-date", [userId, date]);
  return tasks.filter((t) => !t.deletedAt);
}

export async function getAllTasksByUser(userId: string): Promise<Task[]> {
  const db = await getDB();
  const tasks = await db.getAllFromIndex("tasks", "by-userId", userId);
  return tasks.filter((t) => !t.deletedAt);
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("tasks", id);
}

export async function getRepeatTasksByUser(userId: string): Promise<Task[]> {
  const db = await getDB();
  const tasks = await db.getAllFromIndex("tasks", "by-userId", userId);
  return tasks.filter((t) => t.isRepeating && !t.deletedAt);
}

// ─── Completion Operations ─────────────────────────────────────────────────────

export async function saveCompletion(completion: TaskCompletion): Promise<void> {
  const db = await getDB();
  await db.put("completions", completion);
}

export async function getCompletionsByUserAndDate(userId: string, date: string): Promise<TaskCompletion[]> {
  const db = await getDB();
  return db.getAllFromIndex("completions", "by-userId-date", [userId, date]);
}

export async function getCompletionsByTask(taskId: string): Promise<TaskCompletion[]> {
  const db = await getDB();
  return db.getAllFromIndex("completions", "by-taskId", taskId);
}

export async function getAllCompletionsByUser(userId: string): Promise<TaskCompletion[]> {
  const db = await getDB();
  const all = await db.getAll("completions");
  return all.filter((c) => c.userId === userId);
}

// ─── Notification Operations ───────────────────────────────────────────────────

export async function saveNotification(notif: ScheduledNotification): Promise<void> {
  const db = await getDB();
  await db.put("notifications", notif);
}

export async function getPendingNotifications(): Promise<ScheduledNotification[]> {
  const db = await getDB();
  const all = await db.getAll("notifications");
  return all.filter((n) => !n.fired);
}

export async function markNotificationFired(id: string): Promise<void> {
  const db = await getDB();
  const notif = await db.get("notifications", id);
  if (notif) {
    notif.fired = true;
    await db.put("notifications", notif);
  }
}

export async function deleteNotificationsByTask(taskId: string): Promise<void> {
  const db = await getDB();
  const notifs = await db.getAllFromIndex("notifications", "by-taskId", taskId);
  for (const n of notifs) {
    await db.delete("notifications", n.id);
  }
}

// ─── User / Session Operations ─────────────────────────────────────────────────

export async function saveUser(user: User): Promise<void> {
  const db = await getDB();
  await db.put("users", user);
}

export async function getUser(id: string): Promise<User | undefined> {
  const db = await getDB();
  return db.get("users", id);
}

export async function saveSession(session: AuthSession): Promise<void> {
  const db = await getDB();
  await db.put("sessions", session);
}

export async function getSession(userId: string): Promise<AuthSession | undefined> {
  const db = await getDB();
  return db.get("sessions", userId);
}

export async function getAnySession(): Promise<AuthSession | undefined> {
  const db = await getDB();
  const all = await db.getAll("sessions");
  return all[0];
}

export async function deleteSession(userId: string): Promise<void> {
  const db = await getDB();
  await db.delete("sessions", userId);
}

// ─── Sync Queue Operations ─────────────────────────────────────────────────────

export async function addToSyncQueue(item: SyncQueueItem): Promise<void> {
  const db = await getDB();
  await db.put("syncQueue", item);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAllFromIndex("syncQueue", "by-createdAt");
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("syncQueue", id);
}
