import { isTauri } from "./tauri";
import { getAppRuntime } from "./platform";

export interface DesktopPrefs {
  /** Close button hides to tray instead of quitting (keeps background reminders). */
  minimizeToTray: boolean;
  /** Show the system tray / notification-area icon. */
  showTrayIcon: boolean;
  /** Launch the app when the OS starts / user signs in. */
  launchAtStartup: boolean;
}

const DEFAULT_PREFS: DesktopPrefs = {
  minimizeToTray: true,
  showTrayIcon: true,
  launchAtStartup: false,
};

export function isDesktopShell(): boolean {
  return isTauri() && getAppRuntime() === "desktop";
}

export async function getDesktopPrefs(): Promise<DesktopPrefs> {
  if (!isDesktopShell()) return { ...DEFAULT_PREFS };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const prefs = await invoke<DesktopPrefs>("get_desktop_prefs");
    return {
      minimizeToTray: prefs.minimizeToTray !== false,
      showTrayIcon: prefs.showTrayIcon !== false,
      launchAtStartup: prefs.launchAtStartup === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function setDesktopPrefs(prefs: DesktopPrefs): Promise<DesktopPrefs> {
  if (!isDesktopShell()) return prefs;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<DesktopPrefs>("set_desktop_prefs", { prefs });
}
