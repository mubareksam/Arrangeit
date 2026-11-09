//! Batch rename with a two-phase commit.
//!
//! Renaming `a.jpg → b.jpg` while `b.jpg → c.jpg` in the same batch would clobber
//! data if done naively. Every source is first moved to a unique temp name, then
//! every temp is moved to its final name — so a swap like `a ↔ b` is safe.

use crate::model::{sanitize_segment, UndoOp, UndoRecord};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamePair {
    pub from: String,
    pub to: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameOutcome {
    pub renamed: usize,
    pub failures: usize,
    pub undo: Option<UndoRecord>,
    pub errors: Vec<String>,
}

fn with_name(path: &Path, name: &str) -> PathBuf {
    path.with_file_name(name)
}

#[tauri::command]
pub async fn rename_files(pairs: Vec<RenamePair>, dry_run: bool) -> Result<RenameOutcome, String> {
    let mut staged: Vec<(PathBuf, PathBuf, String)> = Vec::new();
    let mut errors = Vec::new();
    let mut undo_entries = Vec::new();
    let mut undo_ops: Vec<UndoOp> = Vec::new();

    for (index, pair) in pairs.iter().enumerate() {
        let from = PathBuf::from(&pair.from);
        if !from.exists() {
            errors.push(format!("{}: missing", pair.from));
            continue;
        }
        let clean = sanitize_segment(&pair.to);
        if clean.is_empty() {
            errors.push(format!("{}: empty target name", pair.from));
            continue;
        }
        let to = with_name(&from, &clean);
        if to == from {
            continue;
        }
        undo_entries.push(format!(
            "{}  →  {}",
            from.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
            clean
        ));
        undo_ops.push(UndoOp {
            from: from.to_string_lossy().to_string(),
            to: to.to_string_lossy().to_string(),
        });
        let temp = from.with_file_name(format!(".arrangeit-tmp-{index}"));
        staged.push((from, temp, clean));
    }

    if dry_run {
        return Ok(RenameOutcome { renamed: 0, failures: 0, undo: None, errors });
    }

    // Phase 1 — move every source out of the way.
    let mut moved: Vec<(PathBuf, PathBuf, String)> = Vec::new();
    for (from, temp, target_name) in staged {
        match fs::rename(&from, &temp) {
            Ok(()) => moved.push((temp, from.parent().unwrap_or(Path::new(".")).to_path_buf(), target_name)),
            Err(error) => errors.push(format!("{}: {error}", from.display())),
        }
    }

    // Phase 2 — move every temp to its final name.
    let mut renamed = 0usize;
    let mut failures = 0usize;
    for (temp, dir, target_name) in moved {
        let dest = dir.join(&target_name);
        match fs::rename(&temp, &dest) {
            Ok(()) => renamed += 1,
            Err(error) => {
                failures += 1;
                errors.push(format!("{}: {error}", target_name));
                // Best effort rollback of the staged temp.
                let _ = fs::rename(&temp, dir.join(temp.file_name().unwrap_or_default()));
            }
        }
    }

    let undo = if renamed == 0 {
        None
    } else {
        Some(UndoRecord {
            id: format!("undo-{}", chrono::Utc::now().timestamp_millis()),
            kind: String::from("rename"),
            label: format!("Renamed {} file{}", renamed, if renamed == 1 { "" } else { "s" }),
            entries: undo_entries,
            ops: undo_ops,
        })
    };

    Ok(RenameOutcome { renamed, failures, undo, errors })
}
