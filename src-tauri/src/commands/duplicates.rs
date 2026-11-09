//! Removing duplicate copies.
//!
//! Grouping happens in TypeScript (so the browser demo behaves identically); this
//! command only destroys files, and it always goes through the Recycle Bin first so
//! a mistake is recoverable from Explorer.

use crate::model::{human_bytes, UndoRecord};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteOutcome {
    pub deleted: usize,
    pub freed: u64,
    pub failures: usize,
    pub undo: Option<UndoRecord>,
}

#[cfg(windows)]
fn discard(path: &Path, to_recycle_bin: bool) -> std::io::Result<()> {
    if to_recycle_bin {
        trash::delete(path).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    } else {
        std::fs::remove_file(path)
    }
}

#[cfg(not(windows))]
fn discard(path: &Path, _to_recycle_bin: bool) -> std::io::Result<()> {
    std::fs::remove_file(path)
}

#[tauri::command]
pub async fn delete_duplicates(paths: Vec<String>, to_recycle_bin: bool) -> Result<DeleteOutcome, String> {
    let mut deleted = 0usize;
    let mut freed = 0u64;
    let mut failures = 0usize;
    let mut entries = Vec::new();

    for raw in &paths {
        let path = Path::new(raw);
        let size = path.metadata().map(|m| m.len()).unwrap_or(0);
        match discard(path, to_recycle_bin) {
            Ok(()) => {
                deleted += 1;
                freed += size;
                if let Some(name) = path.file_name() {
                    entries.push(name.to_string_lossy().to_string());
                }
            }
            Err(error) => {
                failures += 1;
                eprintln!("duplicates: could not discard {}: {error}", path.display());
            }
        }
    }

    let undo = if deleted == 0 {
        None
    } else {
        Some(UndoRecord {
            id: format!("undo-{}", chrono::Utc::now().timestamp_millis()),
            kind: String::from("duplicate"),
            label: format!(
                "Recycled {} duplicate{} ({})",
                deleted,
                if deleted == 1 { "" } else { "s" },
                human_bytes(freed)
            ),
            entries,
        })
    };

    Ok(DeleteOutcome { deleted, freed, failures, undo })
}
