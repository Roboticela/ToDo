import { addDays } from "date-fns";
import type { Task } from "../types/todo";
import { localDateTime } from "./timeFormat";

export type TaskTimeLeft =
  | { kind: "starts_in"; label: string }
  | { kind: "in"; label: string }
  | { kind: "ends_in"; label: string }
  | { kind: "ended"; label: string }
  | { kind: "passed"; label: string }
  | null;

function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  if (totalMin < 1) return "now";
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  if (remH > 0) return `${days}d ${remH}h`;
  return `${days}d`;
}

/**
 * Countdown / remaining label for timed or duration tasks on a given date.
 * Returns null for daily tasks or when times are missing.
 */
export function getTaskTimeLeft(
  task: Task,
  date: string,
  now: Date = new Date()
): TaskTimeLeft {
  if (task.type === "daily") return null;

  if (task.type === "time-based" && task.time) {
    const at = localDateTime(date, task.time);
    if (!at) return null;
    const diff = at.getTime() - now.getTime();
    if (diff > 0) {
      const left = formatDuration(diff);
      return { kind: "in", label: left === "now" ? "now" : `in ${left}` };
    }
    return { kind: "passed", label: "passed" };
  }

  if (task.type === "duration" && task.startTime && task.endTime) {
    const startAt = localDateTime(date, task.startTime);
    if (!startAt) return null;
    let endAt = localDateTime(date, task.endTime);
    if (!endAt) return null;
    // Overnight duration: end is next calendar day
    if (task.endTime <= task.startTime) {
      endAt = addDays(endAt, 1);
    }

    const t = now.getTime();
    if (t < startAt.getTime()) {
      const left = formatDuration(startAt.getTime() - t);
      return { kind: "starts_in", label: left === "now" ? "starts now" : `starts in ${left}` };
    }
    if (t < endAt.getTime()) {
      const left = formatDuration(endAt.getTime() - t);
      return { kind: "ends_in", label: left === "now" ? "ending now" : `ends in ${left}` };
    }
    return { kind: "ended", label: "ended" };
  }

  return null;
}
