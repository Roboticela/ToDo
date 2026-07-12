mod db;

#[cfg(desktop)]
mod desktop;

#[cfg(desktop)]
use tauri::Emitter;
use tauri::Manager;

/// Set to `true` to open the WebView inspector (devtools) on app startup.
#[allow(dead_code)]
const ENABLE_INSPECTOR: bool = false;

#[tauri::command]
fn run_db_exec(
    state: tauri::State<db::AppDb>,
    method: db::DbMethod,
) -> Result<serde_json::Value, String> {
    db::db_exec(state, method)
}

/// Open a URL in the system default browser.
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
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
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
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    std::fs::File::create(&path)
        .map_err(|e| format!("Failed to create file: {}", e))?
        .write_all(&bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

/// Play a local system sound file (Windows Media, macOS .aiff, Linux wav/ogg).
#[tauri::command]
fn play_system_sound(path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("Empty sound path".into());
    }
    if !std::path::Path::new(&path).is_file() {
        return Err(format!("Sound file not found: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = std::ffi::OsStr::new(&path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        const SND_FILENAME: u32 = 0x0002_0000;
        const SND_ASYNC: u32 = 0x0000_0001;
        #[link(name = "winmm")]
        extern "system" {
            fn PlaySoundW(psz_sound: *const u16, hmod: isize, fdw_sound: u32) -> i32;
        }
        let ok = unsafe { PlaySoundW(wide.as_ptr(), 0, SND_FILENAME | SND_ASYNC) };
        if ok == 0 {
            return Err(format!("PlaySoundW failed for {}", path));
        }
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("afplay")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("afplay failed: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        if std::process::Command::new("paplay").arg(&path).spawn().is_ok() {
            return Ok(());
        }
        std::process::Command::new("aplay")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Could not play sound (paplay/aplay): {}", e))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = path;
        Err("System sound playback is not supported on this platform".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_android_ui::init(
            tauri_plugin_android_ui::AndroidUiConfig::DEFAULT,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    let builder = {
        builder
            .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.set_focus();
                    let _ = win.unminimize();
                    let _ = win.show();
                }
                for arg in args.iter() {
                    if arg.starts_with("roboticela-todo://") {
                        let _ = Emitter::emit(app, "deep-link-url", arg.as_str());
                        break;
                    }
                }
            }))
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .manage(desktop::DesktopState::default())
            .on_window_event(|window, event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let prefs = desktop::load_prefs(window.app_handle());
                    if prefs.minimize_to_tray && prefs.show_tray_icon {
                        let _ = window.hide();
                        api.prevent_close();
                    }
                }
            })
    };

    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        write_file,
        run_db_exec,
        open_url,
        play_system_sound,
        desktop::get_desktop_prefs,
        desktop::set_desktop_prefs,
    ]);

    #[cfg(not(desktop))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        write_file,
        run_db_exec,
        open_url,
        play_system_sound,
    ]);

    builder
        .setup(|app| {
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

            #[cfg(desktop)]
            {
                desktop::setup_tray(app.handle())?;
                // Show main window after tray is ready (config starts visible:false)
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                }
            }

            #[cfg(feature = "devtools")]
            if ENABLE_INSPECTOR {
                let handle = app.handle().clone();
                app.run_on_main_thread(move || {
                    if let Some(window) = handle.get_webview_window("main") {
                        window.open_devtools();
                    }
                })
                .ok();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
