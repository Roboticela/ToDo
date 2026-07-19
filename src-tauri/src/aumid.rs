//! Windows AppUserModelID (AUMID) registration so toast notifications attribute
//! to ToDo instead of PowerShell.
//!
//! `tauri-plugin-notification` only sets `app_id` for installed builds (not
//! `target/debug` or `target/release`). Without a registered AUMID, WinRT
//! toasts fall back to the PowerShell AppUserModelID. We register the bundle
//! identifier under HKCU and pin the process so our own toasts (and installed
//! plugin toasts) brand correctly.

use tauri::AppHandle;

/// No-op outside Windows.
#[allow(unused_variables)]
pub fn register(app: &AppHandle) {
    #[cfg(windows)]
    {
        let config = app.config();
        let aumid = config.identifier.as_str();
        let display = config.product_name.as_deref().unwrap_or("ToDo");
        let icon = resolve_icon_path(app);
        win::register(aumid, display, icon.as_deref());
    }
}

#[cfg(windows)]
fn resolve_icon_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;

    let candidates = [
        app.path()
            .resource_dir()
            .ok()
            .map(|d| d.join("icons").join("icon.png")),
        app.path()
            .resource_dir()
            .ok()
            .map(|d| d.join("icon.png")),
        std::env::current_exe().ok().and_then(|exe| {
            let mut dir = exe.parent()?.to_path_buf();
            for _ in 0..6 {
                let png = dir.join("icons").join("128x128.png");
                if png.is_file() {
                    return Some(png);
                }
                let png = dir.join("icons").join("icon.png");
                if png.is_file() {
                    return Some(png);
                }
                if !dir.pop() {
                    break;
                }
            }
            None
        }),
    ];

    candidates.into_iter().flatten().find(|p| p.is_file())
}

#[cfg(windows)]
mod win {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_WRITE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn register(aumid: &str, display_name: &str, icon_path: Option<&std::path::Path>) {
        if let Err(e) = write_registry(aumid, display_name, icon_path) {
            log::warn!("AUMID registry registration failed: {e:?}");
        }
        let id = wide(aumid);
        if let Err(e) = unsafe { SetCurrentProcessExplicitAppUserModelID(PCWSTR(id.as_ptr())) } {
            log::warn!("SetCurrentProcessExplicitAppUserModelID failed: {e:?}");
        }
    }

    fn write_registry(
        aumid: &str,
        display_name: &str,
        icon_path: Option<&std::path::Path>,
    ) -> windows::core::Result<()> {
        let subkey = wide(&format!("Software\\Classes\\AppUserModelId\\{aumid}"));
        let mut hkey = HKEY::default();
        unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                None,
                PCWSTR::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_WRITE,
                None,
                &mut hkey,
                None,
            )
            .ok()?;
        }

        set_reg_sz(hkey, "DisplayName", display_name)?;
        if let Some(icon) = icon_path {
            set_reg_sz(hkey, "IconUri", &icon.to_string_lossy())?;
        }

        unsafe {
            let _ = RegCloseKey(hkey);
        }
        Ok(())
    }

    fn set_reg_sz(hkey: HKEY, name: &str, value: &str) -> windows::core::Result<()> {
        let name_w = wide(name);
        let data = wide(value);
        let bytes = unsafe {
            std::slice::from_raw_parts(data.as_ptr() as *const u8, std::mem::size_of_val(data.as_slice()))
        };
        unsafe { RegSetValueExW(hkey, PCWSTR(name_w.as_ptr()), None, REG_SZ, Some(bytes)) }.ok()
    }
}
