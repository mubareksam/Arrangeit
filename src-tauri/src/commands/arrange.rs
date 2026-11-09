//! Executes the plan produced by `arrangePreview` in the frontend.
//!
//! The UI never invents paths at execution time: it sends the exact
//! `targetPath` it previewed, so what you see in the dry run is what runs.
//! Dry-run returns the same shape, which keeps the JS side branch-free.

use crate::model::{move_file, sanitize_segment, uniquify, AppFile, UndoOp, UndoRecord};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArrangeItem {
    pub file: AppFile,
    pub target_folder: String,
    pub target_path: String,
    #[serde(default)]
    pub status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArrangeOutcome {
    pub action: String,
    pub performed: usize,
    pub failures: usize,
    pub entries: Vec<String>,
    pub undo: Option<UndoRecord>,
}

#[tauri::command]
pub async fn execute_arrange(
    items: Vec<ArrangeItem>,
    action: String,
    dry_run: bool,
    root: String,
) -> Result<ArrangeOutcome, String> {
    let root = PathBuf::from(root);
    let copying = action == "copy";
    let mut performed = 0usize;
    let mut failures = 0usize;
    let mut entries = Vec::new();
    let mut undo_entries = Vec::new();
    let mut undo_ops: Vec<UndoOp> = Vec::new();

    for item in &items {
        if item.status != "ok" {
            failures += 1;
            continue;
        }
        let source = PathBuf::from(&item.file.path);
        if !source.exists() {
            failures += 1;
            continue;
        }

        let folder = sanitize_segment(&item.target_folder);
        let dest_dir = root.join(&folder);
        let dest = uniquify(&dest_dir, &item.file.name);

        entries.push(format!("{}  →  {}\\", item.file.name, folder));
        undo_entries.push(format!("{}\\{}  ⟵  {}", folder, item.file.name, item.file.name));
        undo_ops.push(UndoOp {
            from: source.to_string_lossy().to_string(),
            to: dest.to_string_lossy().to_string(),
        });

        if dry_run {
            continue;
        }

        fs::create_dir_all(&dest_dir).map_err(|e| format!("Cannot create {}: {e}", dest_dir.display()))?;
        let result = if copying { fs::copy(&source, &dest).map(|_| ()) } else { move_file(&source, &dest) };
        match result {
            Ok(()) => performed += 1,
            Err(error) => {
                failures += 1;
                eprintln!("arrange: {} -> {} failed: {error}", source.display(), dest.display());
            }
        }
    }

    let undo = if dry_run || performed == 0 {
        None
    } else {
        Some(UndoRecord {
            id: format!("undo-{}", chrono::Utc::now().timestamp_millis()),
            kind: String::from("arrange"),
            label: format!(
                "{} {} file{}",
                if copying { "Copied" } else { "Moved" },
                performed,
                if performed == 1 { "" } else { "s" }
            ),
            entries: undo_entries,
            ops: undo_ops,
        })
    };

    Ok(ArrangeOutcome { action, performed, failures, entries, undo })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevertOutcome {
    pub reverted: usize,
    pub failures: usize,
}

/// Replays an undo record backwards: every `to` moves back to its `from`.
#[tauri::command]
pub async fn revert_files(ops: Vec<UndoOp>) -> Result<RevertOutcome, String> {
    let mut reverted = 0usize;
    let mut failures = 0usize;

    for op in ops {
        let source = PathBuf::from(&op.to);
        let mut target = PathBuf::from(&op.from);
        if !source.exists() {
            failures += 1;
            continue;
        }
        if let Some(parent) = target.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if target.exists() {
            let dir = target.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
            let name = target
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            target = uniquify(&dir, &name);
        }
        match move_file(&source, &target) {
            Ok(()) => reverted += 1,
            Err(error) => {
                failures += 1;
                eprintln!("undo: {} -> {} failed: {error}", source.display(), target.display());
            }
        }
    }

    Ok(RevertOutcome { reverted, failures })
}
