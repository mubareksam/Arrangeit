import { formatDate } from "../../lib/organizer/engine";
import type { LogEntry, LogKind, UndoRecord } from "../../lib/organizer/types";
import { Icon, type IconName } from "../Icon";
import { Badge, Empty } from "../ui";

const KIND_ICON: Record<LogKind, IconName> = {
  scan: "scan",
  arrange: "sort",
  duplicate: "duplicate",
  rename: "pencil",
  style: "folder",
  undo: "undo",
  error: "alert",
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
        <span className="panel-title">
          <Icon name="history" size={14} />
          History
        </span>
        <span className="panel-sub">· {entries.length} events · every move is reversible</span>
        <span className="spacer" />
        <button className="btn sm ghost" onClick={onClear} disabled={entries.length === 0}>
          <Icon name="trash" size={12} /> Clear
        </button>
      </div>

      <div className="panel-body">
        {undoStack.length > 0 ? (
          <div className="pad stack-sm">
            <div className="banner">
              <span className="insight-icon">
                <Icon name="undo" size={15} />
              </span>
              <div className="stack-sm" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{last.label}</div>
                <span className="hint">
                  {last.entries.length} change{last.entries.length === 1 ? "" : "s"} · {formatDate(new Date().toISOString(), true)}
                </span>
              </div>
              <span className="spacer" />
              <button className="btn primary sm" onClick={() => onUndo(last)} disabled={!last.ops?.length}>
                <Icon name="undo" size={12} /> Undo all
              </button>
            </div>

            {undoStack
              .slice()
              .reverse()
              .map((record) => (
                <div className="logrow" key={record.id}>
                  <span className="logkind">
                    <Icon name={KIND_ICON[record.kind]} size={12} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="logmsg">{record.label}</div>
                    <div className="hint mono ellipsis" title={record.entries.join("\n")}>
                      {record.entries.slice(0, 3).join(" · ")}
                      {record.entries.length > 3 ? ` +${record.entries.length - 3}` : ""}
                    </div>
                  </div>
                  <button className="btn sm ghost" onClick={() => onUndo(record)} disabled={!record.ops?.length}>
                    <Icon name="undo" size={11} /> Restore
                  </button>
                </div>
              ))}
          </div>
        ) : null}

        {entries.length === 0 ? (
          <Empty icon="history" title="No history yet" hint="Scans, moves, renames and style changes all appear here." />
        ) : (
          entries.map((entry) => (
            <div className="logrow" key={entry.id}>
              <span className="logkind">
                <Icon name={KIND_ICON[entry.kind]} size={12} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="logmsg">{entry.message}</div>
                {entry.detail ? <div className="hint">{entry.detail}</div> : null}
              </div>
              <span className="hint tnum">{formatDate(entry.at)}</span>
            </div>
          ))
        )}
      </div>

      <div className="footbar">
        <Badge tone="ok">
          <Icon name="lock" size={10} /> deletion goes to the Recycle Bin
        </Badge>
        <span className="spacer" />
        <span className="hint">Nothing leaves your PC — every byte stays local.</span>
      </div>
    </div>
  );
}
