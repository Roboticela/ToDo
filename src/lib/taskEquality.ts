import type { Task } from "../types/todo";

/** UI-relevant equality (ignores syncStatus so background sync doesn't churn cards). */
export function tasksContentEqual(a: Task, b: Task): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.description === b.description &&
    a.type === b.type &&
    a.category === b.category &&
    (a.priority ?? "medium") === (b.priority ?? "medium") &&
    a.date === b.date &&
    a.time === b.time &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    a.isRepeating === b.isRepeating &&
    a.endDate === b.endDate &&
    a.status === b.status &&
    a.completedAt === b.completedAt &&
    // Ignore updatedAt — sync/touch churn must not remount cards.
    a.deletedAt === b.deletedAt &&
    a.repeatDays.length === b.repeatDays.length &&
    a.repeatDays.every((d, i) => d === b.repeatDays[i])
  );
}

/**
 * Reuse previous Task object references when content is unchanged so React
 * (and Framer Motion) don't treat every sync as a full list remount.
 */
export function mergeTasksPreserveRefs(prev: Task[], next: Task[]): Task[] {
  if (prev.length === next.length) {
    let identical = true;
    for (let i = 0; i < next.length; i++) {
      if (prev[i]?.id !== next[i]?.id || !tasksContentEqual(prev[i], next[i])) {
        identical = false;
        break;
      }
    }
    if (identical) return prev;
  }

  const prevById = new Map(prev.map((t) => [t.id, t]));
  return next.map((n) => {
    const p = prevById.get(n.id);
    return p && tasksContentEqual(p, n) ? p : n;
  });
}
