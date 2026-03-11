/**
 * Native storage backend for Tauri: uses SQLite in the app data dir via invoke.
 * Data persists across app updates and is never cleared by the OS.
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  Task,
  TaskCompletion,
  ScheduledNotification,
  User,
  AuthSession,
  SyncQueueItem,
} from "../types/todo";

async function dbExec<T = void>(payload: Record<string, unknown>): Promise<T> {
  // Rust run_db_exec(state, method: DbMethod) expects key "method" matching the parameter name.
  const result = await invoke<unknown>("run_db_exec", { method: payload });
  if (result === null || result === undefined) return undefined as T;
  return result as T;
}

function nonNull<T>(v: unknown): T | undefined {
  if (v === null || v === undefined) return undefined;
  return v as T;
}

// ─── Task Operations ───────────────────────────────────────────────────────────

export async function saveTask(task: Task): Promise<void> {
  await dbExec({ method: "saveTask", task });
}

export async function getTask(id: string): Promise<Task | undefined> {
  const v = await dbExec<Task | null>({ method: "getTask", id });
  return nonNull<Task>(v);
}

export async function getTasksByUserAndDate(userId: string, date: string): Promise<Task[]> {
  const v = await dbExec<Task[]>({ method: "getTasksByUserAndDate", userId, date });
  return Array.isArray(v) ? v : [];
}

export async function getAllTasksByUser(userId: string): Promise<Task[]> {
  const v = await dbExec<Task[]>({ method: "getAllTasksByUser", userId });
  return Array.isArray(v) ? v : [];
}

export async function getAllTasksByUserForSync(userId: string): Promise<Task[]> {
  const v = await dbExec<Task[]>({ method: "getAllTasksByUserForSync", userId });
  return Array.isArray(v) ? v : [];
}

export async function deleteTask(id: string): Promise<void> {
  await dbExec({ method: "deleteTask", id });
}

export async function getRepeatTasksByUser(userId: string): Promise<Task[]> {
  const v = await dbExec<Task[]>({ method: "getRepeatTasksByUser", userId });
  return Array.isArray(v) ? v : [];
}

// ─── Completion Operations ─────────────────────────────────────────────────────

export async function saveCompletion(completion: TaskCompletion): Promise<void> {
  await dbExec({ method: "saveCompletion", completion });
}

export async function getCompletionsByUserAndDate(
  userId: string,
  date: string
): Promise<TaskCompletion[]> {
  const v = await dbExec<TaskCompletion[]>({
    method: "getCompletionsByUserAndDate",
    userId,
    date,
  });
  return Array.isArray(v) ? v : [];
}

export async function getCompletionsByTask(taskId: string): Promise<TaskCompletion[]> {
  const v = await dbExec<TaskCompletion[]>({ method: "getCompletionsByTask", taskId });
  return Array.isArray(v) ? v : [];
}

export async function getAllCompletionsByUser(userId: string): Promise<TaskCompletion[]> {
  const v = await dbExec<TaskCompletion[]>({ method: "getAllCompletionsByUser", userId });
  return Array.isArray(v) ? v : [];
}

export async function deleteCompletion(id: string): Promise<void> {
  await dbExec({ method: "deleteCompletion", id });
}

export async function replaceTasksAndCompletionsFromServer(
  userId: string,
  tasks: Task[],
  completions: TaskCompletion[]
): Promise<void> {
  await dbExec({
    method: "replaceTasksAndCompletionsFromServer",
    userId,
    tasks,
    completions,
  });
}

// ─── Notification Operations ───────────────────────────────────────────────────

export async function saveNotification(notif: ScheduledNotification): Promise<void> {
  await dbExec({ method: "saveNotification", notification: notif });
}

export async function getPendingNotifications(): Promise<ScheduledNotification[]> {
  const v = await dbExec<ScheduledNotification[]>({ method: "getPendingNotifications" });
  return Array.isArray(v) ? v : [];
}

export async function markNotificationFired(id: string): Promise<void> {
  await dbExec({ method: "markNotificationFired", id });
}

export async function deleteNotificationsByTask(taskId: string): Promise<void> {
  await dbExec({ method: "deleteNotificationsByTask", taskId });
}

// ─── User / Session Operations ─────────────────────────────────────────────────

export async function saveUser(user: User): Promise<void> {
  await dbExec({ method: "saveUser", user });
}

export async function getUser(id: string): Promise<User | undefined> {
  const v = await dbExec<User | null>({ method: "getUser", id });
  return nonNull<User>(v);
}

export async function saveSession(session: AuthSession): Promise<void> {
  await dbExec({ method: "saveSession", session });
}

export async function getSession(userId: string): Promise<AuthSession | undefined> {
  const v = await dbExec<AuthSession | null>({ method: "getSession", userId });
  return nonNull<AuthSession>(v);
}

export async function getAnySession(): Promise<AuthSession | undefined> {
  const v = await dbExec<AuthSession | null>({ method: "getAnySession" });
  return nonNull<AuthSession>(v);
}

export async function deleteSession(userId: string): Promise<void> {
  await dbExec({ method: "deleteSession", userId });
}

// ─── Sync Queue Operations ─────────────────────────────────────────────────────

export async function addToSyncQueue(item: SyncQueueItem): Promise<void> {
  await dbExec({ method: "addToSyncQueue", item });
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const v = await dbExec<SyncQueueItem[]>({ method: "getSyncQueue" });
  return Array.isArray(v) ? v : [];
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  await dbExec({ method: "removeSyncQueueItem", id });
}

// ─── Clear All (e.g. account delete) ────────────────────────────────────────────

export async function clearAll(): Promise<void> {
  await dbExec({ method: "clearAll" });
}
