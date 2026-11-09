# ArrangeIt

**A local-first file organizer for Windows.** Point it at a messy folder, preview the plan, then move, copy, dedupe, rename and re-style — fast, offline, and undoable.

Built with **Rust + Tauri 2** for the filesystem work and **React + TypeScript** for the UI. Nothing leaves your machine.

> ### ⬇ [Download ArrangeIt 1.1.0 for Windows (x64)](https://github.com/mubareksam/Arrangeit/releases/download/v1.1.0/ArrangeIt_1.1.0_x64-setup.exe)
> Run `ArrangeIt_1.1.0_x64-setup.exe` — no Rust, Node or other tooling required.
> Already on 1.0.0? Just run it: the installer upgrades in place (same app id + install
> folder), so you never end up with two copies.
> The build is unsigned, so SmartScreen may ask for **More info → Run anyway**.

```
 ┌───────────────┬──────────────────────────────────┬────────────────┐
 │  Files        │  Arrange · Duplicates · Rename   │  Preview       │
 │  (3 cols)     │  Folder styles · Activity        │  (3 cols)      │
 └───────────────┴──────────────────────────────────┴────────────────┘
```

## Features

| Feature | What it does |
| --- | --- |
| **Auto-arrange** | Buckets files by **date** (year/month/day), **type**, **size** range, **name** (A–F…), **extension**, or **similarity** (fuzzy name clustering). Move or copy, with dry-run by default and an undo record per run. |
| **Duplicate finder** | SHA-256 byte-identical groups, plus near-duplicates: audio matched on duration, images on pixel dimensions, and fuzzy name matching everywhere. Suggests the copy to keep (highest resolution → largest → oldest) and recycles the rest. |
| **Batch rename** | Token patterns (`{name} {ext} {counter} {date} {kind} {size} {folder}`), find/replace, case modes, sequence padding, live conflict detection, two-phase commit so `a ↔ b` swaps are safe. |
| **Folder styles** | Custom folder icon + tooltip: generates a real 16/32/48/256 px `.ico`, writes a quoted `IconResource` `desktop.ini`, applies `attrib +r/+s/+h`, flushes the shell cache with `ie4uinit -show`. Re-applying clears old attributes first, and **Remove style** restores the default look. |
| **Preview** | Real previews via Tauri's asset protocol: image thumbnails, inline video playback, audio playback with a waveform decoded from the actual file, plus text previews, metadata and the planned destination. |
| **Themes** | Dusk, Midnight, Amber and Paper, persisted per machine. |
| **Undo & export** | Every run records a reversible op; undo moves files back on disk. Arrange and rename plans export to CSV. |

## Quick start (from source)

```bash
git clone https://github.com/mubareksam/Arrangeit.git
cd Arrangeit
npm install
npm run dev          # browser demo — full UI, simulated filesystem
```

Desktop app (needs Rust 1.77+ and `cargo install tauri-cli@^2`):

```bash
cargo tauri dev
cargo tauri build    # → src-tauri/target/release/bundle/nsis/ArrangeIt_1.0.0_x64-setup.exe
```

## How it works

The app is split into a **pure planner** and a **thin executor**:

```
src/lib/organizer/
├── types.ts      # AppFile, ArrangeRule, DuplicateGroup, FolderStyle…
├── engine.ts     # arrangePreview, findDuplicates, applyRename, buildDesktopIni — no I/O
├── mockData.ts   # 36 deliberately messy demo files
└── bridge.ts     # invoke() to Rust, or an in-browser simulation

src-tauri/src/
├── model.rs      # AppFile / UndoRecord / FolderStyle (camelCase on the wire)
└── commands/     # scan, arrange, duplicates, rename, style
```

Every UI action builds a **plan** first (`arrangePreview(...)` → `ArrangeItem[]`). The Rust side only executes plans, and refuses to write unless `dryRun` is `false`. That is why the preview is trustworthy and why dry-run costs nothing.

Rust commands exposed to the frontend:

| Command | Purpose |
| --- | --- |
| `scan_folder(path, recursive)` | walkdir + rayon scan; metadata, dimensions, durations, SHA-256 (≤256 MB), text previews |
| `execute_arrange(items, action, dryRun, root)` | move/copy per plan, `name (2).ext` collision handling, returns undo record |
| `delete_duplicates(paths, toRecycleBin)` | Recycle Bin deletes, bytes reclaimed |
| `rename_files(pairs, dryRun)` | two-phase temp-then-final rename |
| `apply_folder_style(style, root, dryRun)` | generates `.ico`, writes `desktop.ini`, sets attributes, refreshes cache |
| `reset_folder_style(root, folder)` | removes `desktop.ini`, clears the read-only flag, flushes cache |
| `list_folders(path)` | immediate sub-folders, including empty ones |
| `revert_files(ops)` | moves recorded paths back (undo) |
| `refresh_shell()` | `ie4uinit -show` |
| `write_text_file(path, contents)` | saves exported CSV/JSON plans |
| `reveal_in_explorer(path)` | opens Explorer with the file selected |

## Keyboard

| Key | Action |
| --- | --- |
| `1`–`5` | Switch workspace tab |
| `Ctrl/⌘ + Z` | Undo the last recorded action |
| `Enter` | Run the arrange plan |
| `Ctrl/⌘ + click` | Multi-select files |

## Notes on previews and styles

- Previews use the **asset protocol**, enabled in `tauri.conf.json` with a permissive scope.
  In the browser demo you only get placeholders — real files need the desktop build.
- Windows caches folder icons aggressively. If a new icon does not appear, press **F5** in
  Explorer or hit **Refresh Explorer** in the Styles tab.

## Status

The frontend is complete and builds with `npm run build`. The native layer implements all six commands; compiling requires a Rust toolchain, which is why CI-friendly `npm` builds never touch `src-tauri`.

See [`CREATION_GUIDE.md`](./CREATION_GUIDE.md) to rebuild this project from scratch, and [`CREATE_REPO.md`](./CREATE_REPO.md) to publish it.

## License

MIT © mubareksam
