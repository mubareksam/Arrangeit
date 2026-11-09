//! Small shell helpers: reveal, cache refresh, and writing exported reports.

use crate::commands::style::refresh_icon_cache;
use crate::model::StyleStep;
use std::path::{Path, PathBuf};

#[tauri::command]
pub async fn reveal_in_explorer(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", target.display()))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").args(["-R", &path]).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let dir = target.parent().unwrap_or(Path::new(".")).to_path_buf();
        std::process::Command::new("xdg-open").arg(dir).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// `ie4uinit -show` — the "Refresh Explorer" button in the UI.
#[tauri::command]
pub async fn refresh_shell() -> Result<StyleStep, String> {
    let ok = refresh_icon_cache();
    Ok(StyleStep {
        command: String::from("ie4uinit.exe -show"),
        ok,
        detail: if ok { String::from("Explorer icon cache flushed") } else { String::from("Refresh failed") },
    })
}

/// Writes an exported plan/report (CSV, JSON) to a path chosen in a save dialog.
#[tauri::command]
pub async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create {}: {e}", parent.display()))?;
    }
    std::fs::write(&target, contents).map_err(|e| format!("Cannot write {}: {e}", target.display()))
}
