import { useMemo } from "react";
import { humanBytes } from "../../lib/organizer/engine";
import {
  PROFESSIONS,
  PROFESSION_BY_ID,
  STRUCTURE_TEMPLATES,
  detectProfession,
  explainGuess,
  projectKey,
  structurePlan,
  templateById,
  yearOf,
  type TemplateStyle,
} from "../../lib/organizer/structures";
import { smartPlan } from "../../lib/organizer/smart";
import {
  DEFAULT_SIZE_RANGES,
  DEFAULT_SMART_OPTIONS,
  type AppFile,
  type ArrangeItem,
  type ArrangeMode,
  type ArrangeRule,
  type ArrangeSummaryRow,
} from "../../lib/organizer/types";
import { Icon, type IconName } from "../Icon";
import { Badge, KindDot, Segmented, Toggle } from "../ui";

const MODES: { id: ArrangeMode; label: string; icon: IconName; hint: string }[] = [
  { id: "smart", label: "Smart", icon: "zap", hint: "Reads the files and decides — mixed work welcome" },
  { id: "profession", label: "Persona", icon: "layers", hint: "Real folder layouts for a specific job" },
  { id: "type", label: "Type", icon: "grid", hint: "Images, Audio, Documents…" },
  { id: "date", label: "Date", icon: "clock", hint: "Year, month or day buckets" },
  { id: "size", label: "Size", icon: "sliders", hint: "Tiny → Huge ranges" },
  { id: "similarity", label: "Similar", icon: "sparkles", hint: "Cluster look-alike names" },
  { id: "name", label: "Name", icon: "sort", hint: "Alphabetical folders" },
  { id: "ext", label: "Extension", icon: "file", hint: "One folder per extension" },
];

export interface ArrangePreset {
  id: string;
  label: string;
  patch: Partial<ArrangeRule>;
}

interface PlanGroup {
  folder: string;
  files: number;
  reason: string;
}

/** Folder tree with the reason each folder exists. */
function PlanTree({ groups, empty }: { groups: PlanGroup[]; empty: string }) {
  if (groups.length === 0) {
    return <div className="hint" style={{ padding: "14px 4px", textAlign: "center" }}>{empty}</div>;
  }
  return (
    <div className="plantree">
      {groups.map((group) => {
        const segments = group.folder.split("/");
        const leaf = segments.pop() ?? group.folder;
        const parent = segments.join(" / ");
        return (
          <div className="plantree-row" key={group.folder} data-depth={Math.min(2, group.folder.split("/").length - 1)}>
            <Icon name="folder" size={12} />
            <span className="plantree-path ellipsis" title={group.folder}>
              {parent ? <span className="plantree-parent">{parent} / </span> : null}
              <strong>{leaf}</strong>
            </span>
            <span className="plantree-reason ellipsis" title={group.reason}>
              {group.reason}
            </span>
            <span className="hint tnum">{group.files}</span>
          </div>
        );
      })}
    </div>
  );
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

  const toggleRange = (id: string) => {
    const has = rule.sizeRanges.some((range) => range.id === id);
    const next = has
      ? rule.sizeRanges.filter((range) => range.id !== id)
      : [...rule.sizeRanges, DEFAULT_SIZE_RANGES.find((range) => range.id === id)!];
    patch({ sizeRanges: next.length ? next : DEFAULT_SIZE_RANGES });
  };

  /* ---- profession ---- */

  const template = templateById(rule.structureId);
  const profession = PROFESSION_BY_ID[template.profession];
  const guess = useMemo(() => detectProfession(files), [files]);

  const recommendedStyle = useMemo<TemplateStyle>(() => {
    const projects = new Set(files.map((file) => projectKey(file)).filter(Boolean)).size;
    const years = new Set(files.map((file) => yearOf(file))).size;
    if (profession.id === "photographer") return "date-role";
    if (files.length >= 18 && projects >= 4) return "project-role";
    if (files.length >= 36 && years >= 3) return "role-year";
    return "role";
  }, [files, profession.id]);

  const professionPlan = useMemo(
    () => (rule.mode === "profession" ? structurePlan(files, rule.structureId) : null),
    [files, rule.mode, rule.structureId],
  );

  /* ---- smart ---- */

  const smart = useMemo(
    () => (rule.mode === "smart" ? smartPlan(files, rule.smart ?? DEFAULT_SMART_OPTIONS) : null),
    [files, rule.mode, rule.smart],
  );
  const smartOptions = rule.smart ?? DEFAULT_SMART_OPTIONS;

  const planGroups: PlanGroup[] =
    professionPlan?.groups.map((group) => ({ folder: group.folder, files: group.files, reason: group.reason })) ??
    smart?.report.groups.map((group) => ({ folder: group.folder, files: group.files, reason: group.reason })) ??
    [];

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
                data-highlight={mode.id === "smart" || mode.id === "profession"}
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

        {rule.mode === "smart" && smart ? (
          <div className="persona smart">
            <div className="persona-head">
              <span className="smart-orb" aria-hidden="true">
                <Icon name="zap" size={13} />
              </span>
              <span className="persona-text">
                <strong>{smart.report.headline}</strong>
                <em>{smart.report.notes[0]}</em>
              </span>
              <span className="spacer" />
              <span className="smart-conf" title="How much of the folder the analysis explains">
                <span className="smart-meter">
                  <i style={{ width: `${smart.report.confidence}%` }} />
                </span>
                {smart.report.confidence}% confident
              </span>
            </div>

            {smart.report.disciplines.length > 0 ? (
              <div className="persona-variants smart-disciplines">
                <span className="label">Detected</span>
                {smart.report.disciplines.map((discipline) => (
                  <button
                    key={discipline.id}
                    className="chip"
                    data-active={discipline.id === guess.profession.id}
                    title={`${discipline.label} · ${discipline.files} files`}
                    onClick={() =>
                      patch({ mode: "profession", structureId: `${discipline.id}:${recommendedStyle}` })
                    }
                  >
                    <Icon name="layers" size={10} />
                    {discipline.label}
                    <span className="tnum">{discipline.share}%</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="smart-notes">
              {smart.report.notes.map((note) => (
                <span key={note} className="hint">
                  <Icon name="check" size={10} /> {note}
                </span>
              ))}
            </div>

            <div className="row wrap" style={{ gap: 12 }}>
              <Toggle
                checked={smartOptions.splitDisciplines}
                onChange={(splitDisciplines) => patch({ smart: { ...smartOptions, splitDisciplines } })}
                label="Split mixed work"
                hint="Design and video in one folder → separate top-level folders"
              />
              <Toggle
                checked={smartOptions.projectFolders}
                onChange={(projectFolders) => patch({ smart: { ...smartOptions, projectFolders } })}
                label="Project folders"
                hint="Group files that share a name stem"
              />
              <Toggle
                checked={smartOptions.yearArchive}
                onChange={(yearArchive) => patch({ smart: { ...smartOptions, yearArchive } })}
                label="Year archive"
                hint="Add a year folder when files span several years"
              />
            </div>

            <PlanTree
              groups={planGroups}
              empty={files.length === 0 ? "Scan a folder — Smart needs files to read." : "Nothing to plan with these settings."}
            />
          </div>
        ) : null}

        {rule.mode === "profession" ? (
          <div className="persona">
            <div className="persona-head">
              <span className="label">Who is this folder for?</span>
              <span className="hint ellipsis">{explainGuess(guess)}</span>
              <span className="spacer" />
              {guess.confidence > 0 ? (
                <button
                  className="btn sm"
                  onClick={() =>
                    patch({ mode: "profession", structureId: `${guess.profession.id}:${recommendedStyle}` })
                  }
                  title="Apply the detected profession and the template that fits these files"
                >
                  <Icon name="sparkles" size={12} /> Use {guess.profession.label} · {guess.confidence}%
                </button>
              ) : null}
            </div>

            <div className="persona-grid">
              {PROFESSIONS.map((entry) => {
                const isActive = entry.id === profession.id;
                return (
                  <button
                    key={entry.id}
                    className="persona-card"
                    aria-pressed={isActive}
                    onClick={() => patch({ structureId: `${entry.id}:${template.style}` })}
                    title={entry.blurb}
                  >
                    <span className="persona-ico">
                      <Icon name={entry.icon as IconName} size={14} />
                    </span>
                    <span className="persona-text">
                      <strong>{entry.label}</strong>
                      <em>{entry.blurb}</em>
                    </span>
                    {guess.confidence > 0 && guess.profession.id === entry.id ? <span className="persona-flag">auto</span> : null}
                  </button>
                );
              })}
              <button
                className="persona-card persona-smart"
                aria-pressed={false}
                onClick={() => patch({ mode: "smart" })}
                title="Let ArrangeIt decide — including mixed and unknown fields"
              >
                <span className="persona-ico">
                  <Icon name="zap" size={14} />
                </span>
                <span className="persona-text">
                  <strong>Not listed? Smart</strong>
                  <em>Reads the files and builds the right structure for any field.</em>
                </span>
              </button>
            </div>

            <div className="persona-variants" role="group" aria-label="Folder structure">
              <span className="label">Structure</span>
              {STRUCTURE_TEMPLATES.filter((entry) => entry.profession === profession.id).map((entry) => (
                <button
                  key={entry.id}
                  className="chip"
                  data-active={entry.id === template.id}
                  data-suggested={entry.id !== template.id && entry.style === recommendedStyle}
                  aria-pressed={entry.id === template.id}
                  onClick={() => patch({ structureId: entry.id })}
                  title={
                    entry.style === recommendedStyle
                      ? `${entry.description} — recommended for these files`
                      : entry.description
                  }
                >
                  {entry.label}
                  {entry.style === recommendedStyle ? <span className="rec">★</span> : null}
                </button>
              ))}
              <span className="spacer" />
              <span className="hint tnum ellipsis" title={template.description}>
                {template.description}
              </span>
            </div>

            <PlanTree groups={planGroups} empty={files.length === 0 ? "Scan a folder to preview the structure." : "No files match this structure."} />

            {(() => {
              const leftovers = planGroups.filter((group) => /(^|\/)Other$/.test(group.folder)).reduce((sum, group) => sum + group.files, 0);
              if (leftovers === 0) return null;
              return (
                <button className="hint hint-action" onClick={() => patch({ mode: "smart" })}>
                  <Icon name="zap" size={11} />
                  {leftovers} file{leftovers === 1 ? "" : "s"} don’t belong to this profession — Smart would place them by
                  discipline instead of dumping them in Other.
                </button>
              );
            })()}
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
              summary.map((row) => {
                const segments = row.folder.split("/");
                const leaf = segments.pop() ?? row.folder;
                const parent = segments.join(" / ");
                return (
                  <tr key={row.folder}>
                    <td>
                      <span className="target">
                        <span className="folder-ico">
                          <Icon name="folder" size={13} />
                        </span>
                        <span className="ellipsis" title={row.folder}>
                          {parent ? <span className="target-parent">{parent} / </span> : null}
                          {leaf}
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
                );
              })
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
