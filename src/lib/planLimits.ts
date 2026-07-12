import type { RepeatDay, SubscriptionPlan, TaskFormData } from "../types/todo";
import { PLAN_FEATURES } from "../types/todo";
import {
  getAllTasksByUser,
  getRepeatTasksByUser,
  getTasksByUserAndDate,
} from "./db";
import { getTodayString } from "./taskService";
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

/** Effective plan on the client, mirroring server getEffectivePlan (honours planExpiresAt).
 *  Recurring plans with missing expiry are treated as free (null no longer means "paid forever").
 */
export function getEffectiveClientPlan(
  plan: string | undefined,
  planExpiresAt?: string | null
): SubscriptionPlan {
  let p: SubscriptionPlan = "free";
  if (plan === "basic" || plan === "pro" || plan === "lifetime") p = plan;
  if (
    p !== "free" &&
    p !== "lifetime" &&
    (!planExpiresAt || new Date(planExpiresAt) < new Date())
  ) {
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

/**
 * Count tasks on a date for plan limits — matches server (includes skipped repeats).
 */
async function countTasksOnDateForLimits(
  userId: string,
  date: string,
  excludeId?: string
): Promise<number> {
  const dayOfWeek = new Date(date + "T12:00:00").getDay() as RepeatDay;
  const direct = (await getTasksByUserAndDate(userId, date)).filter(
    (t) => !t.isRepeating && t.id !== excludeId
  );
  const repeats = await getRepeatTasksByUser(userId);
  const matching = repeats.filter(
    (t) =>
      t.id !== excludeId &&
      Array.isArray(t.repeatDays) &&
      t.repeatDays.includes(dayOfWeek) &&
      date >= t.date &&
      (!t.endDate || date <= t.endDate)
  );
  return direct.length + matching.length;
}

/** Sample the next few occurrences of each weekday (aligned with server). */
const REPEAT_CAP_WEEKS = 4;

function sampleDatesForWeekday(
  from: string,
  dow: number,
  endDate: string | null | undefined
): string[] {
  const out: string[] = [];
  const sample = new Date(from + "T12:00:00");
  const delta = (dow - sample.getDay() + 7) % 7;
  sample.setDate(sample.getDate() + delta);
  for (let w = 0; w < REPEAT_CAP_WEEKS; w++) {
    const sampleStr = format(sample, "yyyy-MM-dd");
    if (endDate && sampleStr > endDate) break;
    out.push(sampleStr);
    sample.setDate(sample.getDate() + 7);
  }
  return out;
}

export async function assertCanCreateTask(
  userId: string,
  plan: string | undefined,
  data: TaskFormData,
  planExpiresAt?: string | null
): Promise<void> {
  const features = PLAN_FEATURES[getEffectiveClientPlan(plan, planExpiresAt)];

  if (!data.isRepeating && features.historyDays != null) {
    const cutoff = getHistoryCutoff(plan, planExpiresAt);
    if (cutoff && data.date < cutoff) {
      throw new PlanLimitError(
        "HISTORY_LIMIT",
        features.historyDays,
        `Your plan only keeps ${features.historyDays} days of history. Upgrade to add older tasks.`
      );
    }
  }

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
    if (data.isRepeating && data.repeatDays.length > 0) {
      await assertCanExpandRepeatDays(
        userId,
        plan,
        "", // new task — no id to exclude yet
        data.date,
        undefined,
        data.repeatDays,
        false,
        [],
        planExpiresAt,
        null
      );
    } else if (!data.isRepeating) {
      const count = await countTasksOnDateForLimits(userId, data.date);
      if (count >= features.maxDailyTasks) {
        throw new PlanLimitError(
          "MAX_DAILY_TASKS",
          features.maxDailyTasks,
          `Your plan allows up to ${features.maxDailyTasks} tasks on a day. Upgrade to add more.`
        );
      }
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
  const count = await countTasksOnDateForLimits(userId, toDate, taskId);
  if (count >= features.maxDailyTasks) {
    throw new PlanLimitError(
      "MAX_DAILY_TASKS",
      features.maxDailyTasks,
      `Your plan allows up to ${features.maxDailyTasks} tasks on a day. Upgrade to add more.`
    );
  }
}

/** When expanding a repeating task onto additional weekdays that may already be full. */
export async function assertCanExpandRepeatDays(
  userId: string,
  plan: string | undefined,
  taskId: string,
  startDate: string,
  endDate: string | null | undefined,
  nextRepeatDays: number[],
  previouslyRepeating: boolean,
  previousRepeatDays: number[],
  planExpiresAt?: string | null,
  previousStartDate?: string | null
): Promise<void> {
  const features = PLAN_FEATURES[getEffectiveClientPlan(plan, planExpiresAt)];
  if (features.maxDailyTasks == null) return;
  if (!nextRepeatDays.length) return;

  const prevSet = new Set(previouslyRepeating ? previousRepeatDays : []);
  const added = nextRepeatDays.filter((d) => !prevSet.has(d));
  const startChanged =
    previousStartDate != null && previousStartDate !== startDate;
  // New task, start-date change, or newly added weekdays — re-check those days
  const daysToCheck =
    previouslyRepeating && !startChanged ? added : nextRepeatDays;
  if (daysToCheck.length === 0) return;

  const today = getTodayString();
  const from = startDate > today ? startDate : today;

  for (const dow of daysToCheck) {
    for (const sampleStr of sampleDatesForWeekday(from, dow, endDate)) {
      const count = await countTasksOnDateForLimits(userId, sampleStr, taskId || undefined);
      if (count >= features.maxDailyTasks) {
        throw new PlanLimitError(
          "MAX_DAILY_TASKS",
          features.maxDailyTasks,
          `Your plan allows up to ${features.maxDailyTasks} tasks on a day. Upgrade to add more.`
        );
      }
    }
  }
}

export async function countVisibleTasksOnDate(userId: string, date: string): Promise<number> {
  return countTasksOnDateForLimits(userId, date);
}

export async function countAllUserTasks(userId: string): Promise<number> {
  return (await getAllTasksByUser(userId)).length;
}
