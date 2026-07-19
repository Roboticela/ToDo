// SPDX-License-Identifier: MIT

const COMMANDS: &[&str] = &[
  "start_service",
  "stop_service",
  "reschedule_next",
  "request_battery_exemption",
  "cache_sound",
];

fn main() {
  let result = tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .try_build();

  if !(cfg!(docsrs) && std::env::var("TARGET").unwrap().contains("android")) {
    result.expect("tauri reminder-service plugin build");
  }
}
