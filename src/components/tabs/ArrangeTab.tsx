import { humanBytes } from "../../lib/organizer/engine";
import {
  DEFAULT_SIZE_RANGES,
  type ArrangeItem,
  type ArrangeMode,
  type ArrangeRule,
  type ArrangeSummaryRow,
} from "../../lib/organizer/types";
import { Badge, KindDot, Segmented, Toggle } from "../ui";

const MODES: { id: ArrangeMode; label: string; glyph: string; hint: string }[] = [
  { id: "date", label: "Date", glyph: "🗓", hint: "Year, month or day buckets" },
  { id: "type", label: "Type", glyph: "▤", hint: "Images, Audio, Documents…" },
  { id: "size", label: "Size", glyph: "⇕", hint: "Tiny → Huge ranges" },
  { id: "similarity", label: "Similar", glyph: "≋", hint: "Cluster look-alike names" },
  { id: "name", label: "Name", glyph: "A", hint: "Alphabetical folders" },
  { id: "ext", label: "Extension", glyph: ".", hint: "One folder per extension" },
];

export interface ArrangePreset {
  id: string;
  label: string;
  patch: Partial<ArrangeRule>;
}

export function ArrangeTab({
  rule,
  setRule,
  items,
  summary,
  scope,
  setScope,
  onApply,
  onExport,
  busy,
  presets,
  onPreset,
}: {
  rule: ArrangeRule;
  setRule: (next: ArrangeRule) => void;
  items: ArrangeItem[];
  summary: ArrangeSummaryRow[];
  scope: "selected" | "all";
  setScope: (scope: "selected" | "all") => void;
  onApply: () => void;
  onExport: () => void;
  busy: boolean;
  presets: ArrangePreset[];
  onPreset: (preset: ArrangePreset) => void;
}) {
  const patch = (next: Partial<ArrangeRule>) => setRule({ ...rule, ...next });
  const collisions = items.filter((i) => i.status === "collision").length;
  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0);
  const activeMode = MODES.find((m) => m.id === rule.mode)!;

  const toggleRange = (id: string) => {
    const has = rule.sizeRanges.some((r) => r.id === id);
    const next = has
      ? rule.sizeRanges.filter((r) => r.id !== id)
      : [...rule.sizeRanges, DEFAULT_SIZE_RANGES.find((r) => r.id === id)!];
    patch({ sizeRanges: next.length ? next : DEFAULT_SIZE_RANGES });
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Arrange</span>
        <span className="panel-sub">· {activeMode.hint}</span>
        <span className="spacer" />
        <Segmented
          ariaLabel="Scope"
          value={scope}
          onChange={setScope}
          options={[
            { id: "selected", label: "Selected" },
            { id: "all", label: "All" },
          ]}
        />
      </div>

      <div className="panel-body">
        <div className="pad stack">
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <div className="modes" role="group" aria-label="Arrange by">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  className="mode"
                  aria-pressed={rule.mode === mode.id}
                  onClick={() => patch({ mode: mode.id })}
                  title={mode.hint}
                >
                  <span className="glyph">{mode.glyph}</span>
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="row wrap" style={{ gap: 6 }}>
            <span className="label" style={{ marginRight: 2 }}>
              Presets
            </span>
            {presets.map((preset) => (
              <button key={preset.id} className="chip" onClick={() => onPreset(preset)}>
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings">
          {rule.mode === "date" ? (
            <>
              <span className="label">Group by</span>
              <Segmented
                ariaLabel="Date granularity"
                value={rule.dateGranularity}
                onChange={(dateGranularity) => patch({ dateGranularity })}
                options={[
                  { id: "year", label: "Year" },
                  { id: "month", label: "Month" },
                  { id: "day", label: "Day" },
                ]}
              />
            </>
          ) : null}

          {rule.mode === "size" ? (
            <>
              <span className="label">Ranges</span>
              {DEFAULT_SIZE_RANGES.map((range) => {
                const on = rule.sizeRanges.some((r) => r.id === range.id);
                return (
                  <button key={range.id} className="chip" data-active={on} onClick={() => toggleRange(range.id)}>
                    {range.label.split("(")[0].trim()}
                    <span className="hint">{range.label.slice(range.label.indexOf("("))}</span>
                  </button>
                );
              })}
            </>
          ) : null}

          {rule.mode === "similarity" ? (
            <>
              <span className="label">Threshold</span>
              <input
                type="range"
                min={50}
                max={100}
                value={rule.similarityThreshold}
                onChange={(e) => patch({ similarityThreshold: Number(e.target.value) })}
                aria-label="Similarity threshold"
                style={{ width: 130, accentColor: "var(--accent)" }}
              />
              <Badge>{rule.similarityThreshold}%</Badge>
            </>
          ) : null}

          <span className="spacer" />

          <span className="label">Action</span>
          <Segmented
            ariaLabel="Action"
            value={rule.action}
            onChange={(action) => patch({ action })}
            options={[
              { id: "move", label: "Move" },
              { id: "copy", label: "Copy" },
            ]}
          />
          <Toggle checked={rule.dryRun} onChange={(dryRun) => patch({ dryRun })} label="Dry run" hint="Preview only — nothing is written" />
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Target folder</th>
              <th className="num">Files</th>
              <th className="num">Size</th>
            </tr>
          </thead>
          <tbody>
            {summary.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ color: "var(--faint)", padding: "18px 12px", textAlign: "center" }}>
                  {items.length === 0 ? "Nothing selected for this plan." : "Pick a rule to build a plan."}
                </td>
              </tr>
            ) : (
              summary.map((row) => (
                <tr key={row.folder}>
                  <td>
                    <span className="target">
                      <span className="folder-ico" aria-hidden="true">
                        ▸
                      </span>
                      <span className="ellipsis" title={row.folder}>
                        {row.folder}
                      </span>
                      {row.kinds.map((kind) => (
                        <KindDot key={kind} kind={kind} />
                      ))}
                      {row.status === "collision" ? <Badge tone="warn">clash</Badge> : null}
                    </span>
                  </td>
                  <td className="num">{row.count}</td>
                  <td className="num">{humanBytes(row.bytes)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {items.length > 0 ? (
          <>
            <div className="divider" />
            <div className="plan-sample">
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <span className="label">Sample moves</span>
                <button className="btn sm ghost" onClick={onExport}>
                  Export CSV
                </button>
              </div>
              {items.slice(0, 6).map((item) => (
                <div className="sample-row" key={item.file.id}>
                  <KindDot kind={item.file.kind} />
                  <span className="mono ellipsis" style={{ flex: "1 1 auto", minWidth: 0 }}>
                    {item.file.name}
                  </span>
                  <span className="arrow">→</span>
                  <span className="mono ellipsis" style={{ maxWidth: "44%", color: "var(--accent)" }}>
                    {item.targetFolder}
                  </span>
                </div>
              ))}
              {items.length > 6 ? <div className="hint">+{items.length - 6} more</div> : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="footbar">
        {collisions > 0 ? <Badge tone="warn">{collisions} name clash</Badge> : <Badge tone="ok">plan ready</Badge>}
        <span className="hint tnum">
          {items.length} file{items.length === 1 ? "" : "s"} · {summary.length} folder
          {summary.length === 1 ? "" : "s"} · {humanBytes(totalBytes)}
        </span>
        <span className="spacer" />
        <button className="btn primary" disabled={busy || items.length === 0} onClick={onApply}>
          {busy ? "Working…" : rule.dryRun ? "Run dry run" : `${rule.action === "move" ? "Move" : "Copy"} ${items.length} files`}
        </button>
      </div>
    </div>
  );
}
