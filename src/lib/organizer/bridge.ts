/**
 * Bridge between the planner and the native layer.
 *
 * Every function here is a thin wrapper over a Rust command. When the app runs in
 * a plain browser (`npm run dev`) the same call is answered from the demo dataset —
 * but only there. In the packaged app there is **no mock fallback**: if the disk
 * says a folder is empty, the UI shows an empty folder.
 */

import type {
  AppFile,
  ArrangeAction,
  ArrangeItem,
  FolderStyle,
  RenameRow,
  StyleStep,
  UndoOp,
  UndoRecord,
} from "./types";
import { MOCK_FILES, MOCK_FOLDERS } from "./mockData";
import { humanBytes, styleSteps, uid } from "./engine";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Local file URL that the webview is allowed to load (asset protocol). */
export function assetUrl(path: string): string {
  if (!isTauri() || !path) return "";
  const internals = (window as unknown as { __TAURI_INTERNALS__: { convertFileSrc: (p: string) => string } })
    .__TAURI_INTERNALS__;
  return internals.convertFileSrc(path);
}

async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(command, args);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* Scan                                                                */
/* ------------------------------------------------------------------ */

export interface ScanResult {
  files: AppFile[];
  root: string;
  elapsedMs: number;
  truncated: boolean;
}

export async function scanFolder(path: string, recursive = true, hash = false): Promise<ScanResult> {
  const started = performance.now();
  if (isTauri()) {
    // No fallback: whatever the disk returns is what the user sees.
    const result = await invokeTauri<{ files: AppFile[]; root: string; truncated: boolean }>("scan_folder", {
      path,
      recursive,
      hash,
    });
    return { ...result, elapsedMs: Math.round(performance.now() - started) };
  }
  await wait(380);
  return {
    files: MOCK_FILES.map((f) => ({ ...f })),
    root: "C:\\Users\\Sam\\Desktop",
    elapsedMs: Math.round(performance.now() - started),
    truncated: false,
  };
}

export interface FolderEntry {
  name: string;
  path: string;
  files: number;
  bytes: number;
}

/** Immediate sub-folders, including empty ones (used by Folder styles). */
export async function listFolders(path: string): Promise<FolderEntry[]> {
  if (isTauri()) {
    return invokeTauri<FolderEntry[]>("list_folders", { path });
  }
  await wait(120);
  return MOCK_FOLDERS.map((folder) => ({
    name: folder.name,
    path: `C:\\Users\\Sam\\Desktop\\${folder.name}`,
    files: folder.count,
    bytes: folder.bytes,
  }));
}

export interface FileInfo {
  width?: number;
  height?: number;
  duration?: number;
  textPreview?: string;
  audioBitrate?: number;
}

/** Cheap on-demand detail for a single file (only what the preview needs). */
export async function inspectFile(path: string): Promise<FileInfo> {
  if (isTauri()) {
    return invokeTauri<FileInfo>("inspect_file", { path });
  }
  const mock = MOCK_FILES.find((file) => file.path === path);
  return {
    width: mock?.width,
    height: mock?.height,
    duration: mock?.duration,
    textPreview: mock?.textPreview,
  };
}

export interface HashEntry {
  path: string;
  hash: string;
}

/** SHA-256 for a specific set of paths — run only when duplicates are requested. */
export async function computeHashes(paths: string[]): Promise<HashEntry[]> {
  if (paths.length === 0) return [];
  if (isTauri()) {
    return invokeTauri<HashEntry[]>("compute_hashes", { paths });
  }
  await wait(160);
  return paths
    .map((path) => {
      const mock = MOCK_FILES.find((file) => file.path === path);
      return mock?.hash ? { path, hash: mock.hash } : null;
    })
    .filter((entry): entry is HashEntry => entry !== null);
}

export interface Signature {
  path: string;
  hash: string;
}

/** Perceptual dHash for images — powers "visually similar" detection. */
export async function imageSignatures(paths: string[]): Promise<Signature[]> {
  if (paths.length === 0) return [];
  if (isTauri()) {
    return invokeTauri<Signature[]>("image_signatures", { paths });
  }
  await wait(200);
  // Deterministic fake signatures for the demo so similar tiles cluster.
  return paths.map((path) => {
    const name = path.split("\\").pop() ?? path;
    let h = 0xcbf29ce484222325n;
    for (const char of name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6)) {
      h = (h ^ BigInt(char.charCodeAt(0))) * 1099511628211n;
    }
    return { path, hash: (h & 0xffffffffffffffffn).toString(16).padStart(16, "0") };
  });
}

/* ------------------------------------------------------------------ */
/* Arrange                                                             */
/* ------------------------------------------------------------------ */

export interface ArrangeOutcome {
  action: ArrangeAction;
  performed: number;
  failures: number;
  entries: string[];
  undo: UndoRecord | null;
}

export async function executeArrange(
  items: ArrangeItem[],
  action: ArrangeAction,
  dryRun: boolean,
  root: string,
): Promise<ArrangeOutcome> {
  if (isTauri()) {
    return invokeTauri<ArrangeOutcome>("execute_arrange", { items, action, dryRun, root });
  }
  await wait(dryRun ? 120 : 480);
  const usable = items.filter((i) => i.status === "ok");
  return {
    action,
    performed: dryRun ? 0 : usable.length,
    failures: items.length - usable.length,
    entries: usable.map((i) => `${i.file.name}  →  ${i.targetFolder}\\`),
    undo:
      dryRun || usable.length === 0
        ? null
        : {
            id: uid("undo"),
            kind: "arrange",
            label: `${action === "move" ? "Moved" : "Copied"} ${usable.length} file${usable.length === 1 ? "" : "s"}`,
            entries: usable.map((i) => `${i.targetFolder}\\${i.file.name}  ⟵  ${i.file.name}`),
            ops: usable.map((i) => ({
              from: i.file.path,
              to: `${root.replace(/[\\/]+$/, "")}\\${i.targetFolder}\\${i.file.name}`,
            })),
          },
  };
}

/* ------------------------------------------------------------------ */
/* Duplicates                                                          */
/* ------------------------------------------------------------------ */

export interface DeleteOutcome {
  deleted: number;
  freed: number;
  failures: number;
  undo: UndoRecord | null;
}

export async function deleteDuplicates(paths: string[], totalBytes: number, toRecycleBin = true): Promise<DeleteOutcome> {
  if (isTauri()) {
    return invokeTauri<DeleteOutcome>("delete_duplicates", { paths, toRecycleBin });
  }
  await wait(340);
  const names = paths.map((p) => p.split("\\").pop() ?? p);
  return {
    deleted: paths.length,
    freed: totalBytes,
    failures: 0,
    undo:
      paths.length === 0
        ? null
        : {
            id: uid("undo"),
            kind: "duplicate",
            label: `Recycled ${paths.length} duplicate${paths.length === 1 ? "" : "s"} (${humanBytes(totalBytes)})`,
            entries: names,
            ops: [],
          },
  };
}

/* ------------------------------------------------------------------ */
/* Rename                                                              */
/* ------------------------------------------------------------------ */

export interface RenameOutcome {
  renamed: number;
  failures: number;
  undo: UndoRecord | null;
  errors: string[];
}

export async function commitRename(rows: RenameRow[], dryRun: boolean): Promise<RenameOutcome> {
  const ready = rows.filter((r) => r.changed && !r.conflict && !r.error);
  if (isTauri()) {
    return invokeTauri<RenameOutcome>("rename_files", {
      pairs: ready.map((r) => ({ from: r.file.path, to: r.nextName })),
      dryRun,
    });
  }
  await wait(dryRun ? 100 : 420);
  return {
    renamed: dryRun ? 0 : ready.length,
    failures: rows.length - ready.length,
    errors: rows.filter((r) => r.conflict).map((r) => `${r.file.name}: name already taken`),
    undo:
      dryRun || ready.length === 0
        ? null
        : {
            id: uid("undo"),
            kind: "rename",
            label: `Renamed ${ready.length} file${ready.length === 1 ? "" : "s"}`,
            entries: ready.map((r) => `${r.file.name}  →  ${r.nextName}`),
            ops: ready.map((r) => ({
              from: r.file.path,
              to: r.file.path.replace(/[^\\]+$/, r.nextName),
            })),
          },
  };
}

/* ------------------------------------------------------------------ */
/* Folder styles                                                       */
/* ------------------------------------------------------------------ */

export interface StyleOutcome {
  steps: StyleStep[];
  undo: UndoRecord | null;
  iconPath?: string;
}

export async function applyFolderStyle(style: FolderStyle, root: string, dryRun: boolean): Promise<StyleOutcome> {
  if (isTauri()) {
    return invokeTauri<StyleOutcome>("apply_folder_style", { style, root, dryRun });
  }
  await wait(dryRun ? 120 : 380);
  return {
    steps: styleSteps(style, root),
    iconPath: `${root}\\${style.folder}\\desktop.ini`,
    undo: dryRun
      ? null
      : {
          id: uid("undo"),
          kind: "style",
          label: `Styled ${style.folder}`,
          entries: [`remove ${root}${style.folder}\\desktop.ini`, `attrib -r "${root}${style.folder}"`],
          ops: [],
        },
  };
}

export async function resetFolderStyle(root: string, folder: string, path?: string): Promise<StyleStep[]> {
  if (isTauri()) {
    return invokeTauri<StyleStep[]>("reset_folder_style", { root, folder, path: path ?? null });
  }
  await wait(220);
  return [
    { command: `remove ${root}${folder}\\desktop.ini`, ok: true, detail: "desktop.ini deleted" },
    { command: `attrib -r "${root}${folder}"`, ok: true, detail: "Folder no longer read-only" },
    { command: "ie4uinit.exe -show", ok: true, detail: "Icon cache flushed" },
  ];
}

export async function refreshShell(): Promise<StyleStep> {
  if (isTauri()) {
    return invokeTauri<StyleStep>("refresh_shell");
  }
  await wait(160);
  return { command: "ie4uinit.exe -show", ok: true, detail: "Explorer icon cache flushed" };
}

/* ------------------------------------------------------------------ */
/* Undo                                                                */
/* ------------------------------------------------------------------ */

export interface RevertOutcome {
  reverted: number;
  failures: number;
}

export async function revertFiles(ops: UndoOp[]): Promise<RevertOutcome> {
  if (ops.length === 0) return { reverted: 0, failures: 0 };
  if (isTauri()) {
    return invokeTauri<RevertOutcome>("revert_files", { ops });
  }
  await wait(240);
  return { reverted: ops.length, failures: 0 };
}

/* ------------------------------------------------------------------ */
/* Shell helpers                                                       */
/* ------------------------------------------------------------------ */

export async function pickFolder(title = "Choose a folder to arrange"): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false, title });
    return typeof picked === "string" ? picked : null;
  } catch {
    return null;
  }
}

export async function revealInExplorer(path: string): Promise<void> {
  if (!isTauri()) return;
  try {
    await invokeTauri<void>("reveal_in_explorer", { path });
  } catch {
    /* best effort */
  }
}

/** Saves an exported plan (CSV/JSON) — native save dialog, or a download in the browser. */
export async function saveTextFile(defaultName: string, contents: string, extension = "csv"): Promise<boolean> {
  if (isTauri()) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const target = await save({
        title: "Save report",
        defaultPath: defaultName,
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      });
      if (!target) return false;
      await invokeTauri<void>("write_text_file", { path: target, contents });
      return true;
    } catch {
      return false;
    }
  }
  const blob = new Blob([contents], { type: extension === "csv" ? "text/csv" : "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = defaultName;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
