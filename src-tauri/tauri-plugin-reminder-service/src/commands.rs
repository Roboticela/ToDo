// SPDX-License-Identifier: MIT

use tauri::{AppHandle, Runtime};
#[cfg(target_os = "android")]
use tauri::Manager;

use crate::error::Result;

#[cfg(target_os = "android")]
pub use crate::android_only::ReminderCapability;

#[cfg(not(target_os = "android"))]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReminderCapability {
  pub enabled: bool,
  pub exact_alarms: bool,
  pub battery_exempt: bool,
}

/// Start the reminder worker (idempotent — safe to call every app launch).
/// Opens exact-alarm settings when needed and returns current capability flags.
#[tauri::command]
pub async fn start_service<R: Runtime>(app: AppHandle<R>) -> Result<ReminderCapability> {
  #[cfg(target_os = "android")]
  {
    if let Some(svc) = app.try_state::<crate::android_only::ReminderService<R>>() {
      return svc.start_service();
    }
  }
  let _ = app;
  Err(crate::Error::Unavailable)
}

/// Stop the reminder worker (user opted out of background reminders).
#[tauri::command]
pub async fn stop_service<R: Runtime>(app: AppHandle<R>) -> Result<()> {
  #[cfg(target_os = "android")]
  {
    if let Some(svc) = app.try_state::<crate::android_only::ReminderService<R>>() {
      return svc.stop_service();
    }
  }
  let _ = app;
  Err(crate::Error::Unavailable)
}

/// Tell the service to re-read pending reminders from `todo.db` and re-arm its
/// next wake alarm. Call this whenever reminders are created/edited/deleted —
/// it's a tiny local IPC call, not a data dump.
#[tauri::command]
pub async fn reschedule_next<R: Runtime>(app: AppHandle<R>) -> Result<ReminderCapability> {
  #[cfg(target_os = "android")]
  {
    if let Some(svc) = app.try_state::<crate::android_only::ReminderService<R>>() {
      return svc.reschedule_next();
    }
  }
  let _ = app;
  Err(crate::Error::Unavailable)
}

/// Prompt exact-alarm + battery-optimization grant screens when missing.
#[tauri::command]
pub async fn request_battery_exemption<R: Runtime>(app: AppHandle<R>) -> Result<ReminderCapability> {
  #[cfg(target_os = "android")]
  {
    if let Some(svc) = app.try_state::<crate::android_only::ReminderService<R>>() {
      return svc.request_battery_exemption();
    }
  }
  let _ = app;
  Err(crate::Error::Unavailable)
}

/// Cache the selected library/custom reminder sound so native notifications can
/// play it while the app is closed.
#[tauri::command]
pub async fn cache_sound<R: Runtime>(
  app: AppHandle<R>,
  key: String,
  data_base64: String,
) -> Result<()> {
  #[cfg(target_os = "android")]
  {
    if let Some(svc) = app.try_state::<crate::android_only::ReminderService<R>>() {
      return svc.cache_sound(key, data_base64);
    }
  }
  let _ = (app, key, data_base64);
  Err(crate::Error::Unavailable)
}
