import type { SubscriptionPlan, TaskFormData } from "../types/todo";
import { PLAN_FEATURES } from "../types/todo";
import {
  getAllTasksByUser,
  getRepeatTasksByUser,
} from "./db";
import { getTasksForDate, getTodayString } from "./taskService";
import { format, subDays } from "date-fns";

export class PlanLimitError extends Error {
  code: "MAX_REPEAT_TASKS" | "MAX_DAILY_TASKS" | "HISTORY_LIMIT";
  limit: number;

  constructor(code: PlanLimitError["code"], limit: number, message: string) {
    super(message);
    this.name = "PlanLimitError";
    this.code = code;
    this.limit = limit;
  }
}

/** Effective plan on the client, mirroring server getEffectivePlan (honours planExpiresAt). */
export function getEffectiveClientPlan(
  plan: string | undefined,
  planExpiresAt?: string | null
): SubscriptionPlan {
  let p: SubscriptionPlan = "free";
  if (plan === "basic" || plan === "pro" || plan === "lifetime") p = plan;
  if (p !== "free" && p !== "lifetime" && planExpiresAt && new Date(planExpiresAt) < new Date()) {
    return "free";
  }
  return p;
}

export function getHistoryCutoff(
  plan: string | undefined,
  planExpiresAt?: string | null
): string | null {
  const features = PLAN_FEATURES[getEffectiveClientPlan(plan, planExpiresAt)];
  if (features.historyDays == null) return null;
  return format(subDays(new Date(), features.historyDays - 1), "yyyy-MM-dd");
}

/** Clamp a browsable date to the plan's history window (past only). */
export function clampDateToHistory(
  date: string,
  plan: string | undefined,
  planExpiresAt?: string | null
): { date: string; clamped: boolean } {
  const cutoff = getHistoryCutoff(plan, planExpiresAt);
  const today = getTodayString();
  if (!cutoff) return { date, clamped: false };
  if (date < cutoff) return { date: cutoff, clamped: true };
  if (date > today) return { date, clamped: false };
  return { date, clamped: false };
}

export async function assertCanCreateTask(
  userId: string,
  plan: string | undefined,
  data: TaskFormData,
  planExpiresAt?: string | null
): Promise<void> {
  const features = PLAN_FEATURES[getEffectiveClientPlan(plan, planExpiresAt)];

  if (data.isRepeating && data.repeatDays.length > 0 && features.maxRepeatTasks != null) {
    const repeats = await getRepeatTasksByUser(userId);
    if (repeats.length >= features.maxRepeatTasks) {
      throw new PlanLimitError(
        "MAX_REPEAT_TASKS",
        features.maxRepeatTasks,
        `Your plan allows up to ${features.maxRepeatTasks} repeating tasks. Upgrade to add more.`
      );
    }
  }

  if (features.maxDailyTasks != null) {
    const existing = await getTasksForDate(userId, data.date);
    if (existing.length >= features.maxDailyTasks) {
      throw new PlanLimitError(
        "MAX_DAILY_TASKS",
        features.maxDailyTasks,
        `Your plan allows up to ${features.maxDailyTasks} tasks on a day. Upgrade to add more.`
      );
    }
  }
}

/** When turning a one-off task into a repeating one via edit. */
export async function assertCanEnableRepeating(
  userId: string,
  plan: string | undefined,
  currentlyRepeating: boolean,
  willBeRepeating: boolean,
  planExpiresAt?: string | null
): Promise<void> {
  if (currentlyRepeating || !willBeRepeating) return;
  const features = PLAN_FEATURES[getEffectiveClientPlan(plan, planExpiresAt)];
  if (features.maxRepeatTasks == null) return;
  const repeats = await getRepeatTasksByUser(userId);
  if (repeats.length >= features.maxRepeatTasks) {
    throw new PlanLimitError(
      "MAX_REPEAT_TASKS",
      features.maxRepeatTasks,
      `Your plan allows up to ${features.maxRepeatTasks} repeating tasks. Upgrade to add more.`
    );
  }
}

/** When moving a non-repeating task onto another day that may already be full. */
export async function assertCanMoveTaskToDate(
  userId: string,
  plan: string | undefined,
  taskId: string,
  fromDate: string,
  toDate: string,
  isRepeating: boolean,
  planExpiresAt?: string | null
): Promise<void> {
  if (isRepeating || fromDate === toDate) return;
  const features = PLAN_FEATURES[getEffectiveClientPlan(plan, planExpiresAt)];
  if (features.maxDailyTasks == null) return;
  const existing = await getTasksForDate(userId, toDate);
  const others = existing.filter((t) => t.id !== taskId);
  if (others.length >= features.maxDailyTasks) {
    throw new PlanLimitError(
      "MAX_DAILY_TASKS",
      features.maxDailyTasks,
      `Your plan allows up to ${features.maxDailyTasks} tasks on a day. Upgrade to add more.`
    );
  }
}

export async function countVisibleTasksOnDate(userId: string, date: string): Promise<number> {
  return (await getTasksForDate(userId, date)).length;
}

export async function countAllUserTasks(userId: string): Promise<number> {
  return (await getAllTasksByUser(userId)).length;
}
