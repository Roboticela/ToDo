/**
 * Effective plan: if planExpiresAt is missing or in the past and plan is not
 * "free"/"lifetime", treat as free. Recurring plans require an explicit expiry;
 * null no longer means "paid forever".
 */
export function getEffectivePlan(user) {
  if (!user) return null;
  let plan = user.plan || "free";
  if (plan === "pending") plan = "free";
  const planExpiresAt = user.planExpiresAt ?? null;
  // lifetime never expires; free doesn't expire
  const isExpired =
    plan !== "free" &&
    plan !== "lifetime" &&
    (!planExpiresAt || new Date(planExpiresAt) < new Date());
  return {
    plan: isExpired ? "free" : plan,
    planExpiresAt: isExpired ? null : planExpiresAt,
  };
}

/** Plan limits: historyDays (null = unlimited), maxRepeatTasks, maxDailyTasks */
export const PLAN_LIMITS = {
  pending: { historyDays: 2, maxRepeatTasks: 5, maxDailyTasks: 10 },
  free: { historyDays: 2, maxRepeatTasks: 5, maxDailyTasks: 10 },
  basic: { historyDays: 14, maxRepeatTasks: 10, maxDailyTasks: 15 },
  pro: { historyDays: null, maxRepeatTasks: null, maxDailyTasks: null },
  lifetime: { historyDays: null, maxRepeatTasks: null, maxDailyTasks: null },
};

export function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

/** YYYY-MM-DD for the oldest date still visible under historyDays (inclusive).
 *  Uses UTC calendar days so client and server agree regardless of server TZ.
 */
export function getHistoryMinDateStr(historyDays) {
  if (historyDays == null) return null;
  const now = new Date();
  const minDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  minDate.setUTCDate(minDate.getUTCDate() - (historyDays - 1));
  const y = minDate.getUTCFullYear();
  const m = String(minDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(minDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Shared visibility rule used by list, get-by-id, and sync responses. */
export function isTaskInHistoryWindow(task, minDateStr) {
  if (!minDateStr) return true;
  if (task.isRepeating) return true;
  return Boolean(task.date && task.date >= minDateStr);
}
