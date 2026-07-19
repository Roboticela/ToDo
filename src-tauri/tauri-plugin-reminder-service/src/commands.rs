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
) -> Result<SoundCacheResult> {
  #[cfg(target_os = "android")]
  {
    if let Some(svc) = app.try_state::<crate::android_only::ReminderService<R>>() {
      return svc.cache_sound(key, data_base64);
    }
  }
  let _ = (app, key, data_base64);
  Err(crate::Error::Unavailable)
}

/// Activate a bundled catalog sound (no JS→native byte transfer).
#[tauri::command]
pub async fn activate_library_sound<R: Runtime>(
  app: AppHandle<R>,
  sound_id: Option<String>,
) -> Result<SoundCacheResult> {
  #[cfg(target_os = "android")]
  {
    if let Some(svc) = app.try_state::<crate::android_only::ReminderService<R>>() {
      return svc.activate_library_sound(sound_id);
    }
  }
  let _ = (app, sound_id);
  Err(crate::Error::Unavailable)
}

/// Play the selected library/custom sound once (immediate reminders).
#[tauri::command]
pub async fn play_sound<R: Runtime>(
  app: AppHandle<R>,
  mode: Option<String>,
  sound_id: Option<String>,
  custom_sound_url: Option<String>,
) -> Result<SoundCacheResult> {
  #[cfg(target_os = "android")]
  {
    if let Some(svc) = app.try_state::<crate::android_only::ReminderService<R>>() {
      return svc.play_sound(mode, sound_id, custom_sound_url);
    }
  }
  let _ = (app, mode, sound_id, custom_sound_url);
  Err(crate::Error::Unavailable)
}

#[cfg(target_os = "android")]
pub use crate::android_only::SoundCacheResult;

#[cfg(not(target_os = "android"))]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SoundCacheResult {
  pub ok: bool,
  pub channel_id: Option<String>,
}
