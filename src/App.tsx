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
  DEFAULT_DUPLICATE_FILTER,
  DEFAULT_DUPLICATE_OPTIONS,
  DEFAULT_RENAME_OPTIONS,
  FOLDER_COLORS,
  applyRename,
  arrangePreview,
  buildInsights,
  dominantKind,
  filterDuplicateGroups,
  findDuplicates,
  formatDate,
  humanBytes,
  pickKeeper,
  presetForKind,
  summarizeArrange,
  uid,
  visualDuplicateGroups,
  type DuplicateFilter,
  type KeeperStrategy,
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
  type Signature,
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

/** Images are hashed in batches so the UI can breathe (and be cancelled). */
const HASH_BATCH = 24;

function loadCustomFolders(): FolderEntry[] {
  try {
    const raw = localStorage.getItem("arrangeit.customFolders");
    return raw ? (JSON.parse(raw) as FolderEntry[]) : [];
  } catch {
    return [];
  }
}

function loadPreference<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

type Toast = { id: string; message: string; kind: "ok" | "error" };
type EffectLevel = "auto" | "high" | "low";

/** A single unit of work shown in the status bar. Cancelling only discards results. */
interface Task {
  id: string;
  label: string;
  startedAt: number;
  cancellable: boolean;
}

export default function App() {
  const tauri = useMemo(() => isTauri(), []);

  const [theme, setTheme] = useState<string>(() => loadPreference("arrangeit.theme", "dusk"));
  const [effects, setEffects] = useState<EffectLevel>(() => loadPreference<EffectLevel>("arrangeit.effects", "auto"));
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
  const [recursive, setRecursive] = useState(false);

  /* ---- task registry (replaces the old shared `busy` boolean) ---- */
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clock, setClock] = useState(() => Date.now());
  const cancelled = useRef(new Set<string>());
  const busy = tasks.length > 0;

  const beginTask = useCallback((label: string, cancellable = false) => {
    const id = uid("task");
    setTasks((prev) => [...prev, { id, label, startedAt: Date.now(), cancellable }]);
    return id;
  }, []);

  const endTask = useCallback((id: string) => {
    cancelled.current.delete(id);
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }, []);

  const cancelTask = useCallback((id: string) => {
    cancelled.current.add(id);
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }, []);

  const isCancelled = useCallback((id: string) => cancelled.current.has(id), []);

  const [rule, setRule] = useState<ArrangeRule>(INITIAL_RULE);
  const [scope, setScope] = useState<"selected" | "all">("all");

  const [dupOptions, setDupOptions] = useState(DEFAULT_DUPLICATE_OPTIONS);
  const [dupFilter, setDupFilter] = useState<DuplicateFilter>(DEFAULT_DUPLICATE_FILTER);
  const [keeperStrategy, setKeeperStrategy] = useState<KeeperStrategy>("best");
  const [scanned, setScanned] = useState(!tauri);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [visualGroups, setVisualGroups] = useState<DuplicateGroup[]>([]);
  const [keepers, setKeepers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [ignoredGroups, setIgnoredGroups] = useState<Set<string>>(new Set());
  const [hashProgress, setHashProgress] = useState<{ done: number; total: number } | null>(null);
  const hashing = hashProgress !== null;

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
  const scanSeq = useRef(0);

  /* ---------------- chrome ---------------- */

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("arrangeit.theme", theme);
    } catch {
      /* private mode */
    }
  }, [theme]);

  useEffect(() => {
    const cores = navigator.hardwareConcurrency ?? 4;
    const level = effects === "auto" ? (cores <= 4 ? "low" : "high") : effects;
    document.documentElement.dataset.perf = level;
    try {
      localStorage.setItem("arrangeit.effects", effects);
    } catch {
      /* ignore */
    }
  }, [effects]);

  // One timer for every running task, not one per task.
  useEffect(() => {
    if (tasks.length === 0) return;
    setClock(Date.now());
    const id = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [tasks.length]);

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
      const run = scanSeq.current + 1;
      scanSeq.current = run;
      const task = beginTask("Scanning folder", true);
      try {
        const result = await scanFolder(path, recursive, false);
        // A newer scan (or a cancel) wins: stale results are dropped, never applied.
        if (isCancelled(task) || run !== scanSeq.current) return;

        setFiles(result.files);
        setRoot(result.root);
        setSelection(new Set());
        setActiveId(result.files[0]?.id ?? null);
        setPending(new Set());
        setKeepers({});
        setScanned(false);
        setScannedAt(null);
        setVisualGroups([]);
        setIgnoredGroups(new Set());
        setSteps(null);

        const listed = await listFolders(result.root);
        if (isCancelled(task) || run !== scanSeq.current) return;
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
        endTask(task);
      }
    },
    [beginTask, endTask, isCancelled, pushLog, recursive, showToast],
  );

  // Resume the last folder on launch (desktop only) — flat by default, so it is instant.
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

  const visibleGroups = useMemo(
    () => filterDuplicateGroups(duplicateGroups, dupFilter).filter((group) => !ignoredGroups.has(group.id)),
    [duplicateGroups, dupFilter, ignoredGroups],
  );

  const renameRows = useMemo(() => applyRename(selectedFiles, renameOptions), [selectedFiles, renameOptions]);

  const activeFile = useMemo(() => files.find((f) => f.id === activeId) ?? null, [files, activeId]);
  const activeTarget = useMemo(() => items.find((i) => i.file.id === activeId)?.targetFolder, [items, activeId]);
  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);
  const styledFolderNames = useMemo(() => new Set([...appliedStyles].map((path) => baseName(path))), [appliedStyles]);

  const insights: Insight[] = useMemo(
    () =>
      buildInsights(
        files,
        allFolders.map((f) => ({ name: f.name, files: f.files, bytes: f.bytes })),
        duplicateGroups,
        styledFolderNames,
      ),
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
    const task = beginTask(rule.dryRun ? "Running dry run" : "Moving files");
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
      endTask(task);
    }
  }, [beginTask, endTask, files, items, pushLog, pushUndo, root, rule.action, rule.dryRun, rule.mode, showToast, summary.length]);

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
    setIgnoredGroups(new Set());
    const groups = findDuplicates(files, dupOptions);
    pushLog(
      "duplicate",
      `Duplicate scan: ${groups.length} groups`,
      `${humanBytes(groups.reduce((sum, g) => sum + g.reclaimable, 0))} reclaimable`,
    );
    showToast(`${groups.length} duplicate group${groups.length === 1 ? "" : "s"} found`);

    const images = files.filter((file) => file.kind === "image");
    if (!dupOptions.byVisual || !tauri || images.length === 0) {
      setVisualGroups([]);
      return;
    }

    // Pixel pass: batched, cancellable, with real progress.
    const task = beginTask(`Comparing ${images.length} images`, true);
    setHashProgress({ done: 0, total: images.length });
    const collected: Signature[] = [];
    try {
      for (let index = 0; index < images.length; index += HASH_BATCH) {
        if (isCancelled(task)) break;
        setHashProgress({ done: index, total: images.length });
        const chunk = images.slice(index, index + HASH_BATCH);
        // Sequential batches keep memory flat and let the UI repaint between them.
        const signatures = await imageSignatures(chunk.map((file) => file.path));
        collected.push(...signatures);
      }
      if (!isCancelled(task)) {
        const exact = new Set(groups.flatMap((group) => group.files.map((file) => file.path)));
        const visual = visualDuplicateGroups(collected, files, 10, exact);
        setVisualGroups(visual);
        if (visual.length > 0) {
          pushLog("duplicate", `${visual.length} visually similar clusters`, "perceptual dHash");
          showToast(`+${visual.length} visually similar group${visual.length === 1 ? "" : "s"}`);
        }
        if (collected.length < images.length) {
          pushLog("duplicate", `${images.length - collected.length} images skipped`, "too large to compare visually");
        }
      }
    } catch (error) {
      pushLog("error", "Similarity pass failed", String(error));
    } finally {
      setHashProgress(null);
      endTask(task);
    }
  }, [beginTask, dupOptions, endTask, files, isCancelled, pushLog, root, showToast, tauri]);

  const selectAllExtras = useCallback(() => {
    const extras = visibleGroups.flatMap((group) => {
      const keepId = keepers[group.id] ?? pickKeeper(group, keeperStrategy).id;
      return group.files.filter((file) => file.id !== keepId).map((file) => file.id);
    });
    setPending(new Set(extras));
  }, [keeperStrategy, keepers, visibleGroups]);

  const keepOnePerFolder = useCallback(() => {
    const nextKeepers: Record<string, string> = { ...keepers };
    const nextPending = new Set(pending);
    for (const group of visibleGroups) {
      const sorted = [...group.files].sort((a, b) => a.folder.localeCompare(b.folder) || a.path.length - b.path.length);
      const keeper = sorted[0];
      if (!keeper) continue;
      nextKeepers[group.id] = keeper.id;
      for (const file of group.files) {
        if (file.id !== keeper.id) nextPending.add(file.id);
        else nextPending.delete(file.id);
      }
    }
    setKeepers(nextKeepers);
    setPending(nextPending);
    showToast("Keeping one copy per folder — review, then recycle");
  }, [keepers, pending, showToast, visibleGroups]);

  const handleDeleteDuplicates = useCallback(async () => {
    const targets = files.filter((f) => pending.has(f.id));
    if (targets.length === 0) return;
    const task = beginTask(`Recycling ${targets.length} files`);
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
      endTask(task);
    }
  }, [beginTask, endTask, files, pending, pushLog, pushUndo, showToast]);

  const handleRename = useCallback(async () => {
    const ready = renameRows.filter((r) => r.changed && !r.conflict && !r.error);
    if (ready.length === 0) return;
    const task = beginTask(`Renaming ${ready.length} files`);
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
      endTask(task);
    }
  }, [beginTask, endTask, files, pushLog, pushUndo, renameOptions, renameRows, showToast]);

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
    const task = beginTask(`Styling ${baseName(activeFolder)}`);
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
      endTask(task);
    }
  }, [activeFolder, applyStyleTo, beginTask, endTask, pushLog, root, showToast, styles]);

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
    const task = beginTask(`Auto-styling ${Math.min(targets.length, 24)} folders`, true);
    setAutoBusy(true);
    let done = 0;
    let failed = 0;
    try {
      for (const folder of targets.slice(0, 24)) {
        if (isCancelled(task)) break;
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
      pushLog("style", `Auto-styled ${done} folders`, failed ? `${failed} failed` : "by dominant file type");
      showToast(`Auto-styled ${done} folder${done === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`);
    } finally {
      setAutoBusy(false);
      endTask(task);
    }
  }, [allFolders, appliedStyles, applyStyleTo, beginTask, endTask, files, isCancelled, pushLog, showToast]);

  const handleResetStyle = useCallback(async () => {
    if (!activeFolder) return;
    const task = beginTask(`Restoring ${baseName(activeFolder)}`);
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
      endTask(task);
    }
  }, [activeFolder, beginTask, endTask, pushLog, root, showToast]);

  const handleRefreshShell = useCallback(async () => {
    const step = await refreshShell();
    showToast(step.detail, step.ok ? "ok" : "error");
  }, [showToast]);

  const handleUndo = useCallback(
    async (record?: UndoRecord) => {
      const target = record ?? undoStack[undoStack.length - 1];
      if (!target) return;
      const task = beginTask(`Undoing: ${target.label}`);
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
        endTask(task);
      }
    },
    [beginTask, endTask, pushLog, showToast, undoStack],
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

  const exportDuplicateReport = useCallback(async () => {
    const rows = [
      ["group", "match", "confidence", "files", "size_bytes", "reclaimable_bytes", "keeper", "path"],
      ...visibleGroups.flatMap((group) => {
        const keeper = keepers[group.id] ?? pickKeeper(group, keeperStrategy).id;
        return group.files.map((file) => [
          group.id,
          group.match,
          String(group.confidence),
          String(group.files.length),
          String(file.size),
          String(group.reclaimable),
          file.id === keeper ? "yes" : "no",
          file.path,
        ]);
      }),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const saved = await saveTextFile(`arrangeit-duplicates-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    if (saved) showToast("Duplicate report exported");
  }, [keeperStrategy, keepers, showToast, visibleGroups]);

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
      { id: "dups-keep", label: "Keep one copy per folder", group: "Actions", icon: "duplicate", run: keepOnePerFolder },
      { id: "dry", label: rule.dryRun ? "Turn off dry run" : "Turn on dry run", group: "Actions", icon: "sliders", run: () => setRule({ ...rule, dryRun: !rule.dryRun }) },
      { id: "apply", label: "Run the arrange plan", group: "Actions", icon: "sort", keys: "Enter", run: () => void handleArrange() },
      { id: "undo", label: "Undo last change", group: "Actions", icon: "undo", keys: "Ctrl+Z", run: () => void handleUndo() },
      { id: "csv", label: "Export plan as CSV", group: "Actions", icon: "download", run: () => void exportPlan() },
      { id: "search", label: "Search files", group: "Actions", icon: "search", keys: "/", run: () => document.getElementById("file-search")?.focus() },
    );

    for (const item of THEMES) {
      list.push({ id: `theme-${item.id}`, label: `Theme: ${item.label}`, group: "Appearance", icon: "palette", run: () => setTheme(item.id) });
    }

    list.push({
      id: "effects",
      label: effects === "low" ? "Turn glass effects back on" : "Performance mode (less blur)",
      group: "Appearance",
      icon: "zap",
      run: () => setEffects(effects === "low" ? "high" : "low"),
    });

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
  }, [addStyleFolder, allFolders, chooseFolder, effects, exportPlan, handleArrange, handleAutoStyle, handleUndo, keepOnePerFolder, rule, runDuplicateScan, runScan]);

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

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
    duplicates: visibleGroups.length,
    rename: renameRows.filter((r) => r.changed).length,
    folders: styledFolderNames.size,
    insights: insights.length,
  };

  const activeFolderEntry = allFolders.find((folder) => folder.path === activeFolder);
  const canStyle = Boolean(root) || allFolders.some((folder) => folder.path.includes("\\"));
  const runningTask = tasks[tasks.length - 1];
  const elapsed = runningTask ? Math.max(0, Math.floor((clock - runningTask.startedAt) / 1000)) : 0;

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
        reduceEffects={effects === "low"}
        onReduceEffects={(value) => setEffects(value ? "low" : "high")}
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
            groups={visibleGroups}
            options={dupOptions}
            setOptions={setDupOptions}
            filter={dupFilter}
            setFilter={setDupFilter}
            strategy={keeperStrategy}
            setStrategy={(next) => {
              setKeeperStrategy(next);
              setKeepers({});
            }}
            keepers={keepers}
            setKeeper={(groupId, fileId) => setKeepers((prev) => ({ ...prev, [groupId]: fileId }))}
            ignoredCount={ignoredGroups.size}
            onIgnore={(groupId) =>
              setIgnoredGroups((prev) => {
                const next = new Set(prev);
                if (next.has(groupId)) next.delete(groupId);
                else next.add(groupId);
                return next;
              })
            }
            onClearIgnored={() => setIgnoredGroups(new Set())}
            pending={pending}
            onTogglePending={togglePending}
            onSelectAllButKeepers={selectAllExtras}
            onKeepOnePerFolder={keepOnePerFolder}
            onDelete={() => void handleDeleteDuplicates()}
            onScan={() => void runDuplicateScan()}
            onExport={() => void exportDuplicateReport()}
            busy={busy}
            scanned={scanned}
            scannedAt={scannedAt}
            hashing={hashing}
            hashProgress={hashProgress}
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

        {tasks.map((task) => (
          <span className="taskchip" key={task.id}>
            <Spinner />
            <span className="ellipsis" style={{ maxWidth: 220 }}>
              {task.label}
              {task.id === runningTask?.id && elapsed > 2 ? ` · ${elapsed}s` : ""}
            </span>
            {task.cancellable ? (
              <button className="btn sm ghost" onClick={() => cancelTask(task.id)} title="Stop waiting for this task">
                Cancel
              </button>
            ) : null}
          </span>
        ))}

        {effects === "low" ? (
          <button className="btn sm ghost" onClick={() => setEffects("high")} title="Glass effects are off for speed">
            <Icon name="zap" size={11} /> Fast mode
          </button>
        ) : null}
        <span>v1.4.1</span>
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
