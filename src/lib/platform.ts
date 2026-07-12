import { isTauri } from "./tauri";

export type AppRuntime = "web" | "desktop" | "android" | "ios";
export type OsKind = "windows" | "macos" | "linux" | "android" | "ios" | "unknown";

/** Coarse runtime: browser vs Tauri desktop vs Tauri mobile. */
export function getAppRuntime(): AppRuntime {
  if (!isTauri()) return "web";
  const os = getOsKind();
  if (os === "android") return "android";
  if (os === "ios") return "ios";
  return "desktop";
}

/**
 * Best-effort OS detection for sound/notification routing.
 * Tauri WebViews expose a platform-identifiable userAgent.
 */
export function getOsKind(): OsKind {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();

  if (/android/.test(ua)) return "android";
  // iPadOS 13+ may report as Mac; check touch points
  if (/iphone|ipod|ipad/.test(ua) || (platform.includes("mac") && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/win/.test(ua) || platform.startsWith("win")) return "windows";
  if (/mac/.test(ua) || platform.startsWith("mac")) return "macos";
  if (/linux/.test(ua) || platform.startsWith("linux")) return "linux";
  return "unknown";
}

export function isNativeShell(): boolean {
  return isTauri();
}
