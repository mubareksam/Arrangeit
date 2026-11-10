import { RENAME_TOKENS, buildPatternName } from "../../lib/organizer/engine";
import type { RenameOptions, RenameRow } from "../../lib/organizer/types";
import { Icon } from "../Icon";
import { Badge, Empty, Segmented, Spinner } from "../ui";

export function RenameTab({
  options,
  setOptions,
  rows,
  onApply,
  busy,
  onExport,
}: {
  options: RenameOptions;
  setOptions: (next: RenameOptions) => void;
  rows: RenameRow[];
  onApply: () => void;
  busy: boolean;
  onExport: () => void;
}) {
  const patch = (next: Partial<RenameOptions>) => setOptions({ ...options, ...next });
  const changed = rows.filter((r) => r.changed && !r.conflict && !r.error);
  const blocked = rows.filter((r) => r.conflict || r.error);
  const sample = rows[0];

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <Icon name="pencil" size={14} />
          Batch rename
        </span>
        <span className="panel-sub">· {rows.length} selected · names only, contents untouched</span>
        <span className="spacer" />
        {blocked.length > 0 ? <Badge tone="warn">{blocked.length} blocked</Badge> : <Badge tone="ok">{changed.length} ready</Badge>}
      </div>

      <div className="panel-body">
        <div className="pad stack">
          <div className="field">
            <span className="label">Pattern</span>
            <input
              className="input mono"
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

          <div className="row" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <span className="label">Find</span>
              <input
                className="input mono"
                value={options.find}
                onChange={(e) => patch({ find: e.target.value })}
                placeholder="IMG_"
                spellCheck={false}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <span className="label">Replace</span>
              <input
                className="input mono"
                value={options.replace}
                onChange={(e) => patch({ replace: e.target.value })}
                placeholder="holiday-"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="row wrap" style={{ justifyContent: "space-between", gap: 8 }}>
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
                className="input tnum"
                type="number"
                min={0}
                value={options.startIndex}
                onChange={(e) => patch({ startIndex: Math.max(0, Number(e.target.value) || 0) })}
                style={{ width: 62 }}
              />
              <span className="label">Digits</span>
              <input
                className="input tnum"
                type="number"
                min={1}
                max={8}
                value={options.seqPadding}
                onChange={(e) => patch({ seqPadding: Math.min(8, Math.max(1, Number(e.target.value) || 1)) })}
                style={{ width: 54 }}
              />
            </div>
          </div>

          {sample ? (
            <div className="hint mono" style={{ wordBreak: "break-all" }}>
              {sample.file.name} → <span style={{ color: "var(--ok)" }}>{buildPatternName(sample.file, options, options.startIndex)}</span>
            </div>
          ) : null}
        </div>

        <div className="divider" />

        {rows.length === 0 ? (
          <Empty title="No files selected" hint="Select files on the left; the plan updates as you type." />
        ) : (
          rows.map((row) => (
            <div
              className="renrow"
              key={row.file.id}
              data-changed={row.changed}
              data-conflict={row.conflict || Boolean(row.error)}
              title={row.conflict ? "Name already taken in this folder" : row.error}
            >
              <span className="ren-old">{row.file.name}</span>
              <span className="arrow">
                <Icon name="arrowRight" size={11} />
              </span>
              <span className="ren-new">
                {row.nextName}
                {row.conflict ? "  (taken)" : ""}
                {row.error ? `  (${row.error})` : ""}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="footbar">
        <button className="btn sm ghost" onClick={onExport} disabled={rows.length === 0}>
          <Icon name="download" size={12} /> CSV
        </button>
        <span className="hint tnum">
          {changed.length} of {rows.length} will change
        </span>
        <span className="spacer" />
        <button className="btn primary" disabled={busy || changed.length === 0} onClick={onApply}>
          {busy ? <Spinner /> : <Icon name="check" size={13} />}
          {busy ? "Renaming…" : `Rename ${changed.length}`}
        </button>
      </div>
    </div>
  );
}
