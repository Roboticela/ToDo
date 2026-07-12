/**
 * Cross-platform task notifications.
 * - Tauri (Windows / macOS / Linux / Android / iOS): native plugin + OS default sounds
 * - Web: Notification API
 *
 * Sound modes:
 * - normal   → each OS default notification sound (no app audio)
 * - ringtone → platform system alert tone when available, else in-app chime
 * - custom   → silent OS toast + uploaded audio playback
 */

import type { NotificationSoundMode } from "../types/todo";
import { isTauri } from "./tauri";
import { getOsKind, type OsKind } from "./platform";
import { playCustomSound, playRingtone } from "./notificationSound";

const CHANNEL_DEFAULT = "task-reminders";
const CHANNEL_SILENT = "task-reminders-silent";

let channelsReady = false;

function notifIdFromTag(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (Math.imul(31, h) + tag.charCodeAt(i)) | 0;
  }
  // Keep in signed 32-bit range, avoid 0
  return h === 0 ? 1 : h;
}

/**
 * Platform system alert for "ringtone" mode.
 * Omitting sound on Windows/Android/iOS uses the OS default notification sound.
 */
function platformRingtoneSound(os: OsKind): string | undefined {
  switch (os) {
    case "macos":
      // Named system sound installed with macOS
      return "Ping";
    case "linux":
      // Freedesktop / XDG theme sound
      return "message-new-instant";
    case "windows":
      // Windows toast default sound (plugin expects a .wav path for custom;
      // omit to use the system notification sound)
      return undefined;
    case "android":
    case "ios":
      // Channel / UNNotificationSound.default
      return undefined;
    default:
      return undefined;
  }
}

async function ensureNativeChannels(): Promise<void> {
  if (channelsReady || !isTauri()) return;
  try {
    const { createChannel, Importance, Visibility } = await import(
      "@tauri-apps/plugin-notification"
    );
    // Default channel → Android/iOS play the device default notification sound
    await createChannel({
      id: CHANNEL_DEFAULT,
      name: "Task reminders",
      description: "Reminders for timed and duration tasks",
      importance: Importance.High,
      visibility: Visibility.Private,
      vibration: true,
      lights: true,
      // no `sound` → OS / user default
    });
    // Silent channel for custom / in-app ringtone (avoid double sound with OS default)
    await createChannel({
      id: CHANNEL_SILENT,
      name: "Task reminders (custom sound)",
      description: "Visual reminders when using a custom or in-app alert sound",
      importance: Importance.Default,
      visibility: Visibility.Private,
      vibration: true,
      lights: false,
    });
    channelsReady = true;
  } catch {
    // Channels are Android-primary; desktop may no-op
    channelsReady = true;
  }
}

export async function ensureNotificationChannels(): Promise<void> {
  await ensureNativeChannels();
}

export async function isNativePermissionGranted(): Promise<boolean> {
  if (isTauri()) {
    try {
      const { isPermissionGranted } = await import("@tauri-apps/plugin-notification");
      return await isPermissionGranted();
    } catch {
      // fall through
    }
  }
  if (!("Notification" in window)) return false;
  return Notification.permission === "granted";
}

export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (isTauri()) {
    try {
      const { isPermissionGranted, requestPermission } = await import(
        "@tauri-apps/plugin-notification"
      );
      let granted = await isPermissionGranted();
      if (!granted) {
        const result = await requestPermission();
        granted = result === "granted";
      }
      if (granted) await ensureNativeChannels();
      return granted;
    } catch {
      // fall through to Web API
    }
  }
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function getNotificationPermissionState(): NotificationPermission | "unsupported" {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export interface ShowTaskNotificationOpts {
  title: string;
  body: string;
  tag: string;
  mode?: NotificationSoundMode;
  customSoundUrl?: string;
}

/**
 * Show a task reminder using the best path for the current platform,
 * then play app-owned audio only when needed (ringtone fallback / custom).
 */
export async function showTaskNotification(opts: ShowTaskNotificationOpts): Promise<void> {
  const mode: NotificationSoundMode = opts.mode ?? "normal";
  const os = getOsKind();
  const useAppAudio = mode === "custom" || (mode === "ringtone" && needsAppRingtone(os));
  const silentOsToast = mode === "custom" || useAppAudio;

  if (isTauri()) {
    await showNativeNotification(opts, mode, os, silentOsToast);
  } else {
    await showWebNotification(opts, silentOsToast);
  }

  // App-owned audio (never for "normal" — OS already played its default)
  if (mode === "custom" && opts.customSoundUrl) {
    await playCustomSound(opts.customSoundUrl);
  } else if (mode === "ringtone" && needsAppRingtone(os)) {
    await playRingtone();
  } else if (mode === "ringtone" && !isTauri()) {
    // Web has no reliable OS ringtone hook
    await playRingtone();
  }
}

function needsAppRingtone(os: OsKind): boolean {
  // macOS / Linux: named system sounds via the plugin ("Ping", XDG theme).
  // Windows / Android / iOS / web: play our in-app ringtone (OS "default"
  // is already used by Normal mode, so Ringtone stays distinct).
  return os !== "macos" && os !== "linux";
}

async function showNativeNotification(
  opts: ShowTaskNotificationOpts,
  mode: NotificationSoundMode,
  os: OsKind,
  silentOsToast: boolean
): Promise<void> {
  await ensureNativeChannels();
  try {
    const { sendNotification } = await import("@tauri-apps/plugin-notification");

    const payload: {
      id: number;
      title: string;
      body: string;
      channelId: string;
      silent?: boolean;
      sound?: string;
    } = {
      id: notifIdFromTag(opts.tag),
      title: opts.title,
      body: opts.body,
      channelId: silentOsToast ? CHANNEL_SILENT : CHANNEL_DEFAULT,
    };

    if (silentOsToast) {
      payload.silent = true;
    } else if (mode === "ringtone") {
      const sound = platformRingtoneSound(os);
      if (sound) payload.sound = sound;
      // else: OS / channel default (Android, iOS, Windows)
    }
    // mode === "normal": no sound field → Windows/macOS/Linux/Android/iOS defaults

    sendNotification(payload);
  } catch {
    await showWebNotification(opts, silentOsToast);
  }
}

async function showWebNotification(
  opts: ShowTaskNotificationOpts,
  silent: boolean
): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(opts.title, {
      body: opts.body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: opts.tag,
      requireInteraction: false,
      silent,
    });
  } catch {
    // ignore
  }
}

/** Preview helper for Settings — respects mode without scheduling a task. */
export async function previewNotificationSound(opts: {
  mode: NotificationSoundMode;
  customSoundUrl?: string;
}): Promise<void> {
  const mode = opts.mode;
  const os = getOsKind();

  if (mode === "normal") {
    if (isTauri()) {
      await showTaskNotification({
        title: "Roboticela ToDo",
        body: "This uses your system default notification sound.",
        tag: "preview-normal",
        mode: "normal",
      });
    } else if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Roboticela ToDo", {
        body: "This uses your browser / OS default notification sound.",
        tag: "preview-normal",
        silent: false,
      });
    } else {
      await playRingtone();
    }
    return;
  }

  if (mode === "ringtone") {
    if (isTauri() && !needsAppRingtone(os)) {
      await showTaskNotification({
        title: "Roboticela ToDo",
        body: "Ringtone preview",
        tag: "preview-ringtone",
        mode: "ringtone",
      });
    } else {
      await playRingtone();
    }
    return;
  }

  if (mode === "custom" && opts.customSoundUrl) {
    await playCustomSound(opts.customSoundUrl);
  }
}
