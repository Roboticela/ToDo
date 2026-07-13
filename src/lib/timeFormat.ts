import type { TimeFormat } from "../types/todo";

/** Parse "HH:MM" (24h) into parts. */
export function parseHhMm(value: string): { hour24: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour24 = Number(m[1]);
  const minute = Number(m[2]);
  if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) return null;
  return { hour24, minute };
}

/**
 * Build a Date in the device local timezone from YYYY-MM-DD + HH:MM.
 * Avoids ISO string parsing, which some engines treat as UTC.
 */
export function localDateTime(dateYmd: string, hhmm: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd.trim());
  const tm = parseHhMm(hhmm);
  if (!dm || !tm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const date = new Date(y, mo - 1, d, tm.hour24, tm.minute, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Format stored "HH:MM" for display using 12h or 24h preference (no timezone shift). */
export function formatTime(hhmm: string, timeFormat: TimeFormat = "12h"): string {
  const p = parseHhMm(hhmm);
  if (!p) return hhmm;
  if (timeFormat === "24h") {
    return `${String(p.hour24).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  }
  const hour12 = p.hour24 % 12 || 12;
  const ampm = p.hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${String(p.minute).padStart(2, "0")} ${ampm}`;
}

export function formatTimeRange(
  start: string,
  end: string,
  timeFormat: TimeFormat = "12h"
): string {
  return `${formatTime(start, timeFormat)} – ${formatTime(end, timeFormat)}`;
}

/** Current device-local time as "HH:MM" (24h storage form). */
export function nowLocalHhMm(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function uses24h(timeFormat?: TimeFormat | null): boolean {
  return timeFormat === "24h";
}
