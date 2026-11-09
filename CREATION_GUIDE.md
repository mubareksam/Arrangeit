# Recreating ArrangeIt from scratch

A complete, ordered build guide. Follow steps 3 → 8 and you end up with a working
`ArrangeIt` in `mubareksam/Arrangeit`. Steps 1–2 explain *what* and *why*, steps 9–10
cover publishing and verification.

> **Ground rule:** the frontend must run with `npm run dev` in a plain browser (mock
> filesystem) *and* inside Tauri (real filesystem). Every design decision below follows
> from that.

---

## 1. What we are building

Six features, all local-only:

1. **Auto-arrange** — group files into folders by date (year/month/day), type, size range,
   name initial, extension, or name similarity; move or copy; dry-run first; undoable.
2. **Duplicate finder** — exact (SHA-256) plus near-duplicates (audio duration, image
   dimensions, fuzzy names); keep-best suggestion; Recycle Bin deletes.
3. **Batch rename** — token patterns, find/replace, case modes, sequence padding, conflict
   blocking, collision-safe two-phase commit.
4. **Folder styles** — custom folder icons via `desktop.ini` + `attrib +s +h` +
   `ie4uinit -show`.
5. **Preview** — metadata, image tiles, 42-band audio waveform, text previews, and the
   planned destination for the selected rule.
6. **Themes** — Dusk / Midnight / Amber / Paper, persisted.

### Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Shell | **Tauri 2** | ~6 MB installer, WebView2 instead of bundling Chromium |
| Backend | **Rust** + `walkdir`, `rayon` | parallel stat/hash; no 10k-file UI freeze |
| Hashing | `sha2` (SHA-256) | de-dupe across copies; 24-hex prefix is plenty |
| Media | `lofty` (audio), `image` (dimensions + icon generation) | no external tools |
| Similarity | `strsim` (Rust) / Sørensen–Dice bigrams (TS) | identical behaviour on both sides |
| UI | **React 18 + TypeScript + Vite** | instant HMR, no CSS framework to fight |
| Styling | hand-written CSS custom properties | themes are just `[data-theme]` swaps |

---

## 2. Prerequisites

```bash
rustc --version    # 1.77+
node --version     # 20+
cargo install tauri-cli --version "^2"
```

Windows also needs **WebView2** (preinstalled on Win 11 and current Win 10).
`npm run dev` and `npm run build` work without Rust — only Tauri needs the toolchain.

---

## 3. Scaffold

```bash
mkdir arrangeit && cd arrangeit
git init
npm init -y
npm i react react-dom @tauri-apps/api @tauri-apps/plugin-dialog
npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @tauri-apps/cli
```

**`package.json`** — scripts matter:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

**`vite.config.ts`** — Tauri needs a fixed port and must ignore the Rust folder:

```ts
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { host: "0.0.0.0", port: 5173, strictPort: true, allowedHosts: true,
            watch: { ignored: ["**/src-tauri/**"] } },
  build: { target: "es2021", outDir: "dist", emptyOutDir: true },
});
```

> `target: "es2021"` is not optional: the engine uses `String.prototype.replaceAll` and
> WebView2 handles it fine, but es2019 output would throw at runtime.

**`tsconfig.json`** — `"lib": ["ES2021", "DOM", "DOM.Iterable"]`, `"jsx": "react-jsx"`,
`strict`, `noUnusedLocals`, `noUnusedParameters`, `noEmit`.

**`index.html`**

```html
<!doctype html>
<html lang="en" data-theme="dark">
  <head><meta charset="UTF-8" /><title>ArrangeIt</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

**`.gitignore`** — `node_modules`, `dist`, `src-tauri/target`, `src-tauri/gen`.

**`src/main.tsx`** — set the theme before first paint so there is no flash:

```tsx
const theme = (() => { try { return localStorage.getItem("arrangeit.theme") ?? "dusk"; }
                       catch { return "dusk"; } })();
document.documentElement.dataset.theme = theme;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>);
```

---

## 4. The planner (`src/lib/organizer/`)

This is the heart of the app and it contains **zero I/O**.

`types.ts`

- `FileKind = image | video | audio | document | archive | code | other`
- `KIND_CONFIG` — label, plural, glyph, colour, extensions per kind.
- `ALL_EXTENSIONS` — reverse map built from `KIND_CONFIG` (later kinds win; keep `ts` as
  **code**, not video).
- `AppFile` — `id, name, path, folder, ext, size, kind, modified, hash?, width?, height?,
  duration?, textPreview?`
- `ArrangeRule` — `mode, dateGranularity, sizeRanges, similarityThreshold, action, dryRun`.
- `DEFAULT_SIZE_RANGES` — Tiny <1 MB, Small 1–10, Medium 10–100, Large 100 MB–1 GB, Huge >1 GB.
- `DuplicateGroup`, `DuplicateOptions`, `RenameOptions`, `RenameRow`, `FolderStyle`,
  `StyleStep`, `LogEntry`, `UndoRecord`.

`engine.ts`

| Function | Contract |
| --- | --- |
| `classify(name)`, `extOf`, `stemOf` | extension → kind, lowercase, no dot |
| `humanBytes`, `formatDate`, `humanDuration` | display helpers |
| `similarity(a, b)` | Sørensen–Dice over character bigrams, 0–100 |
| `normalizeStem(name)` | strips `copy`, `(1)`, leading track numbers, separators |
| `dateBucket(iso, gran)` | `2024`, `2024-07 Jul`, `2024-07-15` |
| `sizeBucket(bytes, ranges)` | matching range label |
| `nameBucket(name)` | `0–9`, `A–F`, `G–L`, `M–R`, `S–Z` |
| `extBucket(name)` | `JPG`, `MP4`, `No extension` |
| `similarityBuckets(files, threshold)` | greedy clustering, de-duplicated labels |
| `arrangePreview(files, rule, basePath)` | **the plan**: `ArrangeItem[]`, marks collisions |
| `summarizeArrange(items)` | per-folder count/bytes/kinds/status |
| `findDuplicates(files, options)` | exact → audio → image → fuzzy, first match wins |
| `keeperSuggestion(group)` | highest resolution → largest → oldest |
| `applyRename(files, options)` | builds `RenameRow[]`, flags conflicts |
| `buildDesktopIni(style)` | CRLF `[.ShellClassInfo]` payload |
| `styleSteps(style, root)` | the four shell commands, for display |
| `waveform(seed, bars=42)` | deterministic xorshift envelope |
| `gradientFor(seed, color)` | stable per-file gradient |

Rules that matter (they are easy to get wrong):

- **Collisions**: group `items` by `folder\name` (lowercased); any bucket with >1 gets
  `status: "collision"` and is skipped at execution time.
- **Similarity mode**: clusters of one file go to a shared `Unmatched` folder — otherwise you
  get a folder per file.
- **Audio near-dupes**: duration within 5 s counts as 95 % evidence; that is how
  `Midnight Drive.mp3`, `01 - midnight drive.mp3` and `midnight drive (remaster).mp3` land
  in one group.
- **Image near-dupes**: identical dimensions plus a ≥60 % name score.
- **Rename**: patterns keep the *original* extension casing (`IMG_0421.HEIC` → `.HEIC`);
  case modes apply to the stem only; sanitise `<>:"/\|?*`, trailing dots and spaces.

`mockData.ts` — 36 messy demo files (duplicate photos, two invoices, three audio takes,
zip backups), `DEMO_ROOT = "C:\\Users\\Sam\\Desktop"`, `DEMO_LOG`, `DEMO_FOLDER_STYLES`.

`bridge.ts` — one function per command. Each branches on
`"__TAURI_INTERNALS__" in window`: `invoke<T>(...)` natively, otherwise a short `await wait()`
against the demo data. `pickFolder()` uses `@tauri-apps/plugin-dialog` and simply returns
`null` in the browser.

---

## 5. The UI

`index.css` first — design tokens per theme:

```css
[data-theme="dusk"] { --bg:#0a0d13; --panel:#121822; --line:#222d3d;
  --text:#e8eef7; --accent:#5b9dff; --accent-2:#8b7bff; --ok:#34d399;
  --danger:#fb7185; --glow: radial-gradient(900px 340px at 12% -8%, #1d3a6b, transparent 62%); }
```

Then the 12-column workspace:

```css
.workspace { display:grid; grid-template-columns: 3fr 6fr 3fr; gap:12px; padding:12px; }
@media (max-width: 1180px) { .workspace { grid-template-columns: 3.4fr 5fr; } .preview { display:none; } }
@media (max-width: 820px)  { .workspace { grid-template-columns: 1fr; } .tabbar { display:none; } }
```

`App.tsx` owns all state:

```
theme, tab, files, root, selection:Set, activeId,
rule, scope, dupOptions, scanned, keepers, pending,
renameOptions, styles, activeFolder, steps, log, undoStack, busy, toast
```

Derived with `useMemo` (never stored): `selectedFiles`, `scopedFiles`, `items`,
`summary`, `duplicateGroups`, `renameRows`, `activeFile`, `activeTarget`, `folders`.

Handlers: `runScan`, `chooseFolder`, `handleArrange` (updates file folders/paths after a real
move so later plans are correct), `selectAllExtras`, `handleDeleteDuplicates`,
`handleRename`, `updateStyle`, `handleApplyStyle`, `handleUndo`, `toggle`, `toggleAll`.

Components:

- `TopBar` — brand, folder pill (click to pick), rescan, tab bar with counts, 4 theme chips,
  undo.
- `FileList` — search, kind filter chips, select-all, selection byte counter, Ctrl/⌘ click.
- `PreviewPane` — image tile (gradient + dimensions), audio **42-bar waveform** with real
  transport math against `duration`, video poster, text preview, metadata grid, “arranges
  into” badge, reveal button.
- `tabs/ArrangeTab` — 6 mode cards, mode-specific options, Move/Copy + dry-run, stats,
  per-folder summary table, sample rows, footer CTA.
- `tabs/DuplicatesTab` — option toggles, fuzzy slider, stats, expandable groups with keeper
  radio, “select extras”, Recycle CTA.
- `tabs/RenameTab` — pattern + token chips, find/replace, case segmented, start/padding,
  before → after list with conflict rows.
- `tabs/FoldersTab` — folder tiles with live icons, glyph grid, swatches, tooltip,
  `.ini` preview, applied shell steps.
- `tabs/LogTab` — activity feed, undo stack, theme grid.
- `ui.tsx` — `Badge`, `Toggle`, `Segmented`, `Stat`, `Empty`, `Spinner`, `KindDot`, `FileGlyph`.

Keyboard: `1`–`5` tabs, `Ctrl/⌘+Z` undo, `Enter` run plan; ignored while typing in inputs.

---

## 6. The Rust backend (`src-tauri/`)

`Cargo.toml` (essentials):

```toml
[lib]
name = "arrangeit_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
walkdir = "2"
rayon = "1"
sha2 = "0.10"
blake3 = "1"
lofty = "0.21"
image = { version = "0.25", default-features = false, features = ["jpeg","png","webp","gif","tiff","bmp"] }
chrono = "0.4"
dirs = "5"

[target.'cfg(windows)'.dependencies]
trash = "5"
```

`build.rs` is one line: `tauri_build::build()`.
`main.rs` hides the console in release and calls `arrangeit_lib::run()`.

`tauri.conf.json` — the three fields that break builds if wrong:

```json
{ "identifier": "com.arrangeit.app",
  "build": { "devUrl": "http://localhost:5173", "frontendDist": "../dist",
             "beforeDevCommand": "npm run dev", "beforeBuildCommand": "npm run build" },
  "bundle": { "active": true, "targets": ["nsis","msi"],
              "icon": ["icons/32x32.png","icons/128x128.png","icons/128x128@2x.png",
                       "icons/icon.icns","icons/icon.ico"] } }
```

`capabilities/default.json` — Tauri 2 denies everything by default:

```json
{ "identifier": "default", "windows": ["main"],
  "permissions": ["core:default", "dialog:default"] }
```

`model.rs` — `#[serde(rename_all = "camelCase")]` on every struct so the TS types deserialise
directly. Also `kind_for_ext`, `human_bytes`, `sanitize_segment`, `uniquify` (`name (2).ext`).

`commands/scan.rs`

- `WalkDir` (or `max_depth(1)` when `recursive == false`), cap 50 000 files → `truncated`.
- `paths.par_iter().filter_map(build_file)` — rayon.
- `build_file`: metadata, id = first 12 hex of `blake3(path)`, SHA-256 prefix (24 hex) for
  files ≤ 256 MB, `image::image_dimensions` for images, `lofty::Probe` duration for
  audio/video, 600-char text preview for documents/code.
- Timestamps via `chrono::DateTime::<Utc>::from(system_time).to_rfc3339_opts(Secs, true)`.

`commands/arrange.rs`

- Iterate the plan; skip items whose `status != "ok"`; `create_dir_all`; `uniquify`;
  `fs::rename` with a copy+delete fallback for cross-volume moves; `fs::copy` for copy mode.
- `dry_run` performs everything except the actual write and still returns the entry list.
- Returns `{ action, performed, failures, entries, undo }`.

`commands/duplicates.rs`

- `trash::delete` on Windows (Recycle Bin), `remove_file` elsewhere or when recycling is off.
- Sums `freed` from metadata *before* deleting.

`commands/rename.rs` — **two-phase commit**:

1. every source → `.arrangeit-tmp-<i>` in the same directory,
2. every temp → final name.

That is the only way `a.jpg → b.jpg` while `b.jpg → c.jpg` in one batch cannot lose data.

`commands/style.rs`

- `render_icon(color, glyph)` — 64×64 RGBA folder silhouette (rounded rects, tab shading)
  with a white glyph drawn via point-in-polygon (star, play triangle, book, note, camera,
  briefcase, flask).
- `ico_bytes` — hand-rolled ICO container with a PNG payload (Vista+ accepts it).
- `desktop_ini` — CRLF `[.ShellClassInfo]` with `InfoTip`, `IconResource`, `IconFile`,
  `IconIndex`, plus a `[ViewState]` block.
- `attrib(&["+r", folder])`, `attrib(&["+s"/"+h", ini])`, `ie4uinit.exe -show` — all
  spawned with `CREATE_NO_WINDOW` so no console flashes.
- `reveal_in_explorer` — `explorer /select,` on Windows, `open -R` on macOS, `xdg-open`
  elsewhere.

`lib.rs` registers them:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
        scan_folder, execute_arrange, delete_duplicates,
        rename_files, apply_folder_style, reveal_in_explorer])
    .run(tauri::generate_context!())
    .expect("error while running ArrangeIt");
```

> Tauri converts JS camelCase arguments to Rust snake_case automatically, so
> `invoke("execute_arrange", { dryRun })` binds to `dry_run: bool`.

---

## 7. Icons

Put a 1024×1024 PNG at `src-tauri/icons/icon.png`, then:

```bash
npx tauri icon src-tauri/icons/icon.png
```

Generates `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.ico`, `icon.icns` and the
Windows Store logos. Delete the generated `android/` and `ios/` folders if you only ship
desktop.

---

## 8. Build

```bash
npm install
npm run build                 # tsc --noEmit && vite build → dist/
cargo tauri dev               # window with HMR
cargo tauri build             # release bundle
```

Outputs:

```
src-tauri/target/release/bundle/nsis/ArrangeIt_1.0.0_x64-setup.exe
src-tauri/target/release/bundle/msi/ArrangeIt_1.0.0_x64_en-US.msi
```

Verify before shipping:

- [ ] `npm run build` passes with zero TypeScript errors.
- [ ] Browser demo: all five tabs render, plans update live, nothing calls `localhost`.
- [ ] `cargo tauri dev`: folder picker opens, scan fills the list, rescan works.
- [ ] Dry run leaves the filesystem untouched; the real run creates folders and `Undo` appears.
- [ ] Duplicates: only the keeper is disabled; recycling frees the quoted bytes.
- [ ] Rename: swapping two names succeeds (two-phase commit).
- [ ] Folder style: icon appears after `ie4uinit -show` (or a manual Explorer refresh).

---

## 9. Publishing

```bash
gh repo create mubareksam/Arrangeit --public --source=. --remote=origin --push
git push -u origin main
```

If the push fails with **403 "Resource not accessible by personal access token"**, the GitHub
App installation is scoped to selected repositories: GitHub → Settings → Applications →
*Installations* → configure → tick `Arrangeit` → Save, then push again.

---

## 10. Final tree

```
Arrangeit/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── CREATION_GUIDE.md · CREATE_REPO.md · README.md · LICENSE
├── src/
│   ├── main.tsx · index.css · App.tsx
│   ├── components/
│   │   ├── TopBar.tsx · FileList.tsx · PreviewPane.tsx · ui.tsx
│   │   └── tabs/{ArrangeTab,DuplicatesTab,RenameTab,FoldersTab,LogTab}.tsx
│   └── lib/organizer/{types,engine,mockData,bridge}.ts
└── src-tauri/
    ├── Cargo.toml · build.rs · tauri.conf.json
    ├── capabilities/default.json
    ├── icons/…
    └── src/
        ├── main.rs · lib.rs · model.rs
        └── commands/{mod,scan,arrange,duplicates,rename,style}.rs
```
