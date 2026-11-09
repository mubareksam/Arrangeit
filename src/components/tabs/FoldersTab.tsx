import {
  FOLDER_COLORS,
  buildDesktopIni,
  humanBytes,
  iconFileName,
  styleSteps,
} from "../../lib/organizer/engine";
import { FOLDER_GLYPHS, type FolderStyle, type StyleStep } from "../../lib/organizer/types";
import { Badge, SectionTitle, Toggle } from "../ui";

export function FolderIcon({ color, glyph, size = 34 }: { color: string; glyph: string; size?: number }) {
  return (
    <span
      className="foldericon"
      style={{
        background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 62%, #000))`,
        width: size,
        height: size * 0.86,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden="true"
    >
      {glyph}
    </span>
  );
}

export function FoldersTab({
  folders,
  styles,
  active,
  setActive,
  update,
  onApply,
  steps,
  busy,
  root,
}: {
  folders: { name: string; count: number; bytes: number }[];
  styles: Record<string, FolderStyle>;
  active: string;
  setActive: (folder: string) => void;
  update: (folder: string, patch: Partial<FolderStyle>) => void;
  onApply: () => void;
  steps: StyleStep[] | null;
  busy: boolean;
  root: string;
}) {
  const style = styles[active];
  if (!style) return <div className="panel"><div className="empty">No folders found.</div></div>;

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Folder styles</span>
        <span className="spacer" />
        <span className="kbd">desktop.ini</span>
      </div>

      <div className="panel-body">
        <div className="pad stack" style={{ paddingBottom: 6 }}>
          <SectionTitle>Choose a folder</SectionTitle>
          <div className="stack" style={{ gap: 6 }}>
            {folders.map((folder) => {
              const folderStyle = styles[folder.name];
              return (
                <button
                  key={folder.name}
                  className="foldertile"
                  data-active={folder.name === active}
                  onClick={() => setActive(folder.name)}
                >
                  <FolderIcon
                    color={folderStyle?.color ?? "var(--panel-3)"}
                    glyph={FOLDER_GLYPHS.find((g) => g.id === folderStyle?.glyph)?.glyph ?? "🗀"}
                    size={28}
                  />
                  <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                    <span className="ellipsis" style={{ display: "block", fontWeight: 550, fontSize: 12.5 }}>
                      {folder.name}
                    </span>
                    <span className="hint tnum">
                      {folder.count} files · {humanBytes(folder.bytes)}
                    </span>
                  </span>
                  {folderStyle?.tooltip ? <Badge tone="accent">styled</Badge> : null}
                </button>
              );
            })}
          </div>

          <div className="divider" />

          <SectionTitle right={<span className="hint mono">{iconFileName(style)}</span>}>Icon</SectionTitle>
          <div className="glyphgrid">
            {FOLDER_GLYPHS.map((glyph) => (
              <button
                key={glyph.id}
                className="glyphbtn"
                aria-pressed={style.glyph === glyph.id}
                title={glyph.label}
                onClick={() => update(active, { glyph: glyph.id })}
              >
                {glyph.glyph}
              </button>
            ))}
          </div>

          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="label">Accent</span>
            <div className="swatches">
              {FOLDER_COLORS.map((color) => (
                <button
                  key={color}
                  className="swatch"
                  data-active={style.color.toLowerCase() === color}
                  style={{ background: color }}
                  onClick={() => update(active, { color })}
                  aria-label={`Accent ${color}`}
                />
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">Tooltip (InfoTip)</span>
            <input
              className="input"
              value={style.tooltip}
              onChange={(e) => update(active, { tooltip: e.target.value })}
              placeholder={`ArrangeIt · ${active}`}
            />
          </div>

          <Toggle
            checked={style.hideSystemFiles}
            onChange={(hideSystemFiles) => update(active, { hideSystemFiles })}
            label="Hide desktop.ini"
            hint="attrib +s +h — recommended, keeps the folder tidy"
          />

          <div className="row" style={{ gap: 10 }}>
            <span className="label">Live tile</span>
            <FolderIcon
              color={style.color}
              glyph={FOLDER_GLYPHS.find((g) => g.id === style.glyph)?.glyph ?? "🗀"}
              size={44}
            />
            <span className="hint">
              Windows renders this from the generated .ico — Explorer may need a refresh
              (ie4uinit -show) before it appears.
            </span>
          </div>

          <div className="divider" />
          <SectionTitle>desktop.ini</SectionTitle>
          <pre className="codebox">{buildDesktopIni(style)}</pre>
        </div>
      </div>

      <div className="footbar">
        <span className="hint mono ellipsis" style={{ maxWidth: "40%" }}>
          {root}
          {active}
        </span>
        <span className="spacer" />
        <button className="btn primary" onClick={onApply} disabled={busy}>
          {busy ? "Applying…" : "Apply style"}
        </button>
      </div>

      {steps ? (
        <div className="pad stack" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 10 }}>
          <SectionTitle right={<Badge tone="ok">applied</Badge>}>Shell commands</SectionTitle>
          {steps.map((step) => (
            <div className="step" key={step.command}>
              <span className="ok">{step.ok ? "✓" : "✕"}</span>
              <span>
                <span className="mono" style={{ color: "var(--text)" }}>
                  {step.command}
                </span>
                <span className="hint" style={{ display: "block" }}>
                  {step.detail}
                </span>
              </span>
            </div>
          ))}
          <span className="hint">
            Run {styleSteps(style, root).length} shell steps against {root}
            {active} — undo restores the previous desktop.ini.
          </span>
        </div>
      ) : null}
    </div>
  );
}
