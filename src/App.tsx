import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { FileList } from "./components/FileList";
import { PreviewPane } from "./components/PreviewPane";
import { TABS, THEMES, TopBar, type TabId } from "./components/TopBar";
import { ArrangeTab, type ArrangePreset } from "./components/tabs/ArrangeTab";
import { DuplicatesTab } from "./components/tabs/DuplicatesTab";
import { FoldersTab } from "./components/tabs/FoldersTab";
import { InsightsTab } from "./components/tabs/InsightsTab";
import { LogTab } from "./components/tabs/LogTab";
import { RenameTab } from "./components/tabs/RenameTab";
import { Icon } from "./components/Icon";
import { Spinner } from "./components/ui";
import {
  DEFAULT_DUPLICATE_OPTIONS,
  DEFAULT_RENAME_OPTIONS,
  FOLDER_COLORS,
  applyRename,
  arrangePreview,
  buildInsights,
  dominantKind,
  findDuplicates,
  formatDate,
  humanBytes,
  keeperSuggestion,
  presetForKind,
  summarizeArrange,
  uid,
  visualDuplicateGroups,
} from "./lib/organizer/engine";
import { DEMO_FOLDER_STYLES, DEMO_LOG, DEMO_ROOT, MOCK_FILES, MOCK_FOLDERS } from "./lib/organizer/mockData";
import {
  applyFolderStyle,
  commitRename,
  deleteDuplicates,
  executeArrange,
  imageSignatures,
  isTauri,
  listFolders,
  pickFolder,
  refreshShell,
  resetFolderStyle,
  revealInExplorer,
  revertFiles,
  saveTextFile,
  scanFolder,
  type FolderEntry,
} from "./lib/organizer/bridge";
import type {
  AppFile,
  ArrangeRule,
  DuplicateGroup,
  FolderStyle,
  Insight,
  LogEntry,
  LogKind,
  RenameOptions,
  StylePreset,
  StyleStep,
  UndoRecord,
} from "./lib/organizer/types";
import { DEFAULT_SIZE_RANGES } from "./lib/organizer/types";

const INITIAL_RULE: ArrangeRule = {
  mode: "type",
  dateGranularity: "month",
  sizeRanges: DEFAULT_SIZE_RANGES,
  similarityThreshold: 82,
  action: "move",
  dryRun: true,
};

const PRESETS: ArrangePreset[] = [
  { id: "tidy", label: "Tidy by type", patch: { mode: "type", action: "move", dryRun: true } },
  { id: "photos", label: "Photos by month", patch: { mode: "date", dateGranularity: "month" } },
  { id: "big", label: "Big files", patch: { mode: "size", sizeRanges: DEFAULT_SIZE_RANGES.slice(3) } },
  { id: "similar", label: "Similar names", patch: { mode: "similarity", similarityThreshold: 85 } },
  { id: "ext", label: "Per extension", patch: { mode: "ext" } },
];

const baseName = (path: string) => path.split(/[\\/]+/).filter(Boolean).pop() ?? path;

function loadCustomFolders(): FolderEntry[] {
  try {
    const raw = localStorage.getItem("arrangeit.customFolders");
    return raw ? (JSON.parse(raw) as FolderEntry[]) : [];
  } catch {
    return [];
  }
}

type Toast = { id: string; message: string; kind: "ok" | "error" };

export default function App() {
  const tauri = useMemo(() => isTauri(), []);

  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem("arrangeit.theme") ?? "dusk";
    } catch {
      return "dusk";
    }
  });
  const [tab, setTab] = useState<TabId>("arrange");
  const [paletteOpen, setPaletteOpen] = useState(false);

  /* ---- filesystem state: never seeded with demo data in the packaged app ---- */
  const [files, setFiles] = useState<AppFile[]>(() => (tauri ? [] : MOCK_FILES));
  const [root, setRoot] = useState<string>(() => (tauri ? "" : DEMO_ROOT));
  const [folders, setFolders] = useState<FolderEntry[]>(() =>
    tauri
      ? []
      : MOCK_FOLDERS.map((f) => ({ name: f.name, path: `${DEMO_ROOT}\\${f.name}`, files: f.count, bytes: f.bytes })),
  );
  const [customFolders, setCustomFolders] = useState<FolderEntry[]>(loadCustomFolders);
  const [styles, setStyles] = useState<Record<string, FolderStyle>>(() => {
    if (tauri) return {};
    const mapped: Record<string, FolderStyle> = {};
    for (const [name, style] of Object.entries(DEMO_FOLDER_STYLES)) {
      mapped[`${DEMO_ROOT}\\${name}`] = { ...style, path: `${DEMO_ROOT}\\${name}` };
    }
    return mapped;
  });
  const [appliedStyles, setAppliedStyles] = useState<Set<string>>(() => (tauri ? new Set() : new Set(Object.keys(styles))));

  const [selection, setSelection] = useState<Set<string>>(() =>
    tauri ? new Set() : new Set(MOCK_FILES.slice(0, 6).map((f) => f.id)),
  );
  const [activeId, setActiveId] = useState<string | null>(tauri ? null : (MOCK_FILES[0]?.id ?? null));
  const [recursive, setRecursive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hashing, setHashing] = useState(false);

  const [rule, setRule] = useState<ArrangeRule>(INITIAL_RULE);
  const [scope, setScope] = useState<"selected" | "all">("all");

  const [dupOptions, setDupOptions] = useState(DEFAULT_DUPLICATE_OPTIONS);
  const [scanned, setScanned] = useState(!tauri);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [visualGroups, setVisualGroups] = useState<DuplicateGroup[]>([]);
  const [keepers, setKeepers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());

  const [renameOptions, setRenameOptions] = useState<RenameOptions>(DEFAULT_RENAME_OPTIONS);
  const [activeFolder, setActiveFolder] = useState<string>(() =>
    tauri ? "" : `${DEMO_ROOT}\\${MOCK_FOLDERS[0]?.name ?? ""}`,
  );
  const [steps, setSteps] = useState<StyleStep[] | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [planBusy, setPlanBusy] = useState<string | null>(null);

  const [log, setLog] = useState<LogEntry[]>(() => (tauri ? [] : DEMO_LOG));
  const [undoStack, setUndoStack] = useState<UndoRecord[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);

  const toastTimer = useRef<number | null>(null);
  const rollbacks = useRef(new Map<string, () => void>());

  /* ---------------- feedback ---------------- */

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("arrangeit.theme", theme);
    } catch {
      /* private mode */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("arrangeit.customFolders", JSON.stringify(customFolders));
    } catch {
      /* ignore */
    }
  }, [customFolders]);

  const showToast = useCallback((message: string, kind: "ok" | "error" = "ok") => {
    setToast({ id: uid("toast"), message, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4600);
  }, []);

  const pushLog = useCallback((kind: LogKind, message: string, detail?: string) => {
    setLog((prev) => [{ id: uid("log"), at: new Date().toISOString(), kind, message, detail }, ...prev].slice(0, 250));
  }, []);

  const pushUndo = useCallback((record: UndoRecord | null) => {
    if (record) setUndoStack((prev) => [...prev, record].slice(-20));
  }, []);

  /* ---------------- scanning ---------------- */

  const scanInto = useCallback(
    async (path: string, silent = false) => {
      setBusy(true);
      try {
        const result = await scanFolder(path, recursive, false);
        setFiles(result.files);
        setRoot(result.root);
        setSelection(new Set());
        setActiveId(result.files[0]?.id ?? null);
        setPending(new Set());
        setKeepers({});
        setScanned(false);
        setScannedAt(null);
        setVisualGroups([]);
        setSteps(null);

        const listed = await listFolders(result.root);
        setFolders(listed);
        setActiveFolder((current) => (listed.some((f) => f.path === current) ? current : (listed[0]?.path ?? "")));

        try {
          localStorage.setItem("arrangeit.lastRoot", result.root);
        } catch {
          /* ignore */
        }

        const bytes = result.files.reduce((sum, f) => sum + f.size, 0);
        pushLog(
          "scan",
          `Scanned ${baseName(result.root) || result.root}`,
          `${result.files.length} files · ${humanBytes(bytes)} · ${result.elapsedMs} ms${result.truncated ? " · truncated" : ""}`,
        );
        if (!silent) showToast(`Found ${result.files.length} files in ${result.elapsedMs} ms`);
      } catch (error) {
        pushLog("error", "Scan failed", String(error));
        showToast("Could not read that folder", "error");
      } finally {
        setBusy(false);
      }
    },
    [pushLog, recursive, showToast],
  );

  // Resume the last folder on launch (desktop only) — the user never sees phantom files.
  useEffect(() => {
    if (!tauri) return;
    let last = "";
    try {
      last = localStorage.getItem("arrangeit.lastRoot") ?? "";
    } catch {
      last = "";
    }
    if (last) void scanInto(last, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseFolder = useCallback(async () => {
    const picked = await pickFolder();
    if (!picked) {
      if (!tauri) showToast("Folder picking needs the desktop app — this is the browser demo.");
      return;
    }
    await scanInto(picked);
  }, [scanInto, showToast, tauri]);

  const addStyleFolder = useCallback(async () => {
    const picked = await pickFolder("Choose any folder to style");
    if (!picked) {
      if (!tauri) showToast("Adding folders needs the desktop app — this is the browser demo.");
      return;
    }
    const entry: FolderEntry = { name: baseName(picked), path: picked, files: 0, bytes: 0 };
    setCustomFolders((prev) => (prev.some((folder) => folder.path === picked) ? prev : [...prev, entry]));
    setActiveFolder(picked);
    setSteps(null);
    setTab("folders");
    showToast(`${entry.name} is ready to style`);
  }, [showToast, tauri]);

  const runScan = useCallback(() => {
    if (root) void scanInto(root);
    else void chooseFolder();
  }, [chooseFolder, root, scanInto]);

  /* ---------------- derived plans ---------------- */

  const allFolders = useMemo(() => {
    const seen = new Set<string>();
    const merged: FolderEntry[] = [];
    for (const folder of [...folders, ...customFolders]) {
      if (seen.has(folder.path)) continue;
      seen.add(folder.path);
      merged.push(folder);
    }
    return merged;
  }, [folders, customFolders]);

  const selectedFiles = useMemo(() => files.filter((f) => selection.has(f.id)), [files, selection]);
  const scopedFiles = scope === "selected" && selectedFiles.length > 0 ? selectedFiles : files;
  const items = useMemo(() => arrangePreview(scopedFiles, rule, root), [scopedFiles, rule, root]);
  const summary = useMemo(() => summarizeArrange(items), [items]);

  const baseGroups = useMemo(() => (scanned ? findDuplicates(files, dupOptions) : []), [files, dupOptions, scanned]);
  const duplicateGroups = useMemo(() => {
    if (!dupOptions.byVisual || visualGroups.length === 0) return baseGroups;
    const seen = new Set(baseGroups.flatMap((group) => group.files.map((file) => file.path)));
    const known = new Set(files.map((file) => file.path));
    const extras = visualGroups.filter(
      (group) => group.files.every((file) => known.has(file.path)) && group.files.some((file) => !seen.has(file.path)),
    );
    return [...baseGroups, ...extras];
  }, [baseGroups, dupOptions.byVisual, files, visualGroups]);

  const renameRows = useMemo(() => applyRename(selectedFiles, renameOptions), [selectedFiles, renameOptions]);

  const activeFile = useMemo(() => files.find((f) => f.id === activeId) ?? null, [files, activeId]);
  const activeTarget = useMemo(() => items.find((i) => i.file.id === activeId)?.targetFolder, [items, activeId]);
  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);
  const styledFolderNames = useMemo(
    () => new Set([...appliedStyles].map((path) => baseName(path))),
    [appliedStyles],
  );

  const insights: Insight[] = useMemo(
    () => buildInsights(files, allFolders.map((f) => ({ name: f.name, files: f.files, bytes: f.bytes })), duplicateGroups, styledFolderNames),
    [allFolders, duplicateGroups, files, styledFolderNames],
  );

  // Default style entries for every discovered folder.
  useEffect(() => {
    setStyles((prev) => {
      let changed = false;
      const next = { ...prev };
      allFolders.forEach((folder, index) => {
        if (!next[folder.path]) {
          next[folder.path] = {
            folder: folder.name,
            path: folder.path,
            glyph: "folder",
            color: FOLDER_COLORS[index % FOLDER_COLORS.length],
            tooltip: "",
            hideSystemFiles: true,
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [allFolders]);

  /* ---------------- selection ---------------- */

  const toggle = useCallback((id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelection((prev) => (prev.size === files.length ? new Set() : new Set(files.map((f) => f.id))));
  }, [files]);

  /* ---------------- actions ---------------- */

  const handleArrange = useCallback(async () => {
    if (items.length === 0) return;
    setBusy(true);
    try {
      const snapshot = files;
      const outcome = await executeArrange(items, rule.action, rule.dryRun, root);
      pushUndo(outcome.undo);
      if (outcome.undo) rollbacks.current.set(outcome.undo.id, () => setFiles(snapshot));

      if (rule.dryRun) {
        pushLog("arrange", `Dry run: ${items.length} files → ${summary.length} folders`, `${rule.mode} · ${rule.action}`);
        showToast(`Dry run — ${items.length} files would move into ${summary.length} folders`);
      } else {
        pushLog(
          "arrange",
          `${outcome.action === "move" ? "Moved" : "Copied"} ${outcome.performed} files into ${summary.length} folders`,
          outcome.failures ? `${outcome.failures} skipped (name clash or missing)` : undefined,
        );
        const moves = new Map(items.filter((i) => i.status === "ok").map((i) => [i.file.id, i]));
        setFiles((prev) =>
          prev.map((file) => {
            const plan = moves.get(file.id);
            if (!plan) return file;
            return { ...file, folder: plan.targetFolder, path: `${root}\\${plan.targetFolder}\\${file.name}` };
          }),
        );
        const listed = await listFolders(root);
        setFolders(listed);
        showToast(`${outcome.action === "move" ? "Moved" : "Copied"} ${outcome.performed} files — Ctrl+Z to undo`);
      }
    } catch (error) {
      pushLog("error", "Arrange failed", String(error));
      showToast("Arrange failed — see History", "error");
    } finally {
      setBusy(false);
    }
  }, [files, items, pushLog, pushUndo, root, rule.action, rule.dryRun, rule.mode, showToast, summary.length]);

  const togglePending = useCallback((fileId: string) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const runDuplicateScan = useCallback(async () => {
    if (!root) {
      showToast("Choose a folder first", "error");
      return;
    }
    setScanned(true);
    setScannedAt(formatDate(new Date().toISOString(), true).split(" ").slice(-1)[0]);
    const groups = findDuplicates(files, dupOptions);
    pushLog(
      "duplicate",
      `Duplicate scan: ${groups.length} groups`,
      `${humanBytes(groups.reduce((sum, g) => sum + g.reclaimable, 0))} reclaimable`,
    );
    showToast(`${groups.length} duplicate group${groups.length === 1 ? "" : "s"} found`);

    // Perceptual pass runs in the background: reads image pixels, nothing else.
    if (dupOptions.byVisual && tauri) {
      const images = files.filter((file) => file.kind === "image");
      if (images.length > 0) {
        setHashing(true);
        try {
          const signatures = await imageSignatures(images.map((file) => file.path));
          const exact = new Set(groups.flatMap((group) => group.files.map((file) => file.path)));
          const visual = visualDuplicateGroups(signatures, files, 10, exact);
          setVisualGroups(visual);
          if (visual.length > 0) {
            pushLog("duplicate", `${visual.length} visually similar clusters`, "perceptual dHash");
            showToast(`+${visual.length} visually similar group${visual.length === 1 ? "" : "s"}`);
          }
        } catch (error) {
          pushLog("error", "Similarity pass failed", String(error));
        } finally {
          setHashing(false);
        }
      }
    }
  }, [dupOptions, files, pushLog, root, showToast, tauri]);

  const selectAllExtras = useCallback(() => {
    const extras = duplicateGroups.flatMap((group) => {
      const keepId = keepers[group.id] ?? keeperSuggestion(group).id;
      return group.files.filter((f) => f.id !== keepId).map((f) => f.id);
    });
    setPending(new Set(extras));
  }, [duplicateGroups, keepers]);

  const handleDeleteDuplicates = useCallback(async () => {
    const targets = files.filter((f) => pending.has(f.id));
    if (targets.length === 0) return;
    setBusy(true);
    try {
      const snapshot = files;
      const bytes = targets.reduce((sum, f) => sum + f.size, 0);
      const outcome = await deleteDuplicates(targets.map((f) => f.path), bytes);
      pushUndo(outcome.undo);
      if (outcome.undo) rollbacks.current.set(outcome.undo.id, () => setFiles(snapshot));
      setFiles((prev) => prev.filter((f) => !pending.has(f.id)));
      setPending(new Set());
      setSelection((prev) => {
        const next = new Set(prev);
        for (const file of targets) next.delete(file.id);
        return next;
      });
      pushLog("duplicate", `Recycled ${outcome.deleted} duplicates`, `${humanBytes(outcome.freed)} reclaimed`);
      showToast(`Recycled ${outcome.deleted} files · ${humanBytes(outcome.freed)} freed`);
    } catch (error) {
      pushLog("error", "Delete failed", String(error));
      showToast("Could not recycle those files", "error");
    } finally {
      setBusy(false);
    }
  }, [files, pending, pushLog, pushUndo, showToast]);

  const handleRename = useCallback(async () => {
    const ready = renameRows.filter((r) => r.changed && !r.conflict && !r.error);
    if (ready.length === 0) return;
    setBusy(true);
    try {
      const snapshot = files;
      const outcome = await commitRename(renameRows, false);
      pushUndo(outcome.undo);
      if (outcome.undo) rollbacks.current.set(outcome.undo.id, () => setFiles(snapshot));
      const byId = new Map(ready.map((r) => [r.file.id, r.nextName]));
      setFiles((prev) =>
        prev.map((file) =>
          byId.has(file.id)
            ? { ...file, name: byId.get(file.id)!, path: file.path.replace(/[^\\]+$/, byId.get(file.id)!) }
            : file,
        ),
      );
      pushLog("rename", `Renamed ${outcome.renamed} files`, renameOptions.pattern);
      showToast(`Renamed ${outcome.renamed} files — Ctrl+Z to undo`);
    } catch (error) {
      pushLog("error", "Rename failed", String(error));
      showToast("Rename failed — a target name may exist", "error");
    } finally {
      setBusy(false);
    }
  }, [files, pushLog, pushUndo, renameOptions, renameRows, showToast]);

  const updateStyle = useCallback((folderPath: string, patch: Partial<FolderStyle>) => {
    setStyles((prev) => {
      const base = prev[folderPath] ?? {
        folder: baseName(folderPath),
        path: folderPath,
        glyph: "folder" as const,
        color: FOLDER_COLORS[0],
        tooltip: "",
        hideSystemFiles: true,
      };
      return { ...prev, [folderPath]: { ...base, ...patch, folder: base.folder, path: folderPath } };
    });
    setSteps(null);
  }, []);

  const applyStyleTo = useCallback(
    async (folderPath: string, style: FolderStyle) => {
      const outcome = await applyFolderStyle({ ...style, folder: baseName(folderPath), path: folderPath }, root.replace(/\\+$/, ""), false);
      setAppliedStyles((prev) => new Set(prev).add(folderPath));
      pushUndo(outcome.undo);
      if (outcome.undo) rollbacks.current.set(outcome.undo.id, () => setSteps(null));
      return outcome;
    },
    [pushUndo, root],
  );

  const handleApplyStyle = useCallback(async () => {
    const style = styles[activeFolder];
    if (!style || !activeFolder) return;
    if (!root && !style.path) {
      showToast("Choose a folder first", "error");
      return;
    }
    setBusy(true);
    try {
      const outcome = await applyStyleTo(activeFolder, style);
      setSteps(outcome.steps);
      pushLog("style", `Styled ${baseName(activeFolder)}`, outcome.steps.map((s) => s.command).join(" · "));
      const failed = outcome.steps.filter((s) => !s.ok);
      if (failed.length > 0) {
        showToast(`${failed.length} step${failed.length === 1 ? "" : "s"} failed — see the steps below`, "error");
      } else {
        showToast(`${baseName(activeFolder)} has a new icon — press F5 in Explorer if it lingers`);
      }
    } catch (error) {
      pushLog("error", "Folder style failed", String(error));
      showToast(String(error), "error");
    } finally {
      setBusy(false);
    }
  }, [activeFolder, applyStyleTo, pushLog, root, showToast, styles]);

  const applyPresetToStyle = useCallback(
    (preset: StylePreset, folderPath = activeFolder) => {
      if (!folderPath) return;
      setStyles((prev) => {
        const base =
          prev[folderPath] ?? {
            folder: baseName(folderPath),
            path: folderPath,
            glyph: preset.glyph,
            color: preset.color,
            tooltip: "",
            hideSystemFiles: true,
          };
        return {
          ...prev,
          [folderPath]: { ...base, glyph: preset.glyph, color: preset.color, tooltip: preset.tooltip, path: folderPath },
        };
      });
      setSteps(null);
    },
    [activeFolder],
  );

  const handleAutoStyle = useCallback(async () => {
    const targets = allFolders.filter((folder) => !appliedStyles.has(folder.path));
    if (targets.length === 0) {
      showToast("Every folder already has a look");
      return;
    }
    setAutoBusy(true);
    let done = 0;
    let failed = 0;
    for (const folder of targets.slice(0, 24)) {
      const inside = files.filter((file) => file.path.toLowerCase().startsWith(folder.path.toLowerCase() + "\\"));
      const preset = presetForKind(dominantKind(inside));
      const style: FolderStyle = {
        folder: folder.name,
        path: folder.path,
        glyph: preset.glyph,
        color: preset.color,
        tooltip: preset.tooltip,
        hideSystemFiles: true,
      };
      try {
        await applyStyleTo(folder.path, style);
        setStyles((prev) => ({ ...prev, [folder.path]: style }));
        setAppliedStyles((prev) => new Set(prev).add(folder.path));
        done += 1;
      } catch {
        failed += 1;
      }
    }
    setAutoBusy(false);
    pushLog("style", `Auto-styled ${done} folders`, failed ? `${failed} failed` : "by dominant file type");
    showToast(`Auto-styled ${done} folder${done === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`);
  }, [allFolders, appliedStyles, applyStyleTo, files, pushLog, showToast]);

  const handleResetStyle = useCallback(async () => {
    if (!activeFolder) return;
    setBusy(true);
    try {
      const result = await resetFolderStyle(root.replace(/\\+$/, ""), baseName(activeFolder), activeFolder);
      setSteps(result);
      setAppliedStyles((prev) => {
        const next = new Set(prev);
        next.delete(activeFolder);
        return next;
      });
      pushLog("style", `Removed style from ${baseName(activeFolder)}`, result.map((s) => s.command).join(" · "));
      showToast(`${baseName(activeFolder)} restored to the default folder look`);
    } catch (error) {
      pushLog("error", "Reset failed", String(error));
      showToast("Could not remove the style", "error");
    } finally {
      setBusy(false);
    }
  }, [activeFolder, pushLog, root, showToast]);

  const handleRefreshShell = useCallback(async () => {
    const step = await refreshShell();
    showToast(step.detail, step.ok ? "ok" : "error");
  }, [showToast]);

  const handleUndo = useCallback(
    async (record?: UndoRecord) => {
      const target = record ?? undoStack[undoStack.length - 1];
      if (!target) return;
      setBusy(true);
      try {
        const ops = target.ops ?? [];
        const outcome = ops.length > 0 ? await revertFiles(ops) : { reverted: 0, failures: 0 };
        rollbacks.current.get(target.id)?.();
        rollbacks.current.delete(target.id);
        setUndoStack((prev) => prev.filter((r) => r.id !== target.id));
        pushLog(
          "undo",
          `Undid: ${target.label}`,
          outcome.reverted > 0 ? `${outcome.reverted} path(s) restored` : "UI state restored — recycled files sit in the Recycle Bin",
        );
        showToast(outcome.reverted > 0 ? `Undone — ${target.label}` : `Restored — ${target.label}`);
      } catch (error) {
        pushLog("error", "Undo failed", String(error));
        showToast("Undo failed", "error");
      } finally {
        setBusy(false);
      }
    },
    [pushLog, showToast, undoStack],
  );

  const exportPlan = useCallback(async () => {
    const rows = [
      ["file", "size_bytes", "source", "target_folder", "target_path"],
      ...items.map((i) => [i.file.name, String(i.file.size), i.file.path, i.targetFolder, i.targetPath]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const saved = await saveTextFile(`arrangeit-plan-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    if (saved) showToast("Plan exported");
  }, [items, showToast]);

  const exportRename = useCallback(async () => {
    const rows = [["current", "proposed", "conflict"], ...renameRows.map((r) => [r.file.name, r.nextName, String(r.conflict)])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const saved = await saveTextFile(`arrangeit-rename-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    if (saved) showToast("Rename plan exported");
  }, [renameRows, showToast]);

  const handleInsight = useCallback(
    async (insight: Insight) => {
      if (insight.target === "duplicates") {
        setTab("duplicates");
        if (!scanned) {
          setPlanBusy(insight.id);
          await runDuplicateScan();
          setPlanBusy(null);
        }
        return;
      }
      if (insight.target === "arrange") {
        if (insight.rule) setRule((prev) => ({ ...prev, ...insight.rule, dryRun: true }));
        setScope("all");
        setTab("arrange");
        showToast("Plan ready — review it, then run the dry run");
        return;
      }
      // styles
      setTab("folders");
      setPlanBusy(insight.id);
      try {
        if (insight.preset && insight.folder) {
          const folder = allFolders.find((item) => item.name === insight.folder || item.path === insight.folder);
          if (folder) {
            applyPresetToStyle(insight.preset, folder.path);
            setActiveFolder(folder.path);
            const style: FolderStyle = {
              folder: folder.name,
              path: folder.path,
              glyph: insight.preset.glyph,
              color: insight.preset.color,
              tooltip: insight.preset.tooltip,
              hideSystemFiles: true,
            };
            if (root) {
              await applyStyleTo(folder.path, style);
              setStyles((prev) => ({ ...prev, [folder.path]: style }));
              showToast(`${folder.name} styled as ${insight.preset.label}`);
            }
          }
        } else {
          await handleAutoStyle();
        }
      } catch (error) {
        pushLog("error", "Styling failed", String(error));
        showToast("Could not style that folder", "error");
      } finally {
        setPlanBusy(null);
      }
    },
    [allFolders, applyPresetToStyle, applyStyleTo, handleAutoStyle, pushLog, root, runDuplicateScan, scanned, showToast],
  );

  /* ---------------- command palette ---------------- */

  const commands: Command[] = useMemo(() => {
    const list: Command[] = TABS.map((item) => ({
      id: `tab-${item.id}`,
      label: `Go to ${item.label}`,
      group: "Navigate",
      icon: item.icon,
      run: () => setTab(item.id),
    }));

    list.push(
      { id: "pick", label: "Choose a folder…", group: "Folder", icon: "folder", keys: "Ctrl+O", run: () => void chooseFolder() },
      { id: "rescan", label: "Rescan current folder", group: "Folder", icon: "refresh", keys: "F5", run: runScan },
      { id: "add-folder", label: "Style any folder…", group: "Folder", icon: "plus", run: () => void addStyleFolder() },
      { id: "auto", label: "Auto-style every folder", group: "Folder", icon: "sparkles", run: () => void handleAutoStyle() },
      { id: "dups", label: "Find duplicates", group: "Actions", icon: "duplicate", run: () => void runDuplicateScan() },
      { id: "dry", label: rule.dryRun ? "Turn off dry run" : "Turn on dry run", group: "Actions", icon: "sliders", run: () => setRule({ ...rule, dryRun: !rule.dryRun }) },
      { id: "apply", label: "Run the arrange plan", group: "Actions", icon: "sort", keys: "Enter", run: () => void handleArrange() },
      { id: "undo", label: "Undo last change", group: "Actions", icon: "undo", keys: "Ctrl+Z", run: () => void handleUndo() },
      { id: "csv", label: "Export plan as CSV", group: "Actions", icon: "download", run: () => void exportPlan() },
      { id: "search", label: "Search files", group: "Actions", icon: "search", keys: "/", run: () => document.getElementById("file-search")?.focus() },
    );

    for (const item of THEMES) {
      list.push({ id: `theme-${item.id}`, label: `Theme: ${item.label}`, group: "Appearance", icon: "palette", run: () => setTheme(item.id) });
    }

    for (const folder of allFolders.slice(0, 12)) {
      list.push({
        id: `folder-${folder.path}`,
        label: `Style ${folder.name}`,
        desc: humanBytes(folder.bytes),
        group: "Folders",
        icon: "folder",
        run: () => {
          setActiveFolder(folder.path);
          setTab("folders");
        },
      });
    }

    return list;
  }, [addStyleFolder, allFolders, chooseFolder, exportPlan, handleArrange, handleAutoStyle, handleUndo, rule, runDuplicateScan, runScan]);

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (typing) {
        if (event.key === "Escape") (el as HTMLInputElement).blur();
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        document.getElementById("file-search")?.focus();
      } else if (event.key === "F5") {
        event.preventDefault();
        runScan();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void chooseFolder();
      } else if (event.key >= "1" && event.key <= "6") {
        setTab(TABS[Number(event.key) - 1].id);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void handleUndo();
      } else if (event.key === "Enter" && tab === "arrange") {
        void handleArrange();
      } else if (event.key === "Escape") {
        if (paletteOpen) setPaletteOpen(false);
        else setSelection(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooseFolder, handleArrange, handleUndo, paletteOpen, runScan, tab]);

  const counts: Partial<Record<TabId, number>> = {
    duplicates: duplicateGroups.length,
    rename: renameRows.filter((r) => r.changed).length,
    folders: styledFolderNames.size,
    insights: insights.length,
  };

  const activeFolderEntry = allFolders.find((folder) => folder.path === activeFolder);
  const canStyle = Boolean(root) || allFolders.some((folder) => folder.path.includes("\\"));

  return (
    <div className="app">
      <div className="aurora" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="noise" aria-hidden="true" />

      <TopBar
        tab={tab}
        setTab={setTab}
        counts={counts}
        root={root}
        demo={!tauri}
        onPick={() => void chooseFolder()}
        onScan={runScan}
        busy={busy}
        theme={theme}
        setTheme={setTheme}
        lastUndo={undoStack[undoStack.length - 1] ?? null}
        onUndo={() => void handleUndo()}
        onPalette={() => setPaletteOpen(true)}
      />

      <div className="workspace">
        <section className="panel" aria-label="Files">
          <FileList
            files={files}
            selected={selection}
            activeId={activeId}
            root={root}
            busy={busy}
            recursive={recursive}
            demo={!tauri}
            onToggle={toggle}
            onActivate={setActiveId}
            onToggleAll={toggleAll}
            onPick={() => void chooseFolder()}
            onRecursiveChange={(value) => {
              setRecursive(value);
              if (root) void scanInto(root);
            }}
          />
        </section>

        {tab === "arrange" ? (
          <ArrangeTab
            rule={rule}
            setRule={setRule}
            items={items}
            summary={summary}
            scope={scope}
            setScope={setScope}
            onApply={() => void handleArrange()}
            onExport={() => void exportPlan()}
            busy={busy}
            presets={PRESETS}
            onPreset={(preset) => setRule({ ...rule, ...preset.patch })}
          />
        ) : null}

        {tab === "duplicates" ? (
          <DuplicatesTab
            groups={duplicateGroups}
            options={dupOptions}
            setOptions={setDupOptions}
            keepers={keepers}
            setKeeper={(groupId, fileId) => setKeepers((prev) => ({ ...prev, [groupId]: fileId }))}
            pending={pending}
            onTogglePending={togglePending}
            onSelectAllButKeepers={selectAllExtras}
            onDelete={() => void handleDeleteDuplicates()}
            onScan={() => void runDuplicateScan()}
            busy={busy}
            scanned={scanned}
            scannedAt={scannedAt}
            hashing={hashing}
          />
        ) : null}

        {tab === "rename" ? (
          <RenameTab
            options={renameOptions}
            setOptions={setRenameOptions}
            rows={renameRows}
            onApply={() => void handleRename()}
            onExport={() => void exportRename()}
            busy={busy}
          />
        ) : null}

        {tab === "folders" ? (
          <FoldersTab
            folders={allFolders}
            styles={styles}
            active={activeFolder}
            setActive={(folder) => {
              setActiveFolder(folder);
              setSteps(null);
            }}
            update={updateStyle}
            onApply={() => void handleApplyStyle()}
            onReset={() => void handleResetStyle()}
            onRefresh={() => void handleRefreshShell()}
            onPreset={(preset) => applyPresetToStyle(preset)}
            onAddFolder={() => void addStyleFolder()}
            onAutoStyle={() => void handleAutoStyle()}
            autoBusy={autoBusy}
            steps={steps}
            busy={busy}
            root={root}
            canStyle={canStyle}
            activeName={activeFolderEntry?.name}
          />
        ) : null}

        {tab === "insights" ? (
          <InsightsTab
            insights={insights}
            stats={{
              files: files.length,
              bytes: humanBytes(totalBytes),
              folders: allFolders.length,
              reclaimable: humanBytes(duplicateGroups.reduce((sum, g) => sum + g.reclaimable, 0)),
            }}
            onRun={(insight) => void handleInsight(insight)}
            busy={busy || hashing}
            planBusy={planBusy}
          />
        ) : null}

        {tab === "log" ? (
          <LogTab entries={log} undoStack={undoStack} onUndo={(record) => void handleUndo(record)} onClear={() => setLog([])} />
        ) : null}

        <PreviewPane file={activeFile} targetFolder={activeTarget} onReveal={(path) => void revealInExplorer(path)} />
      </div>

      <footer className="statusbar">
        <span className="mode" data-live={tauri && Boolean(root)}>
          {!tauri ? "Browser demo" : root ? "Live folder" : "No folder"}
        </span>
        <span>
          {files.length} file{files.length === 1 ? "" : "s"} · {humanBytes(totalBytes)}
        </span>
        {selection.size > 0 ? <span>{selection.size} selected</span> : null}
        <span className="sep" />
        <span className="mono">{rule.mode}</span>
        <span className="sep" />
        <span>{insights.length} suggestions</span>
        <span className="spacer" />
        {hashing ? (
          <span className="row" style={{ gap: 6 }}>
            <Spinner /> hashing pixels
          </span>
        ) : null}
        {busy ? (
          <span className="row" style={{ gap: 6 }}>
            <Spinner /> working
          </span>
        ) : null}
        <button className="btn sm ghost" onClick={() => setPaletteOpen(true)}>
          <Icon name="command" size={11} /> K
        </button>
        <span>v1.3.0</span>
      </footer>

      {toast ? (
        <div className="toast" data-kind={toast.kind} role="status">
          <span className="dot" aria-hidden="true" />
          <span>{toast.message}</span>
          <button className="btn sm ghost" onClick={() => setToast(null)} aria-label="Dismiss">
            <Icon name="close" size={12} />
          </button>
        </div>
      ) : null}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}
