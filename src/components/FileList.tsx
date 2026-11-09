import { useMemo, useState, type ReactNode } from "react";
import { humanBytes, formatDate } from "../lib/organizer/engine";
import { KIND_CONFIG, type AppFile } from "../lib/organizer/types";
import { FileGlyph, KindDot } from "./ui";

export function FileList({
  files,
  selected,
  activeId,
  onToggle,
  onActivate,
  onToggleAll,
  counter,
}: {
  files: AppFile[];
  selected: Set<string>;
  activeId: string | null;
  onToggle: (id: string) => void;
  onActivate: (id: string) => void;
  onToggleAll: () => void;
  counter: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | keyof typeof KIND_CONFIG>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((file) => {
      if (kindFilter !== "all" && file.kind !== kindFilter) return false;
      if (!q) return true;
      return file.name.toLowerCase().includes(q) || file.ext.includes(q) || file.folder.toLowerCase().includes(q);
    });
  }, [files, query, kindFilter]);

  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of files) counts.set(file.kind, (counts.get(file.kind) ?? 0) + 1);
    return counts;
  }, [files]);

  const allVisibleSelected = visible.length > 0 && visible.every((f) => selected.has(f.id));

  return (
    <>
      <div className="list-tools">
        <div className="search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, ext or folder…"
            aria-label="Filter files"
          />
        </div>
        <button className="btn tiny" onClick={onToggleAll} title="Select every visible file">
          {allVisibleSelected ? "None" : "All"}
        </button>
      </div>

      <div className="list-tools" style={{ borderBottom: "1px solid var(--line-soft)", overflowX: "auto" }}>
        <button
          className="btn tiny ghost"
          onClick={() => setKindFilter("all")}
          aria-pressed={kindFilter === "all"}
          style={kindFilter === "all" ? { color: "var(--text)", background: "var(--panel-3)" } : undefined}
        >
          All
        </button>
        {[...kinds.entries()].map(([kind, count]) => (
          <button
            key={kind}
            className="btn tiny ghost"
            onClick={() => setKindFilter(kind as keyof typeof KIND_CONFIG)}
            style={kindFilter === kind ? { color: "var(--text)", background: "var(--panel-3)" } : undefined}
            title={`${count} ${KIND_CONFIG[kind as keyof typeof KIND_CONFIG].plural.toLowerCase()}`}
          >
            <KindDot kind={kind as keyof typeof KIND_CONFIG} />
            {KIND_CONFIG[kind as keyof typeof KIND_CONFIG].plural}
          </button>
        ))}
      </div>

      {counter}

      <div className="panel-body" role="listbox" aria-multiselectable="true">
        {visible.length === 0 ? (
          <div className="empty">Nothing matches that filter.</div>
        ) : (
          visible.map((file) => {
            const checked = selected.has(file.id);
            return (
              <button
                key={`${file.path}-${file.id}`}
                className="filerow"
                data-active={activeId === file.id}
                data-checked={checked}
                role="option"
                aria-selected={checked}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || e.shiftKey) onToggle(file.id);
                  else {
                    onActivate(file.id);
                    onToggle(file.id);
                  }
                }}
              >
                <span className="checkbox" aria-hidden="true">
                  ✓
                </span>
                <span className="filemain">
                  <span className="filename" title={file.path}>
                    {file.name}
                  </span>
                  <span className="filemeta">
                    <KindDot kind={file.kind} />
                    {humanBytes(file.size)}
                    <span aria-hidden="true">·</span>
                    {formatDate(file.modified)}
                    {file.folder !== "Inbox" ? (
                      <>
                        <span aria-hidden="true">·</span>
                        {file.folder}
                      </>
                    ) : null}
                  </span>
                </span>
                <FileGlyph kind={file.kind} />
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
