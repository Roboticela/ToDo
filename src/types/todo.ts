// ─── Task Types ────────────────────────────────────────────────────────────────

export type TaskType = "time-based" | "daily" | "duration";
export type TaskCategory = "do" | "dont";
export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "pending" | "completed" | "missed" | "skipped";
export type RepeatDay = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun, 1=Mon, ..., 6=Sat
export type SyncStatus = "synced" | "pending" | "failed";
export type SubscriptionPlan = "free" | "basic" | "pro" | "lifetime";

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  type: TaskType;
  category: TaskCategory;
  priority?: TaskPriority; // default "medium" when missing (e.g. legacy data)

  // Time-based & Duration fields
  date: string;           // ISO date string "YYYY-MM-DD"
  time?: string;          // "HH:MM" for time-based
  startTime?: string;     // "HH:MM" for duration
  endTime?: string;       // "HH:MM" for duration

  // Repeat
  isRepeating: boolean;
  repeatDays: RepeatDay[]; // weekdays to repeat on
  /** If set, repeating task only shows on dates <= endDate (YYYY-MM-DD). */
  endDate?: string;

  // Status
  status: TaskStatus;
  completedAt?: string;   // ISO datetime

  // Sync
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;

  // Soft delete
  deletedAt?: string;
}

// ─── Task Completion Record (for repeat tasks) ─────────────────────────────────

export interface TaskCompletion {
  id: string;
  taskId: string;
  userId: string;
  date: string;           // "YYYY-MM-DD"
  status: "completed" | "missed" | "skipped";
  completedAt: string;
  syncStatus: SyncStatus;
}

// ─── Notification ──────────────────────────────────────────────────────────────

export interface ScheduledNotification {
  id: string;
  taskId: string;
  userId: string;
  scheduledAt: string;    // ISO datetime
  type: "start" | "end" | "reminder";
  fired: boolean;
}

// ─── User / Auth ───────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  plan: SubscriptionPlan;
  planExpiresAt?: string;
  emailVerifiedAt?: string;
  subscribedToReminders?: boolean;
  createdAt: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  userId: string;
}

// ─── Subscription Plans ────────────────────────────────────────────────────────

export interface PlanFeatures {
  historyDays: number | null;   // null = unlimited
  maxRepeatTasks: number | null;
  maxDailyTasks: number | null;
  price: number;                // USD/month
}

export const PLAN_FEATURES: Record<SubscriptionPlan, PlanFeatures> = {
  free: {
    historyDays: 2,
    maxRepeatTasks: 5,
    maxDailyTasks: 10,
    price: 0,
  },
  basic: {
    historyDays: 14,
    maxRepeatTasks: 10,
    maxDailyTasks: 15,
    price: 5, // monthly; yearly is 3/mo
  },
  pro: {
    historyDays: null,
    maxRepeatTasks: null,
    maxDailyTasks: null,
    price: 8, // monthly; yearly is 6/mo
  },
  lifetime: {
    historyDays: null,
    maxRepeatTasks: null,
    maxDailyTasks: null,
    price: 79, // one-time
  },
};

// ─── Analytics ─────────────────────────────────────────────────────────────────

export interface DayAnalytics {
  date: string;
  total: number;
  completed: number;
  missed: number;
  completionRate: number;
  doCompleted: number;
  doMissed: number;
  dontCompleted: number;  // "Don't" tasks avoided (completed = avoided)
  dontMissed: number;     // Failed to avoid
}

export interface WeeklyStats {
  week: string;           // e.g. "Week 1"
  completed: number;
  missed: number;
  rate: number;
}

// ─── Sync Queue ────────────────────────────────────────────────────────────────

export interface SyncQueueItem {
  id: string;
  type: "task" | "completion" | "profile";
  operation: "create" | "update" | "delete";
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

// ─── Form State ────────────────────────────────────────────────────────────────

export interface TaskFormData {
  title: string;
  description?: string;
  type: TaskType;
  category: TaskCategory;
  priority: TaskPriority;
  date: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  isRepeating: boolean;
  repeatDays: RepeatDay[];
}
