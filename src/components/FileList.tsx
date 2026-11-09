import { useMemo, useState } from "react";
import { formatDate, humanBytes } from "../lib/organizer/engine";
import { KIND_CONFIG, type AppFile, type FileKind } from "../lib/organizer/types";
import { Empty, FileGlyph, Spinner, Toggle } from "./ui";

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
}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<FileKind | "all">("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((file) => {
      if (kindFilter !== "all" && file.kind !== kindFilter) return false;
      if (!q) return true;
      return `${file.name} ${file.folder}`.toLowerCase().includes(q);
    });
  }, [files, query, kindFilter]);

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

  return (
    <>
      <div className="files-head">
        <div className="search">
          <span aria-hidden="true">⌕</span>
          <input
            id="file-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files"
            aria-label="Search files"
          />
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
            <button
              key={kind}
              className="chip"
              data-active={kindFilter === kind}
              onClick={() => setKindFilter(kind)}
            >
              <span className="kinddot" style={{ background: KIND_CONFIG[kind].color }} />
              {KIND_CONFIG[kind].plural}
              <span className="tnum">{count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="filelist" role="listbox" aria-multiselectable="true">
        {files.length === 0 ? (
          <Empty
            title={root ? (busy ? "Scanning…" : "This folder is empty") : "No folder selected"}
            hint={
              root
                ? "Nothing to arrange here. Pick another folder, or turn on “Include subfolders”."
                : "Choose a folder and ArrangeIt reads it locally — nothing is uploaded."
            }
            action={
              root ? null : (
                <button className="btn primary sm" onClick={onPick}>
                  Choose folder
                </button>
              )
            }
          />
        ) : visible.length === 0 ? (
          <Empty title="No matches" hint="Try a different search or clear the type filter." />
        ) : (
          visible.map((file) => {
            const checked = selected.has(file.id);
            return (
              <button
                key={file.id}
                className="filerow"
                data-active={activeId === file.id}
                data-checked={checked}
                role="option"
                aria-selected={checked}
                title={file.path}
                onClick={(e) => {
                  onActivate(file.id);
                  if (e.ctrlKey || e.metaKey || e.shiftKey) return;
                  onToggle(file.id);
                }}
                onDoubleClick={() => onToggle(file.id)}
              >
                <span className="checkbox" aria-hidden="true">
                  ✓
                </span>
                <FileGlyph kind={file.kind} />
                <span className="filemain">
                  <span className="filename">{file.name}</span>
                  <span className="filemeta">
                    <span className="kinddot" style={{ background: KIND_CONFIG[file.kind].color }} />
                    {humanBytes(file.size)}
                    <span aria-hidden="true">·</span>
                    {formatDate(file.modified)}
                    <span aria-hidden="true">·</span>
                    <span className="ellipsis">{file.folder}</span>
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="files-foot">
        {busy ? <Spinner /> : null}
        <span className="tnum">
          {selected.size > 0 ? `${selected.size} selected · ${humanBytes(selectedBytes)}` : `${files.length} files`}
        </span>
        <span className="spacer" />
        <Toggle checked={recursive} onChange={onRecursiveChange} label="Subfolders" />
      </div>
      {demo ? (
        <div className="files-foot" style={{ borderTop: 0, paddingTop: 0 }}>
          <span className="hint">Demo data — install the desktop app to browse real folders.</span>
        </div>
      ) : null}
    </>
  );
}
