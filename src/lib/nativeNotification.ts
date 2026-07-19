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
import { DEFAULT_LIBRARY_SOUND_ID, DEFAULT_RINGTONE_SOUND_ID } from "./soundCatalog";
import {
  getAndroidSoundChannelId,
  playReminderSoundNative,
} from "./reminderService";

export const CHANNEL_DEFAULT = "task-reminders";
export const CHANNEL_SILENT = "task-reminders-silent";
/** Native silent channel from ReminderNotifier — no OS tone; we play MediaPlayer. */
export const CHANNEL_ANDROID_CUSTOM = "task-reminders-native-custom-v3";

let channelsReady = false;

export function notifIdFromTag(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (Math.imul(31, h) + tag.charCodeAt(i)) | 0;
  }
  // Rust NotificationData.id is i32. `>>> 0` produced unsigned values that overflow
  // ~50% of UUID tags (and always "preview-normal"), so the toast invoke failed while
  // in-app sound still played.
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
  // Library / Custom always play in-app on desktop. Normal also plays via
  // play_system_sound / OS synth — Windows Media paths are not valid toast sounds.
  if (mode === "custom" || mode === "preset" || mode === "ringtone") return true;
  if (mode === "normal") return os === "windows" || os === "macos" || os === "linux";
  return false;
}

function buildSoundPayload(
  mode: NotificationSoundMode,
  os: OsKind,
  _soundId: string | undefined,
  silentOsToast: boolean,
  opts?: { scheduleAt?: boolean }
): { silent?: boolean; sound?: string; channelId: string; playNativeAudio?: boolean } {
  const channelId = silentOsToast ? CHANNEL_SILENT : CHANNEL_DEFAULT;
  if (silentOsToast) return { silent: true, channelId };

  // Windows toast `sound` only accepts names like "Default" / "Reminder", not file paths.
  // Actual Windows Media playback goes through play_system_sound in-app.
  if (mode === "normal" && os === "windows") {
    return { channelId, sound: "Default" };
  }

  // Android library/custom: never pass catalog IDs as res/raw names (they don't exist).
  // Immediate: silent native channel + MediaPlayer. Scheduled: per-file channel from sync.
  if (os === "android" && (mode === "preset" || mode === "ringtone" || mode === "custom")) {
    if (opts?.scheduleAt) {
      const fileChannel = getAndroidSoundChannelId();
      if (fileChannel) {
        return { channelId: fileChannel };
      }
      // No cached channel yet — fall back to default (sync should have run first).
      return { channelId };
    }
    return {
      channelId: CHANNEL_ANDROID_CUSTOM,
      silent: true,
      playNativeAudio: true,
    };
  }

  return { channelId };
}

export async function showTaskNotification(opts: ShowTaskNotificationOpts): Promise<void> {
  const mode: NotificationSoundMode = opts.mode ?? "preset";
  const os = getOsKind();
  const runtime = getAppRuntime();
  const isMobile = runtime === "android" || runtime === "ios";
  // Mobile: always use an audible OS notification (WebView audio is unreliable).
  // Desktop/web: may silence OS toast when playing in-app catalog/custom sound.
  const playInAppAudio = shouldPlayAppAudio(mode, os) && !opts.scheduleAt && !isMobile;
  const silentOsToast = playInAppAudio;

  if (isTauri()) {
    await showNativeNotification(opts, mode, os, silentOsToast);
  } else {
    await showWebNotification(opts, silentOsToast && mode !== "normal");
  }

  // Scheduled native notifications play OS/channel sound — skip in-app audio
  if (opts.scheduleAt || !playInAppAudio) {
    // Android library/custom: MediaPlayer via reminder-service (channel stays silent).
    if (
      !opts.scheduleAt &&
      os === "android" &&
      (mode === "preset" || mode === "ringtone" || mode === "custom")
    ) {
      await playReminderSoundNative({
        notificationSoundMode: mode,
        notificationSoundId: opts.soundId,
        customSoundUrl: opts.customSoundUrl,
      });
    }
    return;
  }

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
  // Desktop plugin ignores Schedule.at (shows immediately) — JS timers own desktop delivery.
  if (getAppRuntime() === "desktop") return;
  if (opts.scheduleAt.getTime() <= Date.now()) {
    return showTaskNotification({ ...opts, scheduleAt: undefined } as ShowTaskNotificationOpts);
  }

  await ensureNativeChannels();
  const mode: NotificationSoundMode = opts.mode ?? "preset";
  const os = getOsKind();
  // Prefer audible OS channel for background delivery (app audio won't run when killed)
  const soundBits = buildSoundPayload(mode, os, opts.soundId, false, { scheduleAt: true });

  try {
    const { sendNotification, Schedule } = await import("@tauri-apps/plugin-notification");
    const allowWhileIdle = getAppRuntime() === "android" || getAppRuntime() === "ios";
    await sendNotification({
      id: notifIdFromTag(opts.tag),
      title: opts.title,
      body: opts.body,
      channelId: soundBits.channelId,
      silent: soundBits.silent,
      sound: soundBits.sound,
      icon: "ic_notification",
      schedule: Schedule.at(opts.scheduleAt, false, allowWhileIdle),
    });
  } catch {
    // Alarm limit / unsupported schedule — JS timers remain as fallback
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

  // Windows: tauri-plugin-notification omits app_id under target/debug|release, so
  // toasts show as PowerShell. Use our WinRT toast with the registered AUMID instead.
  if (os === "windows" && getAppRuntime() === "desktop" && !opts.scheduleAt) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("show_windows_toast", {
        title: opts.title,
        body: opts.body,
        silent: silentOsToast,
      });
      return;
    } catch {
      // fall through to plugin / web
    }
  }

  try {
    const { sendNotification, Schedule } = await import("@tauri-apps/plugin-notification");
    const soundBits = buildSoundPayload(mode, os, opts.soundId, silentOsToast, {
      scheduleAt: Boolean(opts.scheduleAt),
    });

    const payload: {
      id: number;
      title: string;
      body: string;
      channelId: string;
      silent?: boolean;
      sound?: string;
      schedule?: ReturnType<typeof Schedule.at>;
      icon?: string;
    } = {
      id: notifIdFromTag(opts.tag),
      title: opts.title,
      body: opts.body,
      channelId: soundBits.channelId,
      silent: soundBits.silent,
      sound: soundBits.sound,
    };

    // Android uses the custom checklist icon; desktop uses the app auto-icon.
    if (getAppRuntime() === "android" || getAppRuntime() === "ios") {
      payload.icon = "ic_notification";
    }

    if (opts.scheduleAt && opts.scheduleAt.getTime() > Date.now()) {
      const allowWhileIdle = getAppRuntime() === "android" || getAppRuntime() === "ios";
      payload.schedule = Schedule.at(opts.scheduleAt, false, allowWhileIdle);
    }

    await sendNotification(payload);
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
    // BUG-35: `new Notification()` is illegal in mobile Chrome/Safari without a Service Worker
    // and throws TypeError: Illegal constructor. Use the SW API when available.
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration().catch(() => null);
      if (registration) {
        await registration.showNotification(opts.title, {
          body: opts.body,
          icon: "/favicon.svg",
          badge: "/favicon.svg",
          tag: opts.tag,
          silent,
        });
        return;
      }
    }
    // Desktop fallback: direct Notification constructor (valid on non-mobile browsers)
    new Notification(opts.title, {
      body: opts.body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: opts.tag,
      requireInteraction: false,
      silent,
    });
  } catch {
    // ignore — unsupported environment
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
            title: "ToDo",
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
