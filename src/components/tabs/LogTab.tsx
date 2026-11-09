import type { LogEntry, LogKind, UndoRecord } from "../../lib/organizer/types";
import { formatDate } from "../../lib/organizer/engine";
import { Badge, Empty, SectionTitle } from "../ui";

export const THEMES: { id: string; label: string; chip: string }[] = [
  { id: "dusk", label: "Dusk", chip: "linear-gradient(140deg,#5b9dff,#8b7bff)" },
  { id: "midnight", label: "Midnight", chip: "linear-gradient(140deg,#2dd4bf,#22c55e)" },
  { id: "amber", label: "Amber", chip: "linear-gradient(140deg,#f0a03c,#e2683c)" },
  { id: "paper", label: "Paper", chip: "linear-gradient(140deg,#ffffff,#dbe4f0)" },
];

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
  theme,
  setTheme,
}: {
  entries: LogEntry[];
  undoStack: UndoRecord[];
  onUndo: (record: UndoRecord) => void;
  theme: string;
  setTheme: (theme: string) => void;
}) {
  const last = undoStack[undoStack.length - 1];

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Activity</span>
        <span className="spacer" />
        <Badge>{entries.length} events</Badge>
      </div>

      <div className="pad stack" style={{ paddingBottom: 10 }}>
        <SectionTitle
          right={
            <button className="btn tiny" onClick={() => last && onUndo(last)} disabled={!last}>
              ↺ Undo last
            </button>
          }
        >
          Undo stack
        </SectionTitle>
        {last ? (
          <div className="step" style={{ borderBottom: 0 }}>
            <span className="ok">↺</span>
            <span>
              <span style={{ fontSize: 12.5 }}>{last.label}</span>
              <span className="hint" style={{ display: "block" }}>
                {last.entries.length} reversible step{last.entries.length === 1 ? "" : "s"} · {formatDate(new Date().toISOString(), true)}
              </span>
            </span>
          </div>
        ) : (
          <span className="hint">Nothing to undo yet — arrange, rename and style actions land here.</span>
        )}
        {undoStack.length > 1 ? (
          <span className="hint">+ {undoStack.length - 1} older action{undoStack.length - 1 === 1 ? "" : "s"} still undoable</span>
        ) : null}

        <div className="divider" />
        <SectionTitle>Theme</SectionTitle>
        <div className="themes">
          {THEMES.map((item) => (
            <button
              key={item.id}
              className="themebtn"
              data-active={theme === item.id}
              onClick={() => setTheme(item.id)}
            >
              <span className="chip" style={{ background: item.chip }} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-body">
        {entries.length === 0 ? (
          <Empty title="No activity yet" hint="Scans, moves, renames and folder styles are all logged here." />
        ) : (
          entries.map((entry) => (
            <div className="logrow" key={entry.id}>
              <span className="logkind" aria-hidden="true">
                {KIND_GLYPH[entry.kind]}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5 }}>{entry.message}</span>
                {entry.detail ? <span className="hint">{entry.detail}</span> : null}
              </span>
              <span className="hint tnum">{formatDate(entry.at, true).split(" ").slice(-1)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
