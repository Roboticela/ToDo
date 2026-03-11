/**
 * Effective plan: if planExpiresAt is in the past and plan is not "free", treat as free.
 * Returns { plan, planExpiresAt } for API responses.
 */
export function getEffectivePlan(user) {
  if (!user) return null;
  const plan = user.plan || "free";
  const planExpiresAt = user.planExpiresAt ?? null;
  // lifetime never expires; free doesn't expire
  const isExpired = plan !== "free" && plan !== "lifetime" && planExpiresAt && new Date(planExpiresAt) < new Date();
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
