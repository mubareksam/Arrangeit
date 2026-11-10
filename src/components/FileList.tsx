import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { formatDate, humanBytes } from "../lib/organizer/engine";
import { KIND_CONFIG, type AppFile, type FileKind } from "../lib/organizer/types";
import { Icon, KIND_ICON } from "./Icon";
import { Empty, FileGlyph, Spinner, Toggle } from "./ui";

const ROW = 48;
const OVERSCAN = 6;

export function FileList({
  files,
  selected,
  activeId,
  root,
  busy,
  recursive,
  demo,
  onToggle,
  onActivate,
  onToggleAll,
  onPick,
  onRecursiveChange,
  autoPreview,
  onToggleAutoPreview,
  onFocusFile,
}: {
  files: AppFile[];
  selected: Set<string>;
  activeId: string | null;
  root: string;
  busy: boolean;
  recursive: boolean;
  demo: boolean;
  onToggle: (id: string) => void;
  onActivate: (id: string) => void;
  onToggleAll: () => void;
  onPick: () => void;
  onRecursiveChange: (value: boolean) => void;
  autoPreview: boolean;
  onToggleAutoPreview: (value: boolean) => void;
  onFocusFile: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<FileKind | "all">("all");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(720);
  const listRef = useRef<HTMLDivElement | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    setViewport(el.clientHeight);
    const observer = new ResizeObserver(() => setViewport(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return files.filter((file) => {
      if (kindFilter !== "all" && file.kind !== kindFilter) return false;
      if (!q) return true;
      return `${file.name} ${file.folder}`.toLowerCase().includes(q);
    });
  }, [files, deferredQuery, kindFilter]);

  const kindCounts = useMemo(() => {
    const counts = new Map<FileKind, number>();
    for (const file of files) counts.set(file.kind, (counts.get(file.kind) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [files]);

  const selectedBytes = useMemo(
    () => files.filter((f) => selected.has(f.id)).reduce((sum, f) => sum + f.size, 0),
    [files, selected],
  );

  const allVisibleSelected = visible.length > 0 && visible.every((f) => selected.has(f.id));

  // Bring the active row into view — used by arrow navigation and by clicking a
  // duplicate in the review pane.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !activeId) return;
    const index = visible.findIndex((file) => file.id === activeId);
    if (index < 0) return;
    const top = index * ROW;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW - el.clientHeight;
  }, [activeId, visible]);

  const step = (delta: number) => {
    if (visible.length === 0) return;
    const current = visible.findIndex((file) => file.id === activeId);
    const base = current < 0 ? (delta > 0 ? -1 : 0) : current;
    const next = visible[Math.min(visible.length - 1, Math.max(0, base + delta))];
    if (next) onFocusFile(next.id);
  };

  // Windowed rendering keeps 20 000-file folders at 60 fps.
  const start = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
  const end = Math.min(visible.length, Math.ceil((scrollTop + viewport) / ROW) + OVERSCAN);
  const windowed = visible.slice(start, end);

  return (
    <>
      <div className="files-head">
        <div className="search">
          <Icon name="search" size={13} />
          <input
            id="file-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files"
            aria-label="Search files"
          />
          {query ? (
            <button className="clear" onClick={() => setQuery("")} aria-label="Clear search">
              <Icon name="close" size={12} />
            </button>
          ) : null}
        </div>
        <button
          className="btn sm ghost"
          onClick={onToggleAll}
          disabled={files.length === 0}
          title={allVisibleSelected ? "Clear selection" : "Select all"}
        >
          {allVisibleSelected ? "Clear" : "All"}
        </button>
      </div>

      {kindCounts.length > 1 ? (
        <div className="filterbar" role="group" aria-label="Filter by type">
          <button className="chip" data-active={kindFilter === "all"} onClick={() => setKindFilter("all")}>
            All <span className="tnum">{files.length}</span>
          </button>
          {kindCounts.map(([kind, count]) => (
            <button key={kind} className="chip" data-active={kindFilter === kind} onClick={() => setKindFilter(kind)}>
              <Icon name={KIND_ICON[kind] ?? "file"} size={11} />
              {KIND_CONFIG[kind].plural}
              <span className="tnum">{count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div
        className="filelist"
        role="listbox"
        aria-multiselectable="true"
        aria-label="Files"
        tabIndex={0}
        ref={listRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={(e) => {
          // Stop the window handler from stepping a second time.
          if (e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            step(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            step(-1);
          } else if (e.key === "Home") {
            e.preventDefault();
            const first = visible[0];
            if (first) onFocusFile(first.id);
          } else if (e.key === "End") {
            e.preventDefault();
            const last = visible[visible.length - 1];
            if (last) onFocusFile(last.id);
          } else if (e.key === " " && activeId) {
            e.preventDefault();
            onToggle(activeId);
          }
        }}
      >
        {files.length === 0 ? (
          <Empty
            icon={busy ? "scan" : "folder"}
            title={root ? (busy ? "Scanning…" : "This folder is empty") : "No folder selected"}
            hint={
              root
                ? "Nothing to arrange here. Pick another folder, or turn on “Subfolders”."
                : "ArrangeIt reads the folder on your PC. Nothing is uploaded, ever."
            }
            action={
              root ? null : (
                <button className="btn primary sm" onClick={onPick} style={{ marginTop: 6 }}>
                  Choose folder
                </button>
              )
            }
          />
        ) : visible.length === 0 ? (
          <Empty icon="search" title="No matches" hint="Try a different search or clear the type filter." />
        ) : (
          <div className="virtual" style={{ height: visible.length * ROW }}>
            {windowed.map((file, index) => {
              const checked = selected.has(file.id);
              const top = (start + index) * ROW;
              return (
                <div key={file.id} style={{ position: "absolute", top, left: 0, right: 0, height: ROW }}>
                  <button
                    className="filerow"
                    data-active={activeId === file.id}
                    data-checked={checked}
                    role="option"
                    aria-selected={checked}
                    title={file.path}
                    style={{ height: "100%" }}
                    onClick={(e) => {
                      onActivate(file.id);
                      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
                      onToggle(file.id);
                    }}
                    onDoubleClick={() => onToggle(file.id)}
                  >
                    <span className="checkbox" aria-hidden="true">
                      <Icon name="check" size={9} strokeWidth={3} />
                    </span>
                    <FileGlyph kind={file.kind} />
                    <span className="filemain">
                      <span className="filename">{file.name}</span>
                      <span className="filemeta">
                        {humanBytes(file.size)}
                        <span aria-hidden="true">·</span>
                        {formatDate(file.modified)}
                        <span aria-hidden="true">·</span>
                        <span className="ellipsis">{file.folder}</span>
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="files-foot">
        {busy ? <Spinner /> : null}
        <span className="tnum">
          {selected.size > 0 ? `${selected.size} selected · ${humanBytes(selectedBytes)}` : `${files.length} files`}
        </span>
        <span className="spacer" />
        <button
          className="chip"
          data-active={autoPreview}
          aria-pressed={autoPreview}
          onClick={() => onToggleAutoPreview(!autoPreview)}
          title="Smart audition — preview the active file instantly; audio plays as you arrow through the list"
        >
          <Icon name={autoPreview ? "play" : "pause"} size={10} strokeWidth={2.4} />
          Audition
        </button>
        <Toggle checked={recursive} onChange={onRecursiveChange} label="Subfolders" />
      </div>
      {demo ? (
        <div className="files-foot" style={{ borderTop: 0, paddingTop: 0, color: "var(--warn)" }}>
          <Icon name="info" size={12} />
          <span>Demo data — install the desktop app for real folders</span>
        </div>
      ) : null}
    </>
  );
}
