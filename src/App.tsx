import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileList } from "./components/FileList";
import { PreviewPane } from "./components/PreviewPane";
import { TABS, TopBar, type TabId } from "./components/TopBar";
import { ArrangeTab } from "./components/tabs/ArrangeTab";
import { DuplicatesTab } from "./components/tabs/DuplicatesTab";
import { FoldersTab } from "./components/tabs/FoldersTab";
import { LogTab } from "./components/tabs/LogTab";
import { RenameTab } from "./components/tabs/RenameTab";
import { Badge, Spinner } from "./components/ui";
import {
  DEFAULT_DUPLICATE_OPTIONS,
  DEFAULT_RENAME_OPTIONS,
  applyRename,
  arrangePreview,
  findDuplicates,
  humanBytes,
  keeperSuggestion,
  summarizeArrange,
  uid,
} from "./lib/organizer/engine";
import { DEMO_FOLDER_STYLES, DEMO_LOG, DEMO_ROOT, MOCK_FILES, MOCK_FOLDERS } from "./lib/organizer/mockData";
import {
  applyFolderStyle,
  commitRename,
  deleteDuplicates,
  executeArrange,
  isTauri,
  pickFolder,
  revealInExplorer,
  revertFiles,
  scanFolder,
} from "./lib/organizer/bridge";
import type {
  AppFile,
  ArrangeRule,
  FolderStyle,
  LogEntry,
  LogKind,
  RenameOptions,
  StyleStep,
  UndoRecord,
} from "./lib/organizer/types";
import { DEFAULT_SIZE_RANGES } from "./lib/organizer/types";

const INITIAL_RULE: ArrangeRule = {
  mode: "type",
  dateGranularity: "month",
  sizeRanges: DEFAULT_SIZE_RANGES,
  similarityThreshold: 80,
  action: "move",
  dryRun: true,
};

type Toast = { id: string; message: string; kind: "ok" | "error" };

export default function App() {
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem("arrangeit.theme") ?? "dusk";
    } catch {
      return "dusk";
    }
  });
  const [tab, setTab] = useState<TabId>("arrange");
  const [files, setFiles] = useState<AppFile[]>(MOCK_FILES);
  const [root, setRoot] = useState(DEMO_ROOT);
  const [selection, setSelection] = useState<Set<string>>(() => new Set(MOCK_FILES.slice(0, 6).map((f) => f.id)));
  const [activeId, setActiveId] = useState<string | null>(MOCK_FILES[0]?.id ?? null);
  const [rule, setRule] = useState<ArrangeRule>(INITIAL_RULE);
  const [scope, setScope] = useState<"selected" | "all">("all");
  const [dupOptions, setDupOptions] = useState(DEFAULT_DUPLICATE_OPTIONS);
  const [scanned, setScanned] = useState(true);
  const [keepers, setKeepers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [renameOptions, setRenameOptions] = useState<RenameOptions>(DEFAULT_RENAME_OPTIONS);
  const [styles, setStyles] = useState<Record<string, FolderStyle>>(DEMO_FOLDER_STYLES);
  const [activeFolder, setActiveFolder] = useState<string>(MOCK_FOLDERS[0]?.name ?? "Inbox");
  const [steps, setSteps] = useState<StyleStep[] | null>(null);
  const [log, setLog] = useState<LogEntry[]>(DEMO_LOG);
  const [undoStack, setUndoStack] = useState<UndoRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);
  /** Local undo closures, keyed by undo-record id, applied after the disk revert. */
  const rollbacks = useRef(new Map<string, () => void>());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("arrangeit.theme", theme);
    } catch {
      /* private mode */
    }
  }, [theme]);

  const showToast = useCallback((message: string, kind: "ok" | "error" = "ok") => {
    setToast({ id: uid("toast"), message, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const pushLog = useCallback((kind: LogKind, message: string, detail?: string) => {
    setLog((prev) => [{ id: uid("log"), at: new Date().toISOString(), kind, message, detail }, ...prev].slice(0, 200));
  }, []);

  const pushUndo = useCallback((record: UndoRecord | null) => {
    if (!record) return;
    setUndoStack((prev) => [...prev, record].slice(-20));
  }, []);

  /* ---------------- derived plans ---------------- */

  const selectedFiles = useMemo(() => files.filter((f) => selection.has(f.id)), [files, selection]);
  const scopedFiles = scope === "selected" && selectedFiles.length > 0 ? selectedFiles : files;
  const items = useMemo(() => arrangePreview(scopedFiles, rule, root), [scopedFiles, rule, root]);
  const summary = useMemo(() => summarizeArrange(items), [items]);

  const duplicateGroups = useMemo(
    () => (scanned ? findDuplicates(files, dupOptions) : []),
    [files, dupOptions, scanned],
  );

  const renameRows = useMemo(() => applyRename(selectedFiles, renameOptions), [selectedFiles, renameOptions]);

  const activeFile = useMemo(() => files.find((f) => f.id === activeId) ?? null, [files, activeId]);
  const activeTarget = useMemo(() => items.find((i) => i.file.id === activeId)?.targetFolder, [items, activeId]);

  const folders = useMemo(
    () =>
      [...new Set(files.map((f) => f.folder))]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => {
          const bucket = files.filter((f) => f.folder === name);
          return { name, count: bucket.length, bytes: bucket.reduce((s, f) => s + f.size, 0) };
        }),
    [files],
  );

  const activeStyle = styles[activeFolder];

  /* ---------------- actions ---------------- */

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

  const runScan = useCallback(async () => {
    setBusy(true);
    try {
      const result = await scanFolder(root || DEMO_ROOT, true);
      setFiles(result.files);
      setRoot(result.root);
      setSelection(new Set());
      setPending(new Set());
      setScanned(true);
      setSteps(null);
      const bytes = result.files.reduce((sum, f) => sum + f.size, 0);
      pushLog("scan", `Scanned ${result.root.split("\\").pop() ?? result.root}`, `${result.files.length} files · ${humanBytes(bytes)} · ${result.elapsedMs} ms`);
      showToast(`Scanned ${result.files.length} files in ${result.elapsedMs} ms`);
    } catch (error) {
      pushLog("error", "Scan failed", String(error));
      showToast("Scan failed — check the folder permissions", "error");
    } finally {
      setBusy(false);
    }
  }, [pushLog, root, showToast]);

  const chooseFolder = useCallback(async () => {
    const picked = await pickFolder();
    if (!picked) {
      showToast(
        isTauri()
          ? "No folder chosen"
          : "Folder picker needs the desktop build — the demo folder stays loaded.",
      );
      return;
    }
    setRoot(picked);
    setBusy(true);
    try {
      const result = await scanFolder(picked, true);
      setFiles(result.files);
      setSelection(new Set());
      setScanned(true);
      const bytes = result.files.reduce((sum, f) => sum + f.size, 0);
      pushLog("scan", `Scanned ${picked}`, `${result.files.length} files · ${humanBytes(bytes)}`);
      showToast(`Loaded ${result.files.length} files from ${picked}`);
    } catch (error) {
      pushLog("error", "Scan failed", String(error));
      showToast("Could not read that folder", "error");
    } finally {
      setBusy(false);
    }
  }, [pushLog, showToast]);

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
          outcome.failures ? `${outcome.failures} skipped (name clash)` : undefined,
        );
        const moves = new Map(items.filter((i) => i.status === "ok").map((i) => [i.file.id, i]));
        setFiles((prev) =>
          prev.map((file) => {
            const plan = moves.get(file.id);
            if (!plan) return file;
            return {
              ...file,
              folder: plan.targetFolder,
              path: `${root}\\${plan.targetFolder}\\${file.name}`,
            };
          }),
        );
        showToast(`${outcome.action === "move" ? "Moved" : "Copied"} ${outcome.performed} files — undo is available`);
      }
    } catch (error) {
      pushLog("error", "Arrange failed", String(error));
      showToast("Arrange failed — see the activity log", "error");
    } finally {
      setBusy(false);
    }
  }, [files, items, rule.action, rule.dryRun, rule.mode, root, pushLog, pushUndo, showToast, summary.length]);

  const togglePending = useCallback((fileId: string) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

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
      const bytes = targets.reduce((sum, f) => sum + f.size, 0);
      const snapshot = files;
      const outcome = await deleteDuplicates(
        targets.map((f) => f.path),
        bytes,
      );
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
      showToast(`Recycled ${outcome.deleted} files · ${humanBytes(outcome.freed)} reclaimed`);
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
      showToast(`Renamed ${outcome.renamed} files — press Ctrl+Z to undo`);
    } catch (error) {
      pushLog("error", "Rename failed", String(error));
      showToast("Rename failed — a target name may already exist", "error");
    } finally {
      setBusy(false);
    }
  }, [pushLog, pushUndo, renameOptions.pattern, renameRows, showToast]);

  const updateStyle = useCallback(
    (folder: string, patch: Partial<FolderStyle>) => {
      setStyles((prev) => ({
        ...prev,
        [folder]: {
          ...(prev[folder] ?? { folder, glyph: "folder", color: "#f59e0b", tooltip: "", hideSystemFiles: true }),
          ...patch,
          folder,
        },
      }));
      setSteps(null);
    },
    [],
  );

  const handleApplyStyle = useCallback(async () => {
    if (!activeStyle) return;
    setBusy(true);
    try {
      const outcome = await applyFolderStyle(activeStyle, root === DEMO_ROOT ? "C:\\Users\\Sam\\Desktop\\" : `${root}\\`, false);
      setSteps(outcome.steps);
      pushUndo(outcome.undo);
      if (outcome.undo) rollbacks.current.set(outcome.undo.id, () => setSteps(null));
      pushLog("style", `Styled ${activeStyle.folder}`, outcome.steps.map((s) => s.command).join(" · "));
      showToast(`${activeStyle.folder} now uses a custom icon — Explorer may need a refresh`);
    } catch (error) {
      pushLog("error", "Folder style failed", String(error));
      showToast("Could not write desktop.ini", "error");
    } finally {
      setBusy(false);
    }
  }, [activeStyle, pushLog, pushUndo, root, showToast]);

  const handleUndo = useCallback(
    async (record?: UndoRecord) => {
      const target = record ?? undoStack[undoStack.length - 1];
      if (!target) return;
      setBusy(true);
      try {
        // Move everything back first, then restore the in-memory view.
        const ops = target.ops ?? [];
        const outcome = ops.length > 0 ? await revertFiles(ops) : { reverted: 0, failures: 0 };
        rollbacks.current.get(target.id)?.();
        rollbacks.current.delete(target.id);
        setUndoStack((prev) => prev.filter((r) => r.id !== target.id));
        pushLog(
          "undo",
          `Undid: ${target.label}`,
          outcome.reverted > 0
            ? `${outcome.reverted} path${outcome.reverted === 1 ? "" : "s"} restored`
            : "UI state restored — recycled files can be restored from the Recycle Bin",
        );
        showToast(
          outcome.reverted > 0 ? `Undone — ${target.label}` : `Restored — ${target.label} (Recycle Bin holds the files)`,
        );
      } catch (error) {
        pushLog("error", "Undo failed", String(error));
        showToast("Undo failed — some files may have moved", "error");
      } finally {
        setBusy(false);
      }
    },
    [pushLog, showToast, undoStack],
  );

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      if (e.key >= "1" && e.key <= "5") {
        setTab(TABS[Number(e.key) - 1].id);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      } else if (e.key === "Enter" && tab === "arrange") {
        void handleArrange();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleArrange, handleUndo, tab]);

  const counts: Record<TabId, number> = {
    arrange: 0,
    duplicates: duplicateGroups.length,
    rename: renameRows.filter((r) => r.changed).length,
    folders: Object.values(styles).filter((s) => s.tooltip).length,
    log: 0,
  };

  return (
    <div className="app">
      <TopBar
        tab={tab}
        setTab={setTab}
        counts={counts}
        root={root}
        onPick={chooseFolder}
        onScan={runScan}
        busy={busy}
        theme={theme}
        setTheme={setTheme}
        lastUndo={undoStack[undoStack.length - 1] ?? null}
        onUndo={() => void handleUndo()}
      />

      <div className="workspace">
        <section className="panel" aria-label="Files">
          <div className="panel-head">
            <span className="panel-title">Files</span>
            <span className="spacer" />
            <Badge tone="accent">
              {selection.size}/{files.length}
            </Badge>
            {busy ? <Spinner /> : null}
          </div>
          <FileList
            files={files}
            selected={selection}
            activeId={activeId}
            onToggle={toggle}
            onActivate={setActiveId}
            onToggleAll={toggleAll}
            counter={
              <div className="row" style={{ padding: "6px 10px", borderBottom: "1px solid var(--line-soft)" }}>
                <span className="hint tnum">
                  {selectedFiles.length > 0 ? humanBytes(selectedFiles.reduce((s, f) => s + f.size, 0)) : "0 B"} selected
                </span>
                <span className="spacer" />
                <span className="hint">Ctrl/⌘ click to multi-select</span>
              </div>
            }
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
            onApply={handleArrange}
            busy={busy}
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
            onDelete={handleDeleteDuplicates}
            onScan={() => {
              setScanned(true);
              pushLog("duplicate", `Duplicate scan complete`, `${duplicateGroups.length} groups · ${humanBytes(duplicateGroups.reduce((s, g) => s + g.reclaimable, 0))} reclaimable`);
              showToast(`${duplicateGroups.length} duplicate groups found`);
            }}
            busy={busy}
            scanned={scanned}
          />
        ) : null}

        {tab === "rename" ? (
          <RenameTab
            options={renameOptions}
            setOptions={setRenameOptions}
            rows={renameRows}
            onApply={handleRename}
            busy={busy}
          />
        ) : null}

        {tab === "folders" ? (
          <FoldersTab
            folders={folders}
            styles={styles}
            active={activeFolder}
            setActive={(folder) => {
              setActiveFolder(folder);
              setSteps(null);
            }}
            update={updateStyle}
            onApply={handleApplyStyle}
            steps={steps}
            busy={busy}
            root={`${root}\\"`}
          />
        ) : null}

        {tab === "log" ? <LogTab entries={log} undoStack={undoStack} onUndo={(record) => void handleUndo(record)} theme={theme} setTheme={setTheme} /> : null}

        <PreviewPane file={activeFile} targetFolder={activeTarget} onReveal={(path) => void revealInExplorer(path)} />
      </div>

      {toast ? (
        <div className="toast" data-kind={toast.kind} role="status">
          <span className="dot" aria-hidden="true" />
          <span>{toast.message}</span>
          <button className="btn ghost tiny" onClick={() => setToast(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
