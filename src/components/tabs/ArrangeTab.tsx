import { DEFAULT_SIZE_RANGES, KIND_CONFIG, type ArrangeItem, type ArrangeMode, type ArrangeRule, type ArrangeSummaryRow } from "../../lib/organizer/types";
import { humanBytes } from "../../lib/organizer/engine";
import { Badge, KindDot, Segmented, Stat, Toggle } from "../ui";

const MODES: { id: ArrangeMode; title: string; glyph: string; desc: string }[] = [
  { id: "date", title: "By date", glyph: "🗓", desc: "Year / month / day buckets" },
  { id: "type", title: "By type", glyph: "▤", desc: "Images, Audio, Documents…" },
  { id: "size", title: "By size", glyph: "⇕", desc: "Tiny → Huge ranges" },
  { id: "similarity", title: "Similar", glyph: "≋", desc: "Cluster look-alike names" },
  { id: "name", title: "By name", glyph: "A–Z", desc: "Alphabetical folders" },
  { id: "ext", title: "By extension", glyph: ".ext", desc: "One folder per extension" },
];

export function ArrangeTab({
  rule,
  setRule,
  items,
  summary,
  scope,
  setScope,
  onApply,
  busy,
}: {
  rule: ArrangeRule;
  setRule: (next: ArrangeRule) => void;
  items: ArrangeItem[];
  summary: ArrangeSummaryRow[];
  scope: "selected" | "all";
  setScope: (scope: "selected" | "all") => void;
  onApply: () => void;
  busy: boolean;
}) {
  const collisions = items.filter((i) => i.status === "collision").length;
  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0);
  const patch = (next: Partial<ArrangeRule>) => setRule({ ...rule, ...next });

  const toggleRange = (id: string) => {
    const has = rule.sizeRanges.some((r) => r.id === id);
    const next = has ? rule.sizeRanges.filter((r) => r.id !== id) : [...rule.sizeRanges, DEFAULT_SIZE_RANGES.find((r) => r.id === id)!];
    patch({ sizeRanges: next.length ? next : DEFAULT_SIZE_RANGES });
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Auto-arrange</span>
        <span className="spacer" />
        <Segmented
          ariaLabel="Scope"
          value={scope}
          onChange={setScope}
          options={[
            { id: "selected", label: "Selected" },
            { id: "all", label: "All files" },
          ]}
        />
        <span className="kbd">dry-run on by default</span>
      </div>

      <div className="panel-body">
        <div className="pad stack">
          <div className="cards">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                className="modecard"
                aria-pressed={rule.mode === mode.id}
                onClick={() => patch({ mode: mode.id })}
              >
                <span className="mtitle">
                  <span className="mono" style={{ color: "var(--accent)", minWidth: 18 }}>
                    {mode.glyph}
                  </span>
                  {mode.title}
                </span>
                <span className="mdesc">{mode.desc}</span>
              </button>
            ))}
          </div>

          {rule.mode === "date" ? (
            <div className="row wrap">
              <span className="label">Granularity</span>
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
            </div>
          ) : null}

          {rule.mode === "size" ? (
            <div className="stack">
              <span className="label">Size ranges</span>
              <div className="row wrap">
                {DEFAULT_SIZE_RANGES.map((range) => {
                  const on = rule.sizeRanges.some((r) => r.id === range.id);
                  return (
                    <button
                      key={range.id}
                      className="btn tiny"
                      aria-pressed={on}
                      style={on ? { borderColor: "var(--accent)", color: "var(--text)" } : { opacity: 0.6 }}
                      onClick={() => toggleRange(range.id)}
                    >
                      {on ? "✓ " : ""}
                      {range.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {rule.mode === "similarity" ? (
            <div className="field">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="label">Similarity threshold</span>
                <span className="badge accent tnum">{rule.similarityThreshold}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={100}
                step={1}
                value={rule.similarityThreshold}
                onChange={(e) => patch({ similarityThreshold: Number(e.target.value) })}
                aria-label="Similarity threshold"
                style={{ accentColor: "var(--accent)" }}
              />
              <span className="hint">
                Bigram similarity between file names. Lower merges more aggressively — 80 is a good default.
              </span>
            </div>
          ) : null}

          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <div className="row">
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
            </div>
            <Toggle
              checked={rule.dryRun}
              onChange={(dryRun) => patch({ dryRun })}
              label="Dry run"
              hint="Plan only — nothing touches disk"
            />
          </div>

          <div className="stats">
            <Stat value={items.length} label="Files in plan" />
            <Stat value={summary.length} label="Target folders" />
            <Stat value={humanBytes(totalBytes)} label="Volume" />
          </div>

          <div className="divider" />

          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="label">Preview</span>
            <span className="hint">
              {rule.action === "move" ? "Move" : "Copy"} · {rule.dryRun ? "dry run" : "will write to disk"}
            </span>
          </div>
        </div>

        <div className="planhead">
          <span>Target folder</span>
          <span>Files</span>
          <span>Size</span>
        </div>
        {summary.map((row) => (
          <div className="planrow" key={row.folder}>
            <span className="target">
              <span style={{ color: "var(--accent)" }}>▸</span>
              <span className="ellipsis" title={row.folder}>
                {row.folder}
              </span>
              {row.kinds.map((kind) => (
                <KindDot key={kind} kind={kind} />
              ))}
              {row.status === "collision" ? <Badge tone="warn">name clash</Badge> : null}
            </span>
            <span className="tnum dim">{row.count}</span>
            <span className="tnum dim">{humanBytes(row.bytes)}</span>
          </div>
        ))}

        <div className="pad stack">
          <span className="label">Sample</span>
          {items.slice(0, 8).map((item) => (
            <div className="row" key={item.file.id} style={{ fontSize: 11.5 }}>
              <KindDot kind={item.file.kind} />
              <span className="mono ellipsis" style={{ minWidth: 0, flex: "1 1 auto", color: "var(--text-2)" }}>
                {item.file.name}
              </span>
              <span className="arrow">→</span>
              <span className="mono ellipsis" style={{ maxWidth: "42%", color: "var(--accent)" }}>
                {item.targetFolder}
              </span>
              {item.status === "collision" ? <Badge tone="warn">!</Badge> : null}
            </div>
          ))}
          {items.length > 8 ? <span className="hint">+ {items.length - 8} more…</span> : null}
          <span className="hint">
            Kinds involved:{" "}
            {[...new Set(items.map((i) => KIND_CONFIG[i.file.kind].plural))].join(" · ") || "—"}
          </span>
        </div>
      </div>

      <div className="footbar">
        {collisions > 0 ? <Badge tone="warn">{collisions} name clashes</Badge> : <Badge tone="ok">plan clean</Badge>}
        <span className="hint">
          {items.length} file{items.length === 1 ? "" : "s"} → {summary.length} folder{summary.length === 1 ? "" : "s"}
        </span>
        <span className="spacer" />
        <button className="btn primary" disabled={busy || items.length === 0} onClick={onApply}>
          {busy ? "Working…" : rule.dryRun ? "Run dry run" : `${rule.action === "move" ? "Move" : "Copy"} ${items.length} files`}
        </button>
      </div>
    </div>
  );
}
