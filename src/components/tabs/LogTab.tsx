import { formatDate } from "../../lib/organizer/engine";
import type { LogEntry, LogKind, UndoRecord } from "../../lib/organizer/types";
import { Badge, Empty } from "../ui";

const KIND_GLYPH: Record<LogKind, string> = {
  scan: "⌕",
  arrange: "⇄",
  duplicate: "⧉",
  rename: "✎",
  style: "◧",
  undo: "↺",
  error: "!",
};

export function LogTab({
  entries,
  undoStack,
  onUndo,
  onClear,
}: {
  entries: LogEntry[];
  undoStack: UndoRecord[];
  onUndo: (record: UndoRecord) => void;
  onClear: () => void;
}) {
  const last = undoStack[undoStack.length - 1];

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Activity</span>
        <span className="panel-sub">· {entries.length} events</span>
        <span className="spacer" />
        <button className="btn sm ghost" onClick={onClear} disabled={entries.length === 0}>
          Clear
        </button>
      </div>

      <div className="pad stack" style={{ paddingBottom: 8 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="label">Last action</span>
          <button className="btn sm" onClick={() => last && onUndo(last)} disabled={!last}>
            ↺ Undo
          </button>
        </div>
        {last ? (
          <div className="step" style={{ borderBottom: 0 }}>
            <span className="ok">↺</span>
            <span>
              <code style={{ color: "var(--text)" }}>{last.label}</code>
              <span className="hint" style={{ display: "block" }}>
                {last.entries.length} reversible step{last.entries.length === 1 ? "" : "s"}
                {undoStack.length > 1 ? ` · ${undoStack.length - 1} older action${undoStack.length - 1 === 1 ? "" : "s"} queued` : ""}
              </span>
            </span>
          </div>
        ) : (
          <span className="hint">Arrange, rename and style runs land here so you can undo them.</span>
        )}
      </div>

      <div className="divider" />

      <div className="panel-body">
        {entries.length === 0 ? (
          <Empty title="No activity yet" hint="Scans, moves, renames and folder styles are logged here." />
        ) : (
          entries.map((entry) => (
            <div className="logrow" key={entry.id}>
              <span className="logkind" aria-hidden="true">
                {KIND_GLYPH[entry.kind]}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="logmsg">{entry.message}</span>
                {entry.detail ? <span className="hint" style={{ display: "block" }}>{entry.detail}</span> : null}
              </span>
              <span className="hint tnum">{formatDate(entry.at, true).split(" ").slice(-1)}</span>
            </div>
          ))
        )}
      </div>

      <div className="footbar">
        <Badge tone={undoStack.length ? "accent" : "neutral"}>{undoStack.length} undoable</Badge>
        <span className="hint">Ctrl+Z works anywhere in the app</span>
      </div>
    </div>
  );
}
