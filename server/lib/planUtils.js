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
 *  Uses the client's local calendar day when provided (X-Client-Today), otherwise
 *  the server's local calendar — matching task dates and daily-cap sampling.
 */
export function getLocalTodayStr() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Prefer validated X-Client-Today (within ±1 day of server local today). */
export function resolveTodayStr(req) {
  const raw = req?.get?.("x-client-today") || req?.headers?.["x-client-today"];
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (typeof candidate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    const serverToday = getLocalTodayStr();
    const toUtcNoon = (ymd) => Date.parse(`${ymd}T12:00:00Z`);
    const diffDays = Math.abs(toUtcNoon(candidate) - toUtcNoon(serverToday)) / 86_400_000;
    if (diffDays <= 1) return candidate;
  }
  return getLocalTodayStr();
}

export function getHistoryMinDateStr(historyDays, todayStr = getLocalTodayStr()) {
  if (historyDays == null) return null;
  const base = Date.parse(`${todayStr}T12:00:00`);
  if (Number.isNaN(base)) return null;
  const minDate = new Date(base);
  minDate.setDate(minDate.getDate() - (historyDays - 1));
  const y = minDate.getFullYear();
  const m = String(minDate.getMonth() + 1).padStart(2, "0");
  const d = String(minDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Shared visibility rule used by list, get-by-id, and sync responses. */
export function isTaskInHistoryWindow(task, minDateStr) {
  if (!minDateStr) return true;
  if (task.isRepeating) return true;
  return Boolean(task.date && task.date >= minDateStr);
}
