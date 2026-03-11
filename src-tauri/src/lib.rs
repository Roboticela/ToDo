mod db;

use tauri::Manager;

#[tauri::command]
fn run_db_exec(
  state: tauri::State<db::AppDb>,
  payload: db::DbMethod,
) -> Result<serde_json::Value, String> {
  db::db_exec(state, payload)
}

/// Open a URL in the system default browser. Uses the system binary on each OS
/// so it works in production (e.g. Linux .deb/AppImage where xdg-open may not be in PATH).
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
  #[cfg(target_os = "linux")]
  {
    std::process::Command::new("/usr/bin/xdg-open")
      .arg(&url)
      .spawn()
      .map_err(|e| format!("Failed to open browser: {}", e))?;
    return Ok(());
  }
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg(&url)
      .spawn()
      .map_err(|e| format!("Failed to open browser: {}", e))?;
    return Ok(());
  }
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("explorer")
      .arg(&url)
      .spawn()
      .map_err(|e| format!("Failed to open browser: {}", e))?;
    return Ok(());
  }
  #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
  {
    let _ = url;
    Err("Opening URLs is not supported on this platform".into())
  }
}

#[tauri::command]
fn write_file(path: String, data: String) -> Result<(), String> {
    use std::io::Write;
    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &data,
    )
    .map_err(|e| format!("Failed to decode base64: {}", e))?;
    std::fs::File::create(&path)
        .map_err(|e| format!("Failed to create file: {}", e))?
        .write_all(&bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init());

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
  }

  builder
    .setup(|app| {
      // Persistent SQLite DB in app data dir (survives updates, never cleared by OS)
      if let Ok(data_dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&data_dir);
        let db_path = data_dir.join("todo.db");
        app.manage(db::AppDb::new(db_path));
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![write_file, run_db_exec, open_url])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
