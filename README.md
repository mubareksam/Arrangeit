# ArrangeIt

**A local-first file organizer for Windows.** Point it at a messy folder, preview the plan, then move, copy, dedupe, rename and re-style — fast, offline, and undoable.

Built with **Rust + Tauri 2** for the filesystem work and **React + TypeScript** for the UI. Nothing leaves your machine.

<img src="./docs/icon.png" width="88" align="right" alt="" />

> ### ⬇ [Download ArrangeIt 1.4.0 for Windows (x64)](https://github.com/mubareksam/Arrangeit/releases/download/v1.4.0/ArrangeIt_1.4.0_x64-setup.exe)
> Run `ArrangeIt_1.4.0_x64-setup.exe` — no Rust, Node or other tooling required.
> Already on an older version? Just run it: the installer upgrades in place (same app id +
> install folder), so you never end up with two copies.
> The build is unsigned, so SmartScreen may ask for **More info → Run anyway**.

```
 ┌───────────────┬────────────────────────────────────────────┬────────────────┐
 │  Files        │  Arrange · Duplicates · Rename · Styles    │  Preview       │
 │  virtualised  │  Insights · History                        │  on demand     │
 └───────────────┴────────────────────────────────────────────┴────────────────┘
    Ctrl+K opens the command palette from anywhere.
```

## What's new in 1.4.0

- **The stuck "working" spinner is gone.** `busy` was a single shared boolean written by eight
  async jobs, so an overlapping scan could leave it true forever. It is now a **task registry**:
  every job registers `{label, startedAt, cancellable}`, the status bar lists what is actually
  running with elapsed seconds, long jobs can be cancelled, and a **run token** means a stale
  scan can never apply its results over a newer one. Scans default to *this folder only*.
- **New app icon** — frosted gradient tile, folder silhouette, arrow punched through in the
  tile's own gradient. Vector master (`scripts/make-icon.mjs`) → exact multi-size `.ico`
  (DIB 16/24/32/48/64/128 + PNG 256, because Windows ignores PNG entries below 256), plus every
  Windows Store logo size. `npm run icons` regenerates them.
- **Advanced duplicate finder** — stat strip (groups · extra copies · reclaimable · biggest),
  size / cross-folder / media filters, keeper strategies (best quality, newest, oldest, largest,
  shortest path), thumbnail compare strip with the keeper ringed green, per-group confidence,
  ignore list, *keep one per folder*, and CSV export of the full report.
- **Batched, cancellable hashing** — the pixel pass runs 24 images at a time with live progress;
  images over 48 MB or 80 MP are skipped before decoding.
- **Fast mode** — drops the aurora animation and blur radius for low-power GPUs; auto-enabled on
  4-core machines, toggleable in the appearance menu and remembered.

## What's new in 1.3.0 — the "Frost" interface

- **Glassmorphism done properly** — every panel is a frosted layer
  (`backdrop-filter: blur(26px) saturate(160%)`) with a hairline top-light, a 20 px corner
  radius and a layered shadow. Behind them sits a slow-drifting **aurora mesh** (three blurred
  colour fields, 34–52 s loops) plus an SVG **film-grain** overlay so big gradients never band.
- **Floating dock + detached top bar** — the six workspaces live in a glass pill; the active tab
  gets a gradient wash, an accent ring and a soft glow.
- **Interaction depth** — file rows sweep an accent gradient with an inset left edge, insight
  cards lift and catch a spotlight, primary buttons carry an inner highlight and a coloured bloom.
- **Command palette** — 40 px blur, bloom behind the sheet, accent-tinted hover row.
- **Four glass themes** — Dusk, Midnight, Amber and the light **Paper** (frosted white, no glow)
  so the same layout stays crisp in daylight.
- **Respects your settings** — `prefers-reduced-motion` stops the aurora and every transition;
  `prefers-contrast: more` removes translucency and thickens borders.

## What's new in 1.2.0

- **Folder Intelligence** — the *Insights* tab turns the folder into a to-do list: duplicate
  groups, screenshot piles, oversized media, stale downloads, installers, junk drawers,
  near-identical names and folders with no look yet. Each card turns into an arrange plan you
  review before a single file moves.
- **Visually similar detection** — a perceptual dHash (9×8 luma, Hamming distance) catches the
  same photo re-saved, resized or renamed, which byte hashing alone never will.
- **Any folder can be styled** — 25 hand-drawn icon glyphs, 16 presets and 20 colours, and the
  folder does not have to live inside the scanned directory: pick it from the folder picker.
  *Auto-style* gives every plain folder a look based on what is actually inside it.
- **Command palette** — `Ctrl+K`, then type: tabs, themes, folder actions, arrange, dedupe, undo.
- **Faster everywhere** — scanning is metadata-only (no file is opened), the file list is
  virtualised (smooth at 20 000+ files), and hashing/pixel reading only runs on demand. Every
  Rust loop is rayon-parallel.

## Features

| Feature | What it does |
| --- | --- |
| **Auto-arrange** | Buckets files by **date** (year/month/day), **type**, **size** range, **name** (A–F…), **extension**, or **similarity** (fuzzy name clustering). Move or copy, with dry-run by default and an undo record per run. |
| **Duplicate finder** | SHA-256 byte-identical groups, plus near-duplicates: audio matched on duration, images on pixel dimensions, **perceptual dHash for visually similar pictures**, and fuzzy name matching. Stat strip + size/cross-folder/media filters. Keeper strategies (best quality · newest · oldest · largest · shortest path), thumbnail compare with the keeper ringed green, ignore list, *one per folder*, CSV report, Recycle Bin + undo. |
| **Batch rename** | Token patterns (`{name} {ext} {counter} {date} {kind} {size} {folder}`), find/replace, case modes, sequence padding, live conflict detection, two-phase commit so `a ↔ b` swaps are safe. |
| **Folder styles** | 25 glyphs × 20 colours × 16 presets, for **any** directory (not just subfolders of the scan root). Generates a real 16/32/48/256 px `.ico`, writes a quoted `IconResource` `desktop.ini`, applies `attrib +r/+s/+h`, flushes the shell cache with `ie4uinit -show`. Re-applying clears old attributes first, and **Remove style** restores the default look. *Auto-style* picks a look from the dominant file type. |
| **Folder intelligence** | `buildInsights()` — duplicates, screenshots, large files, stale downloads, installers, junk drawers, similar names, unstyled folders. |
| **Preview** | Real previews via Tauri's asset protocol: image thumbnails, inline video playback, audio playback with a waveform decoded from the actual file, plus text previews, metadata and the planned destination. |
| **Themes** | Dusk, Midnight, Amber and Paper, persisted per machine. Every theme is a glass recipe: translucent surfaces, aurora mesh, film grain. |
| **Command palette** | `Ctrl+K` — every action, tab, theme and folder in one fuzzy search. |
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
npm run icons        # regenerate every icon from the vector master
cargo tauri build    # → src-tauri/target/release/bundle/nsis/ArrangeIt_1.4.0_x64-setup.exe
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
| `scan_folder(path, recursive, hash)` | walkdir + rayon, metadata only by default (paths, size, mtime) — nothing is opened |
| `inspect_file(path)` | dimensions / duration / bitrate / text preview for the one file in the preview pane |
| `compute_hashes(paths)` | SHA-256 on demand, 128 KB buffers, 512 MB cap |
| `image_signatures(paths)` | 9×8 perceptual dHash for the visually-similar pass |
| `execute_arrange(items, action, dryRun, root)` | move/copy per plan, `name (2).ext` collision handling, returns undo record |
| `delete_duplicates(paths, toRecycleBin)` | Recycle Bin deletes, bytes reclaimed |
| `rename_files(pairs, dryRun)` | two-phase temp-then-final rename |
| `apply_folder_style(style, root, dryRun)` | generates `.ico`, writes `desktop.ini`, sets attributes, refreshes cache |
| `reset_folder_style(root, folder, path?)` | removes `desktop.ini`, clears the read-only flag, flushes cache |
| `list_folders(path)` | immediate sub-folders, including empty ones |
| `revert_files(ops)` | moves recorded paths back (undo) |
| `refresh_shell()` | `ie4uinit -show` |
| `write_text_file(path, contents)` | saves exported CSV/JSON plans |
| `reveal_in_explorer(path)` | opens Explorer with the file selected |

## Keyboard

| Key | Action |
| --- | --- |
| `Ctrl/⌘ + K` | Command palette |
| `F5` | Rescan (cancellable) |
| `1`–`6` | Arrange · Duplicates · Rename · Styles · Insights · History |
| `Ctrl/⌘ + O` | Choose a folder |
| `F5` | Rescan the current folder |
| `Ctrl/⌘ + Z` | Undo the last recorded action |
| `Enter` | Run the arrange plan (Arrange tab) |
| `/` | Focus the file search |
| `Ctrl/⌘ + click` | Multi-select files |

## Notes on previews and styles

- Previews use the **asset protocol**, enabled in `tauri.conf.json` with a permissive scope.
  In the browser demo you only get placeholders — real files need the desktop build.
- Windows caches folder icons aggressively. If a new icon does not appear, press **F5** in
  Explorer or hit **Refresh Explorer** in the Styles tab.
- The interface is pure CSS glass: `backdrop-filter` plus an animated aurora layer. No images,
  no runtime dependency, and it degrades to solid surfaces on machines without backdrop-filter.
- If the UI feels heavy on a low-power GPU, turn on **Fast mode** (appearance menu). It removes the
  aurora animation and shrinks the blur radius; the layout is unchanged.
- Icons are generated, never hand-edited: `npm run icons` rewrites `src-tauri/icons/*` from the SVG
  in `scripts/make-icon.mjs`.

## Status

The frontend is complete and builds with `npm run build`. The native layer implements all fourteen commands; compiling requires a Rust toolchain, which is why CI-friendly `npm` builds never touch `src-tauri`. Installers are produced by GitHub Actions on `windows-latest` and published to Releases.

See [`CREATION_GUIDE.md`](./CREATION_GUIDE.md) to rebuild this project from scratch, and [`CREATE_REPO.md`](./CREATE_REPO.md) to publish it.

## License

MIT © mubareksam
