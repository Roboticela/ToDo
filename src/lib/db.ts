import { openDB, type IDBPDatabase } from "idb";
import type {
  Task,
  TaskCompletion,
  ScheduledNotification,
  User,
  AuthSession,
  SyncQueueItem,
} from "../types/todo";
import { isTauri } from "./tauri";

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
  if (isTauri()) return (await import("./dbTauri")).saveTask(task);
  const db = await getDB();
  await db.put("tasks", task);
}

export async function getTask(id: string): Promise<Task | undefined> {
  if (isTauri()) return (await import("./dbTauri")).getTask(id);
  const db = await getDB();
  return db.get("tasks", id);
}

export async function getTasksByUserAndDate(userId: string, date: string): Promise<Task[]> {
  if (isTauri()) return (await import("./dbTauri")).getTasksByUserAndDate(userId, date);
  const db = await getDB();
  const tasks = await db.getAllFromIndex("tasks", "by-userId-date", [userId, date]);
  return tasks.filter((t) => !t.deletedAt);
}

export async function getAllTasksByUser(userId: string): Promise<Task[]> {
  if (isTauri()) return (await import("./dbTauri")).getAllTasksByUser(userId);
  const db = await getDB();
  const tasks = await db.getAllFromIndex("tasks", "by-userId", userId);
  return tasks.filter((t) => !t.deletedAt);
}

/** All tasks for user including soft-deleted (for sync so server can apply deletes). */
export async function getAllTasksByUserForSync(userId: string): Promise<Task[]> {
  if (isTauri()) return (await import("./dbTauri")).getAllTasksByUserForSync(userId);
  const db = await getDB();
  return db.getAllFromIndex("tasks", "by-userId", userId);
}

export async function deleteTask(id: string): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).deleteTask(id);
  const db = await getDB();
  const task = await db.get("tasks", id);
  if (task) {
    const now = new Date().toISOString();
    await db.put("tasks", { ...task, deletedAt: now, updatedAt: now, syncStatus: "pending" });
  }
}

export async function getRepeatTasksByUser(userId: string): Promise<Task[]> {
  if (isTauri()) return (await import("./dbTauri")).getRepeatTasksByUser(userId);
  const db = await getDB();
  const tasks = await db.getAllFromIndex("tasks", "by-userId", userId);
  return tasks.filter((t) => t.isRepeating && !t.deletedAt);
}

// ─── Completion Operations ─────────────────────────────────────────────────────

export async function saveCompletion(completion: TaskCompletion): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).saveCompletion(completion);
  const db = await getDB();
  await db.put("completions", completion);
}

export async function getCompletionsByUserAndDate(userId: string, date: string): Promise<TaskCompletion[]> {
  if (isTauri()) return (await import("./dbTauri")).getCompletionsByUserAndDate(userId, date);
  const db = await getDB();
  return db.getAllFromIndex("completions", "by-userId-date", [userId, date]);
}

export async function getCompletionsByTask(taskId: string): Promise<TaskCompletion[]> {
  if (isTauri()) return (await import("./dbTauri")).getCompletionsByTask(taskId);
  const db = await getDB();
  return db.getAllFromIndex("completions", "by-taskId", taskId);
}

export async function getAllCompletionsByUser(userId: string): Promise<TaskCompletion[]> {
  if (isTauri()) return (await import("./dbTauri")).getAllCompletionsByUser(userId);
  const db = await getDB();
  const all = await db.getAll("completions");
  return all.filter((c) => c.userId === userId);
}

/** Delete a single completion by id (e.g. when uncompleting a repeat task). */
export async function deleteCompletion(id: string): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).deleteCompletion(id);
  const db = await getDB();
  await db.delete("completions", id);
}

/** Replace all tasks and completions for a user with server state (after sync). */
export async function replaceTasksAndCompletionsFromServer(
  userId: string,
  tasks: Task[],
  completions: TaskCompletion[]
): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).replaceTasksAndCompletionsFromServer(userId, tasks, completions);
  const db = await getDB();
  const existingTasks = await db.getAllFromIndex("tasks", "by-userId", userId);
  const existingCompletions = await getAllCompletionsByUser(userId);
  const tx = db.transaction(["tasks", "completions"], "readwrite");
  const taskStore = tx.objectStore("tasks");
  const compStore = tx.objectStore("completions");
  for (const t of existingTasks) {
    taskStore.delete(t.id);
  }
  for (const c of existingCompletions) {
    compStore.delete(c.id);
  }
  for (const t of tasks) {
    taskStore.put({ ...t, syncStatus: "synced" as const });
  }
  for (const c of completions) {
    compStore.put({ ...c, syncStatus: "synced" as const });
  }
  await tx.done;
}

// ─── Notification Operations ───────────────────────────────────────────────────

export async function saveNotification(notif: ScheduledNotification): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).saveNotification(notif);
  const db = await getDB();
  await db.put("notifications", notif);
}

export async function getPendingNotifications(): Promise<ScheduledNotification[]> {
  if (isTauri()) return (await import("./dbTauri")).getPendingNotifications();
  const db = await getDB();
  const all = await db.getAll("notifications");
  return all.filter((n) => !n.fired);
}

export async function markNotificationFired(id: string): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).markNotificationFired(id);
  const db = await getDB();
  const notif = await db.get("notifications", id);
  if (notif) {
    notif.fired = true;
    await db.put("notifications", notif);
  }
}

export async function deleteNotificationsByTask(taskId: string): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).deleteNotificationsByTask(taskId);
  const db = await getDB();
  const notifs = await db.getAllFromIndex("notifications", "by-taskId", taskId);
  for (const n of notifs) {
    await db.delete("notifications", n.id);
  }
}

// ─── User / Session Operations ─────────────────────────────────────────────────

export async function saveUser(user: User): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).saveUser(user);
  const db = await getDB();
  await db.put("users", user);
}

export async function getUser(id: string): Promise<User | undefined> {
  if (isTauri()) return (await import("./dbTauri")).getUser(id);
  const db = await getDB();
  return db.get("users", id);
}

export async function saveSession(session: AuthSession): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).saveSession(session);
  const db = await getDB();
  await db.put("sessions", session);
}

export async function getSession(userId: string): Promise<AuthSession | undefined> {
  if (isTauri()) return (await import("./dbTauri")).getSession(userId);
  const db = await getDB();
  return db.get("sessions", userId);
}

export async function getAnySession(): Promise<AuthSession | undefined> {
  if (isTauri()) return (await import("./dbTauri")).getAnySession();
  const db = await getDB();
  const all = await db.getAll("sessions");
  return all[0];
}

export async function deleteSession(userId: string): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).deleteSession(userId);
  const db = await getDB();
  await db.delete("sessions", userId);
}

// ─── Sync Queue Operations ─────────────────────────────────────────────────────

export async function addToSyncQueue(item: SyncQueueItem): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).addToSyncQueue(item);
  const db = await getDB();
  await db.put("syncQueue", item);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  if (isTauri()) return (await import("./dbTauri")).getSyncQueue();
  const db = await getDB();
  return db.getAllFromIndex("syncQueue", "by-createdAt");
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).removeSyncQueueItem(id);
  const db = await getDB();
  await db.delete("syncQueue", id);
}

/** Clear all local data (e.g. on account delete). In Tauri uses native DB; in web clears IndexedDB. */
export async function clearAll(): Promise<void> {
  if (isTauri()) return (await import("./dbTauri")).clearAll();
  const db = await getDB();
  await db.clear("tasks");
  await db.clear("completions");
  await db.clear("notifications");
  await db.clear("users");
  await db.clear("syncQueue");
}
