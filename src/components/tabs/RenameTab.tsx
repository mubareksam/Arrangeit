import { RENAME_TOKENS, buildPatternName } from "../../lib/organizer/engine";
import type { RenameOptions, RenameRow } from "../../lib/organizer/types";
import { Badge, Empty, Segmented } from "../ui";

export function RenameTab({
  options,
  setOptions,
  rows,
  onApply,
  busy,
}: {
  options: RenameOptions;
  setOptions: (next: RenameOptions) => void;
  rows: RenameRow[];
  onApply: () => void;
  busy: boolean;
}) {
  const patch = (next: Partial<RenameOptions>) => setOptions({ ...options, ...next });
  const changed = rows.filter((r) => r.changed && !r.conflict && !r.error);
  const conflicts = rows.filter((r) => r.conflict || r.error);
  const sample = rows[0];

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Batch rename</span>
        <span className="spacer" />
        <Badge tone={conflicts.length ? "warn" : "ok"}>
          {changed.length} rename{changed.length === 1 ? "" : "s"}
          {conflicts.length ? ` · ${conflicts.length} blocked` : ""}
        </Badge>
      </div>

      <div className="pad stack" style={{ paddingBottom: 8 }}>
        <div className="field">
          <span className="label">Pattern</span>
          <input
            className="input"
            value={options.pattern}
            onChange={(e) => patch({ pattern: e.target.value })}
            placeholder="{name}-{counter}"
            spellCheck={false}
          />
          <div className="tokenbar">
            {RENAME_TOKENS.map((token) => (
              <button
                key={token.token}
                className="token"
                title={token.label}
                onClick={() => patch({ pattern: `${options.pattern}${token.token}` })}
              >
                {token.token}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <span className="label">Find</span>
            <input
              className="input"
              value={options.find}
              onChange={(e) => patch({ find: e.target.value })}
              placeholder="IMG_"
              spellCheck={false}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <span className="label">Replace</span>
            <input
              className="input"
              value={options.replace}
              onChange={(e) => patch({ replace: e.target.value })}
              placeholder="holiday-"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="row wrap" style={{ justifyContent: "space-between", gap: 10 }}>
          <div className="row">
            <span className="label">Case</span>
            <Segmented
              ariaLabel="Case"
              value={options.caseMode}
              onChange={(caseMode) => patch({ caseMode })}
              options={[
                { id: "keep", label: "Keep" },
                { id: "lower", label: "lower" },
                { id: "upper", label: "UPPER" },
                { id: "title", label: "Title" },
              ]}
            />
          </div>
          <div className="row">
            <span className="label">Start</span>
            <input
              className="input"
              type="number"
              min={0}
              value={options.startIndex}
              onChange={(e) => patch({ startIndex: Math.max(0, Number(e.target.value) || 0) })}
              style={{ width: 68 }}
            />
            <span className="label">Digits</span>
            <input
              className="input"
              type="number"
              min={1}
              max={8}
              value={options.seqPadding}
              onChange={(e) => patch({ seqPadding: Math.min(8, Math.max(1, Number(e.target.value) || 1)) })}
              style={{ width: 58 }}
            />
          </div>
        </div>

        {sample ? (
          <div className="hint">
            Example: <span className="mono" style={{ color: "var(--text-2)" }}>{sample.file.name}</span> →{" "}
            <span className="mono" style={{ color: "var(--ok)" }}>
              {buildPatternName(sample.file, options, options.startIndex)}
            </span>
          </div>
        ) : (
          <div className="hint">Select files in the left panel to preview the rename.</div>
        )}

        <div className="divider" />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="label">Preview</span>
          <span className="hint">Unchanged rows are dimmed · clashes are blocked</span>
        </div>
      </div>

      <div className="panel-body">
        {rows.length === 0 ? (
          <Empty title="No files selected" hint="Pick a few files on the left — the rename plan updates as you type." />
        ) : (
          rows.map((row) => (
            <div
              className="renrow"
              key={row.file.id}
              data-changed={row.changed}
              data-conflict={row.conflict || Boolean(row.error)}
              title={row.error ?? undefined}
            >
              <span className="ren-old" title={row.file.name}>
                {row.file.name}
              </span>
              <span className="arrow">→</span>
              <span className="ren-new" title={row.nextName}>
                {row.nextName}
                {row.conflict ? "  (taken)" : ""}
                {row.error ? `  (${row.error})` : ""}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="footbar">
        <span className="hint">
          {rows.length} selected · {changed.length} will change
        </span>
        <span className="spacer" />
        <button className="btn primary" disabled={busy || changed.length === 0} onClick={onApply}>
          {busy ? "Renaming…" : `Rename ${changed.length} file${changed.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
