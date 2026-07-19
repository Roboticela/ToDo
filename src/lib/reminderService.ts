/**
 * Bridge to the native `tauri-plugin-reminder-service` Android plugin.
 * Exact AlarmManager wakes a short-lived foreground worker to fire reminders
 * even when the app is fully closed. No-op on every other platform.
 */
import { invoke } from "@tauri-apps/api/core";
import type { User } from "../types/todo";
import { getAppRuntime } from "./platform";
import {
  DEFAULT_LIBRARY_SOUND_ID,
  DEFAULT_RINGTONE_SOUND_ID,
  getCatalogSound,
} from "./soundCatalog";

const STORAGE_KEY = "todo:background-reminder-service";
const BATTERY_PROMPTED_KEY = "todo:battery-exemption-prompted";

export interface ReminderCapability {
  enabled: boolean;
  exactAlarms: boolean;
  batteryExempt: boolean;
}

/** Set only after a successful native start_service invoke in this JS session. */
let nativeServiceRunning = false;
/** Exact alarms granted — required before native path exclusively owns delivery. */
let nativeExactAlarmsOk = false;
let lastCachedSoundKey: string | null = null;

function isAndroid(): boolean {
  return getAppRuntime() === "android";
}

/**
 * Whether the Android custom reminder service should run.
 * Defaults to ON when unset — custom WhatsApp-style notifications require it.
 */
export function isBackgroundServiceEnabledLocally(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) return true;
    return v === "true";
  } catch {
    return true;
  }
}

/**
 * True when native start succeeded AND exact alarms are granted.
 * Until exact alarms are granted, Schedule.at remains as fallback so reminders
 * are not silently dropped after the app is killed.
 */
export function isNativeReminderServiceRunning(): boolean {
  return isAndroid() && nativeServiceRunning && nativeExactAlarmsOk;
}

function persist(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // ignore
  }
}

function applyCapability(cap: ReminderCapability | null | undefined): void {
  if (!cap) return;
  nativeExactAlarmsOk = cap.exactAlarms === true;
}

/**
 * Start the reminder worker, prompt for exact alarms if needed, and arm the next wake.
 * Returns true when native delivery can exclusively own reminders (exact alarms OK).
 */
export async function startReminderService(): Promise<boolean> {
  if (!isAndroid()) return false;
  persist(true);
  try {
    const cap = await invoke<ReminderCapability>("plugin:reminder-service|start_service");
    nativeServiceRunning = true;
    applyCapability(cap);
    // Prompt battery exemption once after first successful start (OEM killers otherwise
    // delay/drop alarms when the app is swiped away).
    await maybePromptBatteryExemption(cap);
    return nativeExactAlarmsOk;
  } catch {
    nativeServiceRunning = false;
    nativeExactAlarmsOk = false;
    return false;
  }
}

/** Stop the reminder worker (user opted out of background reminders). */
export async function stopReminderService(): Promise<void> {
  if (!isAndroid()) return;
  persist(false);
  nativeServiceRunning = false;
  nativeExactAlarmsOk = false;
  try {
    await invoke("plugin:reminder-service|stop_service");
  } catch {
    // ignore
  }
}

/**
 * Tell the native service to re-read pending reminders from `todo.db` and re-arm its
 * next wake alarm. Tiny local IPC call — the service re-derives everything itself.
 */
export async function rescheduleReminderService(): Promise<void> {
  if (!isAndroid()) return;
  try {
    const cap = await invoke<ReminderCapability>("plugin:reminder-service|reschedule_next");
    applyCapability(cap);
  } catch {
    // ignore
  }
}

/**
 * Open system screens for exact alarms (via service start) + battery exemption.
 * Call from Settings when the user taps Allow.
 */
export async function ensureAndroidBackgroundPermissions(): Promise<ReminderCapability | null> {
  if (!isAndroid()) return null;
  try {
    // Re-arm worker and prompt exact alarms if still missing.
    const started = await invoke<ReminderCapability>("plugin:reminder-service|start_service");
    nativeServiceRunning = true;
    applyCapability(started);
  } catch {
    // continue to battery prompt
  }
  try {
    const cap = await invoke<ReminderCapability>(
      "plugin:reminder-service|request_battery_exemption"
    );
    applyCapability(cap);
    try {
      localStorage.setItem(BATTERY_PROMPTED_KEY, "true");
    } catch {
      // ignore
    }
    return cap;
  } catch {
    return null;
  }
}

/** Prompt the user to exempt the app from battery optimization (system dialog). */
export async function requestReminderBatteryExemption(): Promise<void> {
  await ensureAndroidBackgroundPermissions();
}

async function maybePromptBatteryExemption(cap: ReminderCapability | null | undefined): Promise<void> {
  if (cap?.batteryExempt) return;
  let already = false;
  try {
    already = localStorage.getItem(BATTERY_PROMPTED_KEY) === "true";
  } catch {
    already = false;
  }
  if (already) return;
  try {
    const next = await invoke<ReminderCapability>(
      "plugin:reminder-service|request_battery_exemption"
    );
    applyCapability(next);
    localStorage.setItem(BATTERY_PROMPTED_KEY, "true");
  } catch {
    // ignore
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchSoundBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Push the user's selected reminder sound into native storage so Android
 * ReminderNotifier can play Library/Custom audio while the app is closed.
 * Normal mode clears the custom cache and uses the OS default channel sound.
 */
export async function syncReminderSoundToNative(
  user: User | null | undefined,
  opts?: { force?: boolean }
): Promise<void> {
  if (!isAndroid() || !user) return;
  const force = opts?.force === true;

  const mode = user.notificationSoundMode === "ringtone" ? "preset" : (user.notificationSoundMode ?? "preset");

  if (mode === "normal") {
    if (!force && lastCachedSoundKey === "normal") return;
    try {
      await invoke("plugin:reminder-service|cache_sound", {
        key: "normal",
        dataBase64: "",
      });
      lastCachedSoundKey = "normal";
    } catch {
      // ignore — notifications fall back to OS default
    }
    return;
  }

  let key = "normal";
  let sourceUrl: string | null = null;

  if (mode === "custom" && user.customSoundUrl) {
    key = "custom";
    sourceUrl = user.customSoundUrl;
  } else {
    const soundId =
      getCatalogSound(user.notificationSoundId)?.id ||
      (user.notificationSoundMode === "ringtone"
        ? DEFAULT_RINGTONE_SOUND_ID
        : DEFAULT_LIBRARY_SOUND_ID);
    const catalog = getCatalogSound(soundId);
    key = `preset_${soundId.replace(/-/g, "_")}`;
    sourceUrl = catalog?.src ?? `/sounds/${soundId}.mp3`;
  }

  if (!force && lastCachedSoundKey === key) return;

  const bytes = sourceUrl ? await fetchSoundBytes(sourceUrl) : null;
  if (!bytes || bytes.length === 0) return;

  try {
    await invoke("plugin:reminder-service|cache_sound", {
      key,
      dataBase64: bytesToBase64(bytes),
    });
    lastCachedSoundKey = key;
  } catch {
    // ignore — OS default remains as fallback
  }
}
