// SPDX-License-Identifier: MIT
//! Android-only persistent foreground service that delivers custom, actionable
//! task-reminder notifications ("Complete" / "Snooze") and keeps firing them even
//! when the app is fully closed. On other platforms the plugin loads but commands
//! return [crate::Error::Unavailable].

use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;
#[cfg(target_os = "android")]
use tauri::Manager;

pub use crate::error::{Error, Result};

#[cfg(target_os = "android")]
pub mod android_only;

mod commands;
mod error;

/// Register with [`tauri::Builder::plugin`]. No config needed — the service reads
/// everything it needs directly from the app's `todo.db`.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("reminder-service")
    .invoke_handler(tauri::generate_handler![
      commands::start_service,
      commands::stop_service,
      commands::reschedule_next,
      commands::request_battery_exemption,
      commands::cache_sound,
    ])
    .setup(move |app, api| {
      #[cfg(target_os = "android")]
      {
        let service = android_only::init(api)
          .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
        app.manage(service);
      }
      #[cfg(not(target_os = "android"))]
      {
        let _ = (app, api);
      }
      Ok(())
    })
    .build()
}
