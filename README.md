# ArrangeIt

**A local-first file organizer for Windows.** Point it at a messy folder, preview the plan, then move, copy, dedupe, rename and re-style — fast, offline, and undoable.

Built with **Rust + Tauri 2** for the filesystem work and **React + TypeScript** for the UI. Nothing leaves your machine.

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
| **Folder styles** | Gives any folder a custom icon and tooltip by writing `desktop.ini`, marking it hidden + system with `attrib`, and flushing the shell cache with `ie4uinit -show`. Icons are generated on the fly. |
| **Preview** | Metadata, dimensions, durations, text previews, image thumbnails and a 42-band audio waveform — plus “where this file will land” for the current rule. |
| **Themes** | Dusk, Midnight, Amber and Paper, persisted per machine. |

## Quick start

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
| `reveal_in_explorer(path)` | opens Explorer with the file selected |

## Keyboard

| Key | Action |
| --- | --- |
| `1`–`5` | Switch workspace tab |
| `Ctrl/⌘ + Z` | Undo the last recorded action |
| `Enter` | Run the arrange plan |
| `Ctrl/⌘ + click` | Multi-select files |

## Status

The frontend is complete and builds with `npm run build`. The native layer implements all six commands; compiling requires a Rust toolchain, which is why CI-friendly `npm` builds never touch `src-tauri`.

See [`CREATION_GUIDE.md`](./CREATION_GUIDE.md) to rebuild this project from scratch, and [`CREATE_REPO.md`](./CREATE_REPO.md) to publish it.

## License

MIT © mubareksam
