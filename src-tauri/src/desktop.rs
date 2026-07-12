//! Desktop system tray + local prefs (minimize to tray, show/hide tray icon, launch at startup).

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, State,
};
use tauri_plugin_autostart::ManagerExt;

const PREFS_FILE: &str = "desktop_prefs.json";
const TRAY_ID: &str = "main-tray";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPrefs {
    /// Close button hides the window instead of quitting (keeps reminders alive).
    pub minimize_to_tray: bool,
    /// Show the system tray icon. When false, close quits the app.
    pub show_tray_icon: bool,
    /// Launch the app when the user signs in to the OS.
    #[serde(default)]
    pub launch_at_startup: bool,
}

impl Default for DesktopPrefs {
    fn default() -> Self {
        Self {
            minimize_to_tray: true,
            show_tray_icon: true,
            launch_at_startup: false,
        }
    }
}

pub struct DesktopState {
    pub prefs: Mutex<DesktopPrefs>,
}

impl Default for DesktopState {
    fn default() -> Self {
        Self {
            prefs: Mutex::new(DesktopPrefs::default()),
        }
    }
}

fn prefs_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(PREFS_FILE))
}

pub fn load_prefs(app: &AppHandle) -> DesktopPrefs {
    if let Some(path) = prefs_path(app) {
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(prefs) = serde_json::from_str::<DesktopPrefs>(&raw) {
                if let Some(state) = app.try_state::<DesktopState>() {
                    if let Ok(mut g) = state.prefs.lock() {
                        *g = prefs.clone();
                    }
                }
                return prefs;
            }
        }
    }
    if let Some(state) = app.try_state::<DesktopState>() {
        if let Ok(g) = state.prefs.lock() {
            return g.clone();
        }
    }
    DesktopPrefs::default()
}

fn save_prefs(app: &AppHandle, prefs: &DesktopPrefs) -> Result<(), String> {
    let path = prefs_path(app).ok_or_else(|| "No app data dir".to_string())?;
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let raw = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())?;
    if let Some(state) = app.try_state::<DesktopState>() {
        if let Ok(mut g) = state.prefs.lock() {
            *g = prefs.clone();
        }
    }
    Ok(())
}

fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let launcher = app.autolaunch();
    let currently = launcher.is_enabled().unwrap_or(false);
    if enabled == currently {
        return Ok(());
    }
    if enabled {
        launcher.enable().map_err(|e| e.to_string())
    } else {
        launcher.disable().map_err(|e| e.to_string())
    }
}

/// Sync OS login-item state with saved prefs (call after plugin init).
pub fn sync_autostart_from_prefs(app: &AppHandle) {
    let prefs = load_prefs(app);
    let _ = apply_autostart(app, prefs.launch_at_startup);
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let prefs = load_prefs(app);

    let show_i = MenuItem::with_id(app, "show", "Open Roboticela ToDo", true, None::<&str>)?;
    let hide_i = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("No default window icon for tray")?;

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .menu(&menu)
        .tooltip("Roboticela ToDo")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "hide" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    let _ = tray.set_visible(prefs.show_tray_icon);
    Ok(())
}

fn apply_tray_visibility(app: &AppHandle, show: bool) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_visible(show);
    }
}

#[tauri::command]
pub fn get_desktop_prefs(app: AppHandle, state: State<'_, DesktopState>) -> DesktopPrefs {
    let mut prefs = if let Ok(g) = state.prefs.lock() {
        g.clone()
    } else {
        load_prefs(&app)
    };

    // Reflect OS login-item state when readable (user may have changed it outside the app)
    if let Ok(enabled) = app.autolaunch().is_enabled() {
        prefs.launch_at_startup = enabled;
    }
    prefs
}

#[tauri::command]
pub fn set_desktop_prefs(
    app: AppHandle,
    state: State<'_, DesktopState>,
    prefs: DesktopPrefs,
) -> Result<DesktopPrefs, String> {
    apply_autostart(&app, prefs.launch_at_startup)?;
    save_prefs(&app, &prefs)?;
    if let Ok(mut g) = state.prefs.lock() {
        *g = prefs.clone();
    }
    apply_tray_visibility(&app, prefs.show_tray_icon);

    // If tray is hidden, ensure window is visible so user isn't stuck
    if !prefs.show_tray_icon {
        show_main_window(&app);
    }
    Ok(prefs)
}
