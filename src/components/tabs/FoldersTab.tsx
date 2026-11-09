import type { FolderEntry } from "../../lib/organizer/bridge";
import { buildDesktopIni, humanBytes, iconFileName } from "../../lib/organizer/engine";
import { FOLDER_COLORS } from "../../lib/organizer/engine";
import { FOLDER_GLYPHS, type FolderStyle, type StyleStep } from "../../lib/organizer/types";
import { Badge, Empty, SectionTitle, Toggle } from "../ui";

export function FolderIcon({ color, glyph, size = 34 }: { color: string; glyph: string; size?: number }) {
  return (
    <span
      className="foldericon"
      style={{
        background: `linear-gradient(160deg, color-mix(in srgb, ${color} 92%, #fff), color-mix(in srgb, ${color} 74%, #000))`,
        width: size,
        height: size * 0.85,
        fontSize: Math.round(size * 0.38),
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
  onReset,
  onRefresh,
  steps,
  busy,
  root,
  canStyle,
}: {
  folders: FolderEntry[];
  styles: Record<string, FolderStyle>;
  active: string;
  setActive: (folder: string) => void;
  update: (folder: string, patch: Partial<FolderStyle>) => void;
  onApply: () => void;
  onReset: () => void;
  onRefresh: () => void;
  steps: StyleStep[] | null;
  busy: boolean;
  root: string;
  canStyle: boolean;
}) {
  const style = styles[active];
  const glyphOf = (id: string) => FOLDER_GLYPHS.find((g) => g.id === id)?.glyph ?? "🗀";

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Folder styles</span>
        <span className="panel-sub">· desktop.ini icons</span>
        <span className="spacer" />
        <button className="btn sm ghost" onClick={onRefresh}>
          Refresh Explorer
        </button>
      </div>

      <div className="panel-body">
        <div className="pad">
          {folders.length === 0 ? (
            <Empty
              title="No subfolders to style"
              hint="Pick a folder in the header. Styles apply to the folders directly inside it."
            />
          ) : (
            <div className="folder-grid">
              {folders.map((folder) => {
                const folderStyle = styles[folder.name];
                return (
                  <button
                    key={folder.path}
                    className="foldertile"
                    data-active={folder.name === active}
                    onClick={() => setActive(folder.name)}
                    title={folder.path}
                  >
                    <FolderIcon
                      color={folderStyle?.color ?? "#64748b"}
                      glyph={glyphOf(folderStyle?.glyph ?? "folder")}
                      size={30}
                    />
                    <span className="ellipsis" style={{ maxWidth: "100%", fontWeight: 500 }}>
                      {folder.name}
                    </span>
                    <span className="folder-meta">
                      {folder.files} files · {humanBytes(folder.bytes)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {style ? (
          <>
            <div className="divider" />
            <div className="style-grid">
              <div className="stack-sm">
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

                <SectionTitle>Accent</SectionTitle>
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

                <span className="label">Tooltip</span>
                <input
                  className="input"
                  value={style.tooltip}
                  onChange={(e) => update(active, { tooltip: e.target.value })}
                  placeholder={`ArrangeIt · ${active}`}
                />

                <Toggle
                  checked={style.hideSystemFiles}
                  onChange={(hideSystemFiles) => update(active, { hideSystemFiles })}
                  label="Hide desktop.ini"
                  hint="attrib +s +h — recommended"
                />
              </div>

              <div className="stack-sm">
                <div className="row" style={{ gap: 10 }}>
                  <FolderIcon color={style.color} glyph={glyphOf(style.glyph)} size={46} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{active}</div>
                    <div className="hint">
                      {steps ? "Style applied" : "Preview of the new icon"} · 16/32/48/256 px
                    </div>
                  </div>
                </div>

                <SectionTitle>desktop.ini</SectionTitle>
                <pre className="codebox">{buildDesktopIni(style)}</pre>

                {steps ? (
                  <>
                    <SectionTitle right={<Badge tone="ok">written</Badge>}>Shell steps</SectionTitle>
                    <div>
                      {steps.map((step) => (
                        <div className="step" key={step.command}>
                          <span className={step.ok ? "ok" : "fail"}>{step.ok ? "✓" : "✕"}</span>
                          <span>
                            <code>{step.command}</code>
                            <span className="hint" style={{ display: "block" }}>
                              {step.detail}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="hint">
                    Applying writes the icon, sets <code>attrib +r</code> on the folder and <code>+s +h</code> on the ini,
                    then flushes the icon cache. Explorer may need a second to catch up.
                  </span>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="footbar">
        <span className="hint mono ellipsis" style={{ maxWidth: "46%" }}>
          {root}
          {active}
        </span>
        <span className="spacer" />
        <button className="btn sm" onClick={onReset} disabled={busy || !canStyle}>
          Remove style
        </button>
        <button className="btn primary" onClick={onApply} disabled={busy || !canStyle || !style}>
          {busy ? "Applying…" : "Apply style"}
        </button>
      </div>
    </div>
  );
}
