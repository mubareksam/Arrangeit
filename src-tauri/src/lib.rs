//! ArrangeIt native core.
//!
//! Every command is `async` so a slow disk can never block the webview thread, and
//! every one of them is read-only unless the caller explicitly passes
//! `dryRun: false`. That invariant is what makes the UI's preview trustworthy.

mod commands;
mod model;

use commands::{
    apply_folder_style, delete_duplicates, execute_arrange, rename_files, reveal_in_explorer, revert_files,
    scan_folder,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            execute_arrange,
            delete_duplicates,
            rename_files,
            apply_folder_style,
            reveal_in_explorer,
            revert_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ArrangeIt");
}
