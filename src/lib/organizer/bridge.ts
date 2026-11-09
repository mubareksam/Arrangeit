/**
 * Thin bridge between the planner and the native layer.
 *
 * In the Tauri webview every call is forwarded to a Rust command. In a plain
 * browser (`npm run dev`) the same call is simulated against the demo dataset so
 * the whole UI stays clickable without a build step.
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
import { MOCK_FILES } from "./mockData";
import { humanBytes, styleSteps, uid } from "./engine";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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

export async function scanFolder(path: string, recursive = true): Promise<ScanResult> {
  const started = performance.now();
  if (isTauri()) {
    const result = await invokeTauri<{ files: AppFile[]; root: string; truncated: boolean }>("scan_folder", {
      path,
      recursive,
    });
    return { ...result, elapsedMs: Math.round(performance.now() - started) };
  }
  await wait(420);
  const files = path && path !== "DEMO" ? MOCK_FILES : MOCK_FILES;
  return {
    files: files.map((f) => ({ ...f })),
    root: "C:\\Users\\Sam\\Desktop",
    elapsedMs: Math.round(performance.now() - started),
    truncated: false,
  };
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
  await wait(dryRun ? 120 : 520);
  const usable = items.filter((i) => i.status === "ok");
  const entries = usable.map((i) => `${i.file.name}  →  ${i.targetFolder}\\`);
  return {
    action,
    performed: dryRun ? 0 : usable.length,
    failures: items.length - usable.length,
    entries,
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
  await wait(380);
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
  await wait(dryRun ? 100 : 460);
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
}

export async function applyFolderStyle(style: FolderStyle, root: string, dryRun: boolean): Promise<StyleOutcome> {
  if (isTauri()) {
    return invokeTauri<StyleOutcome>("apply_folder_style", { style, root, dryRun });
  }
  await wait(dryRun ? 140 : 420);
  return {
    steps: styleSteps(style, root).map((s) => (dryRun ? s : { ...s, ok: true })),
    undo: dryRun
      ? null
      : {
          id: uid("undo"),
          kind: "style",
          label: `Styled ${style.folder}`,
          entries: [`remove ${root}${style.folder}\\desktop.ini`, `attrib -r "${root}${style.folder}"`],
        },
  };
}

/**
 * Reverts a recorded operation by moving every `to` back to its `from`.
 * Used by the undo button for arrange + rename runs.
 */
export interface RevertOutcome {
  reverted: number;
  failures: number;
}

export async function revertFiles(ops: UndoOp[]): Promise<RevertOutcome> {
  if (ops.length === 0) return { reverted: 0, failures: 0 };
  if (isTauri()) {
    return invokeTauri<RevertOutcome>("revert_files", { ops });
  }
  await wait(260);
  return { reverted: ops.length, failures: 0 };
}

/* ------------------------------------------------------------------ */
/* Shell helpers                                                       */
/* ------------------------------------------------------------------ */

export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false, title: "Choose a folder to arrange" });
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
    /* opening Explorer is best-effort */
  }
}
