// SPDX-License-Identifier: MIT
//! Android bridge for `tauri-plugin-reminder-service` (Tauri 2.10+ uses `PluginHandle<R>` and `PluginApi<R, C>`.)

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tauri::plugin::PluginHandle;
use tauri::Runtime;

use crate::error::Result;

pub const PLUGIN_ID: &str = "app.tauri.reminderservice";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReminderCapability {
  pub enabled: bool,
  pub exact_alarms: bool,
  pub battery_exempt: bool,
}

/// Managed handle for the Kotlin `ReminderServicePlugin` (Android only; state is absent on other platforms).
pub struct ReminderService<R: Runtime>(pub PluginHandle<R>);

impl<R: Runtime> ReminderService<R> {
  pub fn start_service(&self) -> Result<ReminderCapability> {
    self
      .0
      .run_mobile_plugin("startService", ())
      .map_err(|e| crate::Error::Other(e.to_string()))
  }

  pub fn stop_service(&self) -> Result<()> {
    self
      .0
      .run_mobile_plugin("stopService", ())
      .map_err(|e| crate::Error::Other(e.to_string()))
  }

  pub fn reschedule_next(&self) -> Result<ReminderCapability> {
    self
      .0
      .run_mobile_plugin("rescheduleNext", ())
      .map_err(|e| crate::Error::Other(e.to_string()))
  }

  pub fn request_battery_exemption(&self) -> Result<ReminderCapability> {
    self
      .0
      .run_mobile_plugin("requestBatteryExemption", ())
      .map_err(|e| crate::Error::Other(e.to_string()))
  }

  pub fn cache_sound(&self, key: String, data_base64: String) -> Result<()> {
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Args {
      key: String,
      data_base64: String,
    }
    self
      .0
      .run_mobile_plugin("cacheSound", Args { key, data_base64 })
      .map_err(|e| crate::Error::Other(e.to_string()))
  }
}

pub fn init<R: Runtime, C: DeserializeOwned>(
  api: tauri::plugin::PluginApi<R, C>,
) -> Result<ReminderService<R>> {
  let handle = api
    .register_android_plugin(PLUGIN_ID, "ReminderServicePlugin")
    .map_err(|e| crate::Error::Other(e.to_string()))?;
  Ok(ReminderService(handle))
}
