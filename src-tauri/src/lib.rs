//! ArrangeIt native core.
//!
//! Every command is `async` so a slow disk can never block the webview thread, and
//! every one of them is read-only unless the caller explicitly passes
//! `dryRun: false`. That invariant is what makes the UI's preview trustworthy.

mod commands;
mod model;

use commands::{
    apply_folder_style, compute_hashes, delete_duplicates, execute_arrange, image_signatures, inspect_file,
    list_folders, refresh_shell, rename_files, reset_folder_style, reveal_in_explorer, toggle_desktop_ini, revert_files, scan_folder,
    write_text_file,
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
            list_folders,
            reset_folder_style,
            toggle_desktop_ini,
            refresh_shell,
            write_text_file,
            inspect_file,
            compute_hashes,
            image_signatures,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ArrangeIt");
}
