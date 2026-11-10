import { RENAME_TOKENS } from "../../lib/organizer/engine";
import type { FolderRenameRow, RenameOptions, RenameRow } from "../../lib/organizer/types";
import { Icon } from "../Icon";
import { Badge, Empty, Segmented, Spinner } from "../ui";

export type RenameMode = "files" | "folders";

export function RenameTab({
  mode,
  setMode,
  options,
  setOptions,
  rows,
  folderRows,
  onApply,
  busy,
  onExport,
}: {
  mode: RenameMode;
  setMode: (mode: RenameMode) => void;
  options: RenameOptions;
  setOptions: (next: RenameOptions) => void;
  rows: RenameRow[];
  folderRows: FolderRenameRow[];
  onApply: () => void;
  busy: boolean;
  onExport: () => void;
}) {
  const patch = (next: Partial<RenameOptions>) => setOptions({ ...options, ...next });
  const folders = mode === "folders";

  // One table shape for both modes; folders simply have no extension.
  const plan: { key: string; old: string; next: string; changed: boolean; blocked: string | null }[] = folders
    ? folderRows.map((row) => ({
        key: row.path,
        old: row.name,
        next: row.nextName,
        changed: row.changed,
        blocked: row.conflict ? "taken" : (row.error ?? null),
      }))
    : rows.map((row) => ({
        key: row.file.id,
        old: row.file.name,
        next: row.nextName,
        changed: row.changed,
        blocked: row.conflict ? "taken" : (row.error ?? null),
      }));

  const ready = plan.filter((row) => row.changed && !row.blocked);
  const blocked = plan.filter((row) => row.blocked);
  const sample = mode === "folders" ? folderRows.find((row) => row.changed) : rows[0];

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <Icon name="pencil" size={14} />
          Batch rename
        </span>
        <span className="panel-sub">
          · {plan.length} {folders ? "folder" : "selected"} · names only, contents untouched
        </span>
        <span className="spacer" />
        <Segmented
          ariaLabel="What to rename"
          value={mode}
          onChange={setMode}
          options={[
            { id: "files", label: "Files" },
            { id: "folders", label: "Folders" },
          ]}
        />
        {blocked.length > 0 ? <Badge tone="warn">{blocked.length} blocked</Badge> : <Badge tone="ok">{ready.length} ready</Badge>}
      </div>

      <div className="panel-body">
        <div className="pad stack">
          <div className="field">
            <span className="label">Pattern</span>
            <input
              className="input mono"
              value={options.pattern}
              onChange={(e) => patch({ pattern: e.target.value })}
              placeholder={folders ? "{name} — {counter}" : "{name}-{counter}"}
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
            {folders ? (
              <span className="hint">
                Folder tokens work the same way — <code>{"{name}"}</code>, <code>{"{counter}"}</code> and case changes apply to the
                folder name. Extensions are left alone (folders have none).
              </span>
            ) : null}
          </div>

          <div className="row" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <span className="label">Find</span>
              <input
                className="input mono"
                value={options.find}
                onChange={(e) => patch({ find: e.target.value })}
                placeholder={folders ? "New folder" : "IMG_"}
                spellCheck={false}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <span className="label">Replace</span>
              <input
                className="input mono"
                value={options.replace}
                onChange={(e) => patch({ replace: e.target.value })}
                placeholder={folders ? "Client" : "holiday-"}
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
              {mode === "folders" ? (sample as FolderRenameRow).name : (sample as RenameRow).file.name} →{" "}
              <span style={{ color: "var(--ok)" }}>{sample.nextName}</span>
            </div>
          ) : null}
        </div>

        <div className="divider" />

        {plan.length === 0 ? (
          <Empty
            icon={folders ? "folder" : "file"}
            title={folders ? "No folders found" : "No files selected"}
            hint={folders ? "Scan a folder — every subfolder appears here, ready for a pattern." : "Select files on the left; the plan updates as you type."}
          />
        ) : (
          plan.map((row) => (
            <div
              className="renrow"
              key={row.key}
              data-changed={row.changed}
              data-conflict={Boolean(row.blocked)}
              title={row.blocked ?? undefined}
            >
              <span className="ren-old">{row.old}</span>
              <span className="arrow">
                <Icon name="arrowRight" size={11} />
              </span>
              <span className="ren-new">
                {row.next}
                {row.blocked ? `  (${row.blocked})` : ""}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="footbar">
        <button className="btn sm ghost" onClick={onExport} disabled={plan.length === 0}>
          <Icon name="download" size={12} /> CSV
        </button>
        <span className="hint tnum">
          {ready.length} of {plan.length} {folders ? "folders" : "files"} will change
        </span>
        <span className="spacer" />
        <button className="btn primary" disabled={busy || ready.length === 0} onClick={onApply}>
          {busy ? <Spinner /> : <Icon name="check" size={13} />}
          {busy ? "Renaming…" : `Rename ${ready.length} ${folders ? "folders" : "files"}`}
        </button>
      </div>
    </div>
  );
}
