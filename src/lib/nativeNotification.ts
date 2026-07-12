/**
 * Cross-platform task notifications.
 * - Immediate toasts + OS sounds
 * - Native Schedule.at for Android/desktop background delivery (app killed / sleeping)
 */

import type { NotificationSoundMode } from "../types/todo";
import { isTauri } from "./tauri";
import { getAppRuntime, getOsKind, type OsKind } from "./platform";
import {
  playCatalogSound,
  playCustomSound,
  playOsDefaultNotify,
  playWindowsDefaultNotify,
} from "./notificationSound";
import { DEFAULT_LIBRARY_SOUND_ID, DEFAULT_RINGTONE_SOUND_ID, windowsMediaPath } from "./soundCatalog";

export const CHANNEL_DEFAULT = "task-reminders";
export const CHANNEL_SILENT = "task-reminders-silent";

let channelsReady = false;

export function notifIdFromTag(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (Math.imul(31, h) + tag.charCodeAt(i)) | 0;
  }
  return h === 0 ? 1 : h;
}

async function ensureNativeChannels(): Promise<void> {
  if (channelsReady || !isTauri()) return;
  try {
    const { createChannel, Importance, Visibility } = await import(
      "@tauri-apps/plugin-notification"
    );
    await createChannel({
      id: CHANNEL_DEFAULT,
      name: "Task reminders",
      description: "Reminders for timed and duration tasks",
      importance: Importance.High,
      visibility: Visibility.Private,
      vibration: true,
      lights: true,
    });
    await createChannel({
      id: CHANNEL_SILENT,
      name: "Task reminders (custom sound)",
      description: "Visual reminders when using a custom or library alert sound",
      importance: Importance.Default,
      visibility: Visibility.Private,
      vibration: true,
      lights: false,
    });
    channelsReady = true;
  } catch {
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
      // fall through
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
  soundId?: string;
  /** When set, schedule natively so it fires even if the app is backgrounded/killed. */
  scheduleAt?: Date;
}

function shouldPlayAppAudio(mode: NotificationSoundMode, os: OsKind): boolean {
  if (mode === "custom" || mode === "preset" || mode === "ringtone") return true;
  return os === "windows";
}

function buildSoundPayload(
  mode: NotificationSoundMode,
  os: OsKind,
  _soundId: string | undefined,
  silentOsToast: boolean
): { silent?: boolean; sound?: string; channelId: string } {
  const channelId = silentOsToast ? CHANNEL_SILENT : CHANNEL_DEFAULT;
  if (silentOsToast) return { silent: true, channelId };

  if (mode === "normal" && os === "windows") {
    return {
      channelId,
      sound: windowsMediaPath("Windows Notify System Generic.wav"),
    };
  }
  // Library plays bundled MP3 in-app when foregrounded; scheduled uses OS channel default
  return { channelId };
}

export async function showTaskNotification(opts: ShowTaskNotificationOpts): Promise<void> {
  const mode: NotificationSoundMode = opts.mode ?? "preset";
  const os = getOsKind();
  const playAudio = shouldPlayAppAudio(mode, os) && !opts.scheduleAt;
  const silentOsToast = playAudio;

  if (isTauri()) {
    await showNativeNotification(opts, mode, os, silentOsToast);
  } else {
    await showWebNotification(opts, silentOsToast && mode !== "normal");
  }

  // Scheduled native notifications play OS/channel sound — skip in-app audio
  if (opts.scheduleAt || !playAudio) return;

  if (mode === "custom" && opts.customSoundUrl) {
    await playCustomSound(opts.customSoundUrl);
    return;
  }
  if (mode === "preset") {
    await playCatalogSound(opts.soundId || DEFAULT_LIBRARY_SOUND_ID);
    return;
  }
  if (mode === "ringtone") {
    await playCatalogSound(opts.soundId || DEFAULT_RINGTONE_SOUND_ID);
    return;
  }
  if (mode === "normal") {
    if (os === "windows") {
      if (!(await playWindowsDefaultNotify())) await playOsDefaultNotify();
    } else {
      await playOsDefaultNotify();
    }
  }
}

/**
 * Register a native OS-scheduled notification (Android/desktop).
 * Survives app backgrounding; on Android uses allowWhileIdle when possible.
 */
export async function scheduleNativeNotification(
  opts: ShowTaskNotificationOpts & { scheduleAt: Date }
): Promise<void> {
  if (!isTauri()) return;
  if (opts.scheduleAt.getTime() <= Date.now()) return;

  await ensureNativeChannels();
  const mode: NotificationSoundMode = opts.mode ?? "preset";
  const os = getOsKind();
  // Prefer audible OS channel for background delivery (app audio won't run when killed)
  const soundBits = buildSoundPayload(mode, os, opts.soundId, false);

  try {
    const { sendNotification, Schedule } = await import("@tauri-apps/plugin-notification");
    const allowWhileIdle = getAppRuntime() === "android" || getAppRuntime() === "ios";
    sendNotification({
      id: notifIdFromTag(opts.tag),
      title: opts.title,
      body: opts.body,
      channelId: soundBits.channelId,
      silent: soundBits.silent,
      sound: soundBits.sound,
      schedule: Schedule.at(opts.scheduleAt, false, allowWhileIdle),
    });
  } catch {
    // Plugin may not support schedule on this platform — JS timers remain
  }
}

export async function cancelNativeNotification(tag: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { cancel } = await import("@tauri-apps/plugin-notification");
    await cancel([notifIdFromTag(tag)]);
  } catch {
    // ignore
  }
}

export async function cancelAllNativeNotifications(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { cancelAll } = await import("@tauri-apps/plugin-notification");
    await cancelAll();
  } catch {
    // ignore
  }
}

async function showNativeNotification(
  opts: ShowTaskNotificationOpts,
  mode: NotificationSoundMode,
  os: OsKind,
  silentOsToast: boolean
): Promise<void> {
  await ensureNativeChannels();
  try {
    const { sendNotification, Schedule } = await import("@tauri-apps/plugin-notification");
    const soundBits = buildSoundPayload(mode, os, opts.soundId, silentOsToast);

    const payload: {
      id: number;
      title: string;
      body: string;
      channelId: string;
      silent?: boolean;
      sound?: string;
      schedule?: ReturnType<typeof Schedule.at>;
    } = {
      id: notifIdFromTag(opts.tag),
      title: opts.title,
      body: opts.body,
      channelId: soundBits.channelId,
      silent: soundBits.silent,
      sound: soundBits.sound,
    };

    if (opts.scheduleAt && opts.scheduleAt.getTime() > Date.now()) {
      const allowWhileIdle = getAppRuntime() === "android" || getAppRuntime() === "ios";
      payload.schedule = Schedule.at(opts.scheduleAt, false, allowWhileIdle);
    }

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

export async function previewNotificationSound(opts: {
  mode: NotificationSoundMode;
  customSoundUrl?: string;
  soundId?: string;
}): Promise<void> {
  const mode = opts.mode;

  if (mode === "normal") {
    await playOsDefaultNotify();
    if (isTauri()) {
      try {
        await showNativeNotification(
          {
            title: "Roboticela ToDo",
            body: "System default notification sound",
            tag: "preview-normal",
            mode: "normal",
          },
          "normal",
          getOsKind(),
          true
        );
      } catch {
        // visual optional
      }
    }
    return;
  }

  if (mode === "preset") {
    await playCatalogSound(opts.soundId || DEFAULT_LIBRARY_SOUND_ID);
    return;
  }
  if (mode === "ringtone") {
    await playCatalogSound(opts.soundId || DEFAULT_RINGTONE_SOUND_ID);
    return;
  }

  if (mode === "custom" && opts.customSoundUrl) {
    await playCustomSound(opts.customSoundUrl);
  }
}
