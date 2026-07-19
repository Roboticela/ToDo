// SPDX-License-Identifier: MIT

use tauri::{AppHandle, Runtime};
#[cfg(target_os = "android")]
use tauri::Manager;

use crate::error::Result;

/// Start the foreground service (idempotent — safe to call every app launch).
#[tauri::command]
pub async fn start_service<R: Runtime>(app: AppHandle<R>) -> Result<()> {
  #[cfg(target_os = "android")]
  {
    if let Some(svc) = app.try_state::<crate::android_only::ReminderService<R>>() {
      return svc.start_service();
    }
  }
  let _ = app;
  Err(crate::Error::Unavailable)
}

/// Stop the foreground service (user opted out of background reminders).
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
pub async fn reschedule_next<R: Runtime>(app: AppHandle<R>) -> Result<()> {
  #[cfg(target_os = "android")]
  {
    if let Some(svc) = app.try_state::<crate::android_only::ReminderService<R>>() {
      return svc.reschedule_next();
    }
  }
  let _ = app;
  Err(crate::Error::Unavailable)
}

/// Prompt the user to exempt the app from battery optimization (opens the
/// system `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` dialog).
#[tauri::command]
pub async fn request_battery_exemption<R: Runtime>(app: AppHandle<R>) -> Result<()> {
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
