import type { FolderEntry } from "../../lib/organizer/bridge";
import { FOLDER_COLORS, buildDesktopIni, humanBytes, iconFileName } from "../../lib/organizer/engine";
import { FOLDER_GLYPHS, STYLE_PRESETS, type FolderStyle, type FolderGlyph, type StylePreset, type StyleStep } from "../../lib/organizer/types";
import { Icon, type IconName } from "../Icon";
import { Badge, Empty, SectionTitle, Spinner, Toggle } from "../ui";

const GLYPH_ICON: Partial<Record<FolderGlyph, IconName>> = {
  folder: "folder",
  star: "star",
  film: "video",
  book: "doc",
  music: "music",
  camera: "image",
  briefcase: "archive",
  flask: "sparkles",
  heart: "star",
  bolt: "zap",
  cloud: "download",
  shield: "lock",
  gear: "sliders",
  leaf: "info",
  flame: "zap",
  moon: "clock",
  sun: "star",
  plane: "external",
  cart: "archive",
  home: "folder",
  key: "lock",
  clock: "clock",
  layers: "grid",
  terminal: "code",
  gamepad: "grid",
};

export function FolderIcon({ color, glyph, size = 34 }: { color: string; glyph: string; size?: number }) {
  const icon = GLYPH_ICON[glyph as FolderGlyph];
  return (
    <span
      className="foldericon"
      style={{
        background: `linear-gradient(160deg, color-mix(in srgb, ${color} 94%, #fff), color-mix(in srgb, ${color} 72%, #000))`,
        width: size,
        height: size * 0.86,
        fontSize: Math.round(size * 0.4),
      }}
      aria-hidden="true"
    >
      {icon ? <Icon name={icon} size={Math.round(size * 0.42)} strokeWidth={2} /> : FOLDER_GLYPHS.find((g) => g.id === glyph)?.glyph}
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
  onPreset,
  onAddFolder,
  onAutoStyle,
  autoBusy,
  steps,
  busy,
  root,
  canStyle,
  activeName,
}: {
  folders: FolderEntry[];
  styles: Record<string, FolderStyle>;
  active: string;
  setActive: (folder: string) => void;
  update: (folder: string, patch: Partial<FolderStyle>) => void;
  onApply: () => void;
  onReset: () => void;
  onRefresh: () => void;
  onPreset: (preset: StylePreset) => void;
  onAddFolder: () => void;
  onAutoStyle: () => void;
  autoBusy: boolean;
  steps: StyleStep[] | null;
  busy: boolean;
  root: string;
  canStyle: boolean;
  activeName?: string;
}) {
  const style = styles[active];
  const activeFolder = folders.find((folder) => folder.path === active);
  const activeLabel = activeName ?? activeFolder?.name ?? "";
  const styledCount = folders.filter((folder) => Boolean(styles[folder.path]) && !styles[folder.path].glyph.startsWith("folder")).length;

  const fallback: FolderStyle = {
    folder: activeLabel || "Folder",
    glyph: "folder",
    color: "#38bdf8",
    tooltip: "",
    hideSystemFiles: true,
  };
  const current = style ?? fallback;
  const set = (patch: Partial<FolderStyle>) => update(active, patch);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <Icon name="folder" size={14} />
          Folder styles
        </span>
        <span className="panel-sub">· real Explorer icons</span>
        <span className="spacer" />
        <button className="btn sm ghost" onClick={onAutoStyle} disabled={!canStyle || autoBusy} title="Style every plain folder">
          {autoBusy ? <Spinner /> : <Icon name="sparkles" size={12} />}
          Auto-style
        </button>
        <button className="btn sm ghost" onClick={onRefresh} disabled={!canStyle}>
          <Icon name="refresh" size={12} /> Explorer
        </button>
      </div>

      <div className="panel-body">
        {folders.length === 0 ? (
          <Empty
            icon="folder"
            title="No folders to style yet"
            hint="Pick a folder in the header, or add any directory on your PC — a folder doesn't have to live inside the scanned one."
            action={
              <button className="btn primary sm" onClick={onAddFolder} style={{ marginTop: 6 }}>
                <Icon name="plus" size={12} /> Add any folder
              </button>
            }
          />
        ) : (
          <div className="pad stack">
            <SectionTitle right={<span className="hint tnum">{styledCount}/{folders.length} styled</span>}>
              Folders
            </SectionTitle>
            <div className="folder-grid">
              {folders.map((folder) => {
                const folderStyle = styles[folder.name] ?? styles[folder.path];
                return (
                  <button
                    key={folder.path}
                    className="foldertile"
                    data-active={folder.name === active}
                    onClick={() => setActive(folder.name)}
                    title={folder.path}
                  >
                    <FolderIcon color={folderStyle?.color ?? "#64748b"} glyph={folderStyle?.glyph ?? "folder"} size={34} />
                    <span className="ellipsis" style={{ maxWidth: "100%" }}>
                      {folder.name}
                    </span>
                    <span className="folder-meta">{folder.files ? `${folder.files} items` : humanBytes(folder.bytes)}</span>
                  </button>
                );
              })}
              <button className="foldertile" onClick={onAddFolder} title="Style any directory on your PC">
                <span
                  className="foldericon"
                  style={{ background: "var(--surface-3)", color: "var(--text-3)", boxShadow: "none", border: "1px dashed var(--border)" }}
                >
                  <Icon name="plus" size={14} />
                </span>
                <span>Add folder</span>
                <span className="folder-meta">anywhere</span>
              </button>
            </div>
          </div>
        )}

        {folders.length > 0 ? (
          <>
            <div className="divider" />
            <div className="style-grid">
              <div className="stack">
                <SectionTitle right={style ? <Badge tone="ok">styled</Badge> : <Badge>plain</Badge>}>
                  {activeLabel || "Pick a folder"}
                  {activeFolder ? (
                    <span className="hint mono" style={{ marginLeft: 6 }}>
                      {humanBytes(activeFolder.bytes)}
                    </span>
                  ) : null}
                </SectionTitle>

                <div className="row" style={{ gap: 12, alignItems: "center" }}>
                  <FolderIcon color={current.color} glyph={current.glyph} size={54} />
                  <div className="stack-sm" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }} className="ellipsis">
                      {current.tooltip || (active ? "Look & feel for this folder" : "Select a folder")}
                    </div>
                    <span className="hint mono ellipsis">{activeFolder?.path ?? active ?? "—"}</span>
                  </div>
                </div>

                <div className="field">
                  <span className="label">Presets</span>
                  <div className="presetrow">
                    {STYLE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        className="preset-chip"
                        data-active={current.glyph === preset.glyph}
                        onClick={() => onPreset(preset)}
                        title={preset.tooltip}
                        disabled={!active}
                      >
                        <span className="dot" style={{ background: preset.color }}>
                          <Icon name={GLYPH_ICON[preset.glyph] ?? "folder"} size={10} strokeWidth={2.4} />
                        </span>
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <span className="label">Label in Explorer</span>
                  <input
                    className="input"
                    value={current.tooltip}
                    placeholder="e.g. Finance · 2024 receipts"
                    maxLength={80}
                    disabled={!active}
                    onChange={(e) => set({ tooltip: e.target.value })}
                  />
                </div>

                <div className="row" style={{ gap: 14 }}>
                  <Toggle
                    checked={current.hideSystemFiles}
                    onChange={(hideSystemFiles) => set({ hideSystemFiles })}
                    label="Hide desktop.ini"
                  />
                </div>
              </div>

              <div className="stack">
                <div className="field">
                  <span className="label">Icon — 25 glyphs</span>
                  <div className="glyphgrid">
                    {FOLDER_GLYPHS.map((glyph) => (
                      <button
                        key={glyph.id}
                        className="glyphbtn"
                        aria-pressed={current.glyph === glyph.id}
                        title={glyph.label}
                        disabled={!active}
                        onClick={() => set({ glyph: glyph.id })}
                      >
                        <Icon name={GLYPH_ICON[glyph.id] ?? "folder"} size={14} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <span className="label">Colour</span>
                  <div className="swatches">
                    {FOLDER_COLORS.map((color) => (
                      <button
                        key={color}
                        className="swatch"
                        data-active={current.color.toLowerCase() === color.toLowerCase()}
                        style={{ background: color }}
                        title={color}
                        aria-label={`Colour ${color}`}
                        disabled={!active}
                        onClick={() => set({ color })}
                      />
                    ))}
                  </div>
                </div>

                <div className="field">
                  <span className="label">Desktop.ini preview</span>
                  <pre className="codebox">{buildIniPreview(current)}</pre>
                </div>

                <div className="row">
                  <button className="btn primary block" onClick={onApply} disabled={!active || busy || !canStyle}>
                    {busy ? <Spinner /> : <Icon name="check" size={13} />}
                    Apply style
                  </button>
                  <button className="btn" onClick={onReset} disabled={!active || busy || !canStyle} title="Remove desktop.ini">
                    <Icon name="undo" size={13} />
                  </button>
                </div>
                {!canStyle ? <span className="hint">Styling writes real desktop.ini files — desktop app only.</span> : null}
              </div>
            </div>

            {steps && steps.length > 0 ? (
              <>
                <div className="divider" />
                <div className="pad stack-sm">
                  <SectionTitle>Last run</SectionTitle>
                  {steps.map((step, index) => (
                    <div className="step" key={index}>
                      <span className={step.ok ? "ok" : "fail"}>
                        <Icon name={step.ok ? "check" : "alert"} size={11} strokeWidth={2.6} />
                      </span>
                      <span>
                        <code>{step.command}</code>
                        {step.detail ? <div className="hint">{step.detail}</div> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="footbar">
        <span className="hint">
          {root ? (
            <>
              {iconFileName({ ...current, folder: activeLabel || "Folder" })} is generated on the fly — no downloads, no shell tricks.
            </>
          ) : (
            "Pick a folder to begin."
          )}
        </span>
      </div>
    </div>
  );
}

function buildIniPreview(style: FolderStyle): string {
  const ini = buildDesktopIni({ ...style, folder: style.folder || "Folder" });
  return ini.trim();
}
