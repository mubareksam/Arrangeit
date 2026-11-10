import { useMemo } from "react";
import { humanBytes } from "../../lib/organizer/engine";
import {
  PROFESSIONS,
  PROFESSION_BY_ID,
  STRUCTURE_VARIANTS,
  detectProfession,
  explainGuess,
  projectKey,
  variantById,
} from "../../lib/organizer/structures";
import {
  DEFAULT_SIZE_RANGES,
  type AppFile,
  type ArrangeItem,
  type ArrangeMode,
  type ArrangeRule,
  type ArrangeSummaryRow,
} from "../../lib/organizer/types";
import { Icon, type IconName } from "../Icon";
import { Badge, KindDot, Segmented, Toggle } from "../ui";

const MODES: { id: ArrangeMode; label: string; icon: IconName; hint: string }[] = [
  { id: "date", label: "Date", icon: "clock", hint: "Year, month or day buckets" },
  { id: "type", label: "Type", icon: "grid", hint: "Images, Audio, Documents…" },
  { id: "size", label: "Size", icon: "sliders", hint: "Tiny → Huge ranges" },
  { id: "similarity", label: "Similar", icon: "sparkles", hint: "Cluster look-alike names" },
  { id: "name", label: "Name", icon: "sort", hint: "Alphabetical folders" },
  { id: "ext", label: "Extension", icon: "file", hint: "One folder per extension" },
  { id: "profession", label: "Persona", icon: "layers", hint: "Structures built for a specific job" },
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
  compact,
  files,
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
  compact?: boolean;
  files: AppFile[];
}) {
  const patch = (next: Partial<ArrangeRule>) => setRule({ ...rule, ...next });
  const collisions = items.filter((i) => i.status === "collision").length;
  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0);
  const activeMode = MODES.find((mode) => mode.id === rule.mode)!;
  const activeStructure = variantById(rule.structureId);
  const activeProfession = PROFESSION_BY_ID[activeStructure.profession];
  const guess = useMemo(() => detectProfession(files), [files]);

  // The best *shape* for the files in front of us: many distinct projects want
  // a project-first tree, a long-lived folder wants years, everything else the
  // flat role folders.
  const recommended = useMemo(() => {
    const projects = new Set(files.map((file) => projectKey(file)));
    const years = new Set(files.map((file) => new Date(file.modified).getFullYear()));
    if (files.length >= 24 && projects.size >= 4) return "project-groups";
    if (projects.size >= 6) return "project";
    if (files.length >= 40 && years.size >= 3) return "groups-year";
    return "groups";
  }, [files]);

  const guessedVariant = STRUCTURE_VARIANTS.find(
    (variant) => variant.profession === guess.profession.id && variant.style === recommended,
  );
  const folderCount = new Set(items.map((item) => item.targetFolder)).size;

  const toggleRange = (id: string) => {
    const has = rule.sizeRanges.some((range) => range.id === id);
    const next = has
      ? rule.sizeRanges.filter((range) => range.id !== id)
      : [...rule.sizeRanges, DEFAULT_SIZE_RANGES.find((range) => range.id === id)!];
    patch({ sizeRanges: next.length ? next : DEFAULT_SIZE_RANGES });
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <Icon name="sort" size={14} />
          Arrange
        </span>
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
          <div className="modes" role="group" aria-label="Arrange by">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                className="mode"
                aria-pressed={rule.mode === mode.id}
                onClick={() => patch({ mode: mode.id })}
                title={mode.hint}
              >
                <Icon name={mode.icon} size={15} />
                {mode.label}
              </button>
            ))}
          </div>

          <div className="row wrap" style={{ gap: 5 }}>
            <span className="label" style={{ marginRight: 3 }}>
              Presets
            </span>
            {presets.map((preset) => (
              <button key={preset.id} className="chip" onClick={() => onPreset(preset)}>
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {rule.mode === "profession" ? (
          <div className="persona">
            <div className="persona-head">
              <span className="label">Who is this folder for?</span>
              <span className="hint ellipsis">{explainGuess(guess)}</span>
              <span className="spacer" />
              {guess.confidence > 0 ? (
                <button
                  className="btn sm"
                  onClick={() => patch({ mode: "profession", structureId: guessedVariant?.id ?? `${guess.profession.id}:groups` })}
                  title="Apply the detected profession and structure"
                >
                  <Icon name="sparkles" size={12} /> Use {guess.profession.label} · {guess.confidence}%
                </button>
              ) : null}
            </div>

            <div className="persona-grid">
              {PROFESSIONS.map((profession) => {
                const isActive = profession.id === activeProfession.id;
                return (
                  <button
                    key={profession.id}
                    className="persona-card"
                    aria-pressed={isActive}
                    onClick={() => patch({ structureId: `${profession.id}:${activeStructure.style}` })}
                    title={profession.blurb}
                  >
                    <span className="persona-ico">
                      <Icon name={profession.icon as IconName} size={14} />
                    </span>
                    <span className="persona-text">
                      <strong>{profession.label}</strong>
                      <em>{profession.blurb}</em>
                    </span>
                    {guess.confidence > 0 && guess.profession.id === profession.id ? <span className="persona-flag">auto</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="persona-variants" role="group" aria-label="Folder structure">
              <span className="label">Structure</span>
              {STRUCTURE_VARIANTS.filter((variant) => variant.profession === activeProfession.id).map((variant) => (
                <button
                  key={variant.id}
                  className="chip"
                  data-active={variant.id === activeStructure.id}
                  data-suggested={activeStructure.id !== variant.id && variant.style === recommended}
                  aria-pressed={variant.id === activeStructure.id}
                  onClick={() => patch({ structureId: variant.id })}
                  title={variant.style === recommended ? `${variant.description} — recommended for these files` : variant.description}
                >
                  {variant.label}
                  {variant.style === recommended ? <span className="rec">★</span> : null}
                </button>
              ))}
              <span className="spacer" />
              <span className="hint tnum">
                {activeStructure.description} · {folderCount} folder{folderCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        ) : null}

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
                const on = rule.sizeRanges.some((item) => item.id === range.id);
                return (
                  <button key={range.id} className="chip" data-active={on} onClick={() => toggleRange(range.id)}>
                    {range.label.split("(")[0].trim()}
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
                style={{ width: 128, accentColor: "var(--accent)" }}
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
                <td colSpan={3} style={{ color: "var(--text-3)", padding: "18px 12px", textAlign: "center" }}>
                  {items.length === 0 ? "Select files to build a plan." : "Pick a rule to build a plan."}
                </td>
              </tr>
            ) : (
              summary.map((row) => (
                <tr key={row.folder}>
                  <td>
                    <span className="target">
                      <span className="folder-ico">
                        <Icon name="folder" size={13} />
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

        {items.length > 0 && !compact ? (
          <>
            <div className="divider" />
            <div className="plan-sample">
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <span className="label">Sample moves</span>
                <button className="btn sm ghost" onClick={onExport}>
                  <Icon name="download" size={12} /> CSV
                </button>
              </div>
              {items.slice(0, 6).map((item) => (
                <div className="sample-row" key={item.file.id}>
                  <KindDot kind={item.file.kind} />
                  <span className="mono ellipsis" style={{ flex: "1 1 auto", minWidth: 0 }}>
                    {item.file.name}
                  </span>
                  <Icon name="arrowRight" size={11} style={{ color: "var(--text-3)" }} />
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
