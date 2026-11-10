//! Executes the plan produced by `arrangePreview` in the frontend.
//!
//! The UI never invents paths at execution time: it sends the exact
//! `targetPath` it previewed, so what you see in the dry run is what runs.
//! Dry-run returns the same shape, which keeps the JS side branch-free.

use crate::model::{move_file, sanitize_segment, uniquify, AppFile, UndoOp, UndoRecord};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

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
    // Directories this run created, so a failed move never leaves an empty folder behind.
    let mut created_dirs: BTreeSet<PathBuf> = BTreeSet::new();

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

        // Structures can nest ("Client/01_Design"), so every segment is sanitised
        // separately and folded into a real path.
        let folder_label = item.target_folder.clone();
        let dest_dir = item
            .target_folder
            .split(['/', '\\'])
            .filter(|segment| !segment.trim().is_empty())
            .fold(root.clone(), |path, segment| path.join(sanitize_segment(segment)));
        if dest_dir == root {
            // Nothing to do: the file is already where the plan wants it.
            continue;
        }
        let dest = uniquify(&dest_dir, &item.file.name);

        entries.push(format!("{}  →  {}\\", item.file.name, folder_label));
        undo_entries.push(format!("{}\\{}  ⟵  {}", folder_label, item.file.name, item.file.name));
        undo_ops.push(UndoOp {
            from: source.to_string_lossy().to_string(),
            to: dest.to_string_lossy().to_string(),
        });

        if dry_run {
            continue;
        }

        if !dest_dir.exists() {
            fs::create_dir_all(&dest_dir).map_err(|e| format!("Cannot create {}: {e}", dest_dir.display()))?;
            created_dirs.insert(dest_dir.clone());
        }

        let result = if copying { fs::copy(&source, &dest).map(|_| ()) } else { move_file(&source, &dest) };
        match result {
            Ok(()) => performed += 1,
            Err(error) => {
                failures += 1;
                eprintln!("arrange: {} -> {} failed: {error}", source.display(), dest.display());
                // Roll back a folder we just made for a move that never happened.
                prune_empty(&dest_dir, &mut created_dirs);
            }
        }
    }

    // Any bucket that ended up with nothing in it is removed again.
    for dir in created_dirs.iter().rev() {
        remove_if_empty(dir);
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

fn remove_if_empty(dir: &Path) {
    let empty = fs::read_dir(dir).map(|mut entries| entries.next().is_none()).unwrap_or(false);
    if empty {
        let _ = fs::remove_dir(dir);
    }
}

/// Removes `dir` (and its emptied parents) only if this run created it.
fn prune_empty(dir: &Path, created: &mut BTreeSet<PathBuf>) {
    let mut current = dir.to_path_buf();
    loop {
        if !created.contains(&current) {
            break;
        }
        let empty = fs::read_dir(&current).map(|mut entries| entries.next().is_none()).unwrap_or(false);
        if !empty {
            break;
        }
        if fs::remove_dir(&current).is_err() {
            break;
        }
        created.remove(&current);
        match current.parent() {
            Some(parent) => current = parent.to_path_buf(),
            None => break,
        }
    }
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
