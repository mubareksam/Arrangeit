import { useEffect, useMemo, useState } from "react";
import { assetUrl } from "../../lib/organizer/bridge";
import {
  KEEPER_STRATEGIES,
  MATCH_LABEL,
  duplicateStats,
  formatDate,
  humanBytes,
  matcherTone,
  pickKeeper,
  type KeeperStrategy,
} from "../../lib/organizer/engine";
import type { DuplicateFilter } from "../../lib/organizer/engine";
import type { AppFile, DuplicateGroup, DuplicateOptions } from "../../lib/organizer/types";
import { Icon } from "../Icon";
import { Badge, Empty, Spinner, Stat, Toggle } from "../ui";

const SIZE_FILTERS = [
  { id: 0, label: "Any size" },
  { id: 1 * 1024 * 1024, label: "≥ 1 MB" },
  { id: 10 * 1024 * 1024, label: "≥ 10 MB" },
  { id: 100 * 1024 * 1024, label: "≥ 100 MB" },
];

function Thumb({ file }: { file: DuplicateGroup["files"][number] }) {
  const [failed, setFailed] = useState(false);
  const isImage = file.kind === "image";
  if (!isImage || failed) {
    return (
      <span className="dup-thumb">
        <Icon name="file" size={13} style={{ color: "var(--text-3)" }} />
      </span>
    );
  }
  return (
    <span className="dup-thumb">
      <img src={assetUrl(file.path)} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}

export function DuplicatesTab({
  groups,
  options,
  setOptions,
  filter,
  setFilter,
  strategy,
  setStrategy,
  keepers,
  setKeeper,
  ignoredCount,
  onIgnore,
  onClearIgnored,
  pending,
  onTogglePending,
  onSelectAllButKeepers,
  onKeepOnePerFolder,
  onDelete,
  onScan,
  onExport,
  activeId,
  onPreview,
  busy,
  scanned,
  scannedAt,
  hashing,
  hashProgress,
}: {
  groups: DuplicateGroup[];
  options: DuplicateOptions;
  setOptions: (next: DuplicateOptions) => void;
  filter: DuplicateFilter;
  setFilter: (next: DuplicateFilter) => void;
  strategy: KeeperStrategy;
  setStrategy: (next: KeeperStrategy) => void;
  keepers: Record<string, string>;
  setKeeper: (groupId: string, fileId: string) => void;
  ignoredCount: number;
  onIgnore: (groupId: string) => void;
  onClearIgnored: () => void;
  pending: Set<string>;
  onTogglePending: (fileId: string) => void;
  onSelectAllButKeepers: () => void;
  onKeepOnePerFolder: () => void;
  onDelete: () => void;
  onScan: () => void;
  onExport: () => void;
  /** Id of the file currently shown in the right-hand preview pane. */
  activeId: string | null;
  onPreview: (file: AppFile) => void;
  busy: boolean;
  scanned: boolean;
  scannedAt: string | null;
  hashing: boolean;
  hashProgress: { done: number; total: number } | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [compare, setCompare] = useState<string | null>(null);

  useEffect(() => {
    if (groups.length === 0) return;
    setOpen((current) => (current && groups.some((group) => group.id === current) ? current : groups[0].id));
  }, [groups]);

  const patch = (next: Partial<DuplicateOptions>) => setOptions({ ...options, ...next });
  const patchFilter = (next: Partial<DuplicateFilter>) => setFilter({ ...filter, ...next });

  const stats = useMemo(() => duplicateStats(groups), [groups]);
  const pendingBytes = useMemo(
    () => groups.flatMap((group) => group.files).filter((file) => pending.has(file.id)).reduce((sum, file) => sum + file.size, 0),
    [groups, pending],
  );

  const strategyHint = KEEPER_STRATEGIES.find((item) => item.id === strategy)?.hint ?? "";

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <Icon name="duplicate" size={14} />
          Duplicates
        </span>
        <span className="panel-sub">
          {scanned ? `· ${stats.groups} groups · ${humanBytes(stats.reclaimable)}` : "· not scanned"}
          {scannedAt && scanned ? ` · ${scannedAt}` : ""}
        </span>
        <span className="spacer" />
        <button className="btn sm" onClick={onScan} disabled={busy || hashing}>
          {hashing ? <Spinner /> : <Icon name="scan" size={12} />}
          {scanned ? "Re-scan" : "Find duplicates"}
        </button>
      </div>

      {scanned && stats.groups > 0 ? (
        <div className="statstrip">
          <Stat value={stats.groups} label="GROUPS" />
          <Stat value={stats.extras} label="EXTRA COPIES" />
          <Stat value={humanBytes(stats.reclaimable)} label="RECLAIMABLE" />
          <Stat value={humanBytes(stats.biggest)} label="BIGGEST" />
        </div>
      ) : null}

      <div className="dup-options">
        <Toggle checked={options.byHash} onChange={(byHash) => patch({ byHash })} label="Exact" hint="Byte-identical (SHA-256)" />
        <Toggle checked={options.byVisual} onChange={(byVisual) => patch({ byVisual })} label="Visual" hint="Perceptual dHash — resized or re-saved photos" />
        <Toggle checked={options.byAudio} onChange={(byAudio) => patch({ byAudio })} label="Audio" hint="Same recording length" />
        <Toggle checked={options.byImage} onChange={(byImage) => patch({ byImage })} label="Pixels" hint="Same width × height" />
        <Toggle checked={options.byName} onChange={(byName) => patch({ byName })} label="Names" />
        <span className="spacer" />
        <span className="label">Match ≥</span>
        <input
          type="range"
          min={50}
          max={100}
          value={options.fuzzy}
          onChange={(e) => patch({ fuzzy: Number(e.target.value) })}
          aria-label="Name similarity threshold"
          style={{ width: 84, accentColor: "var(--accent)" }}
        />
        <Badge>{options.fuzzy}%</Badge>
      </div>

      <div className="settings">
        <span className="label">Show</span>
        {SIZE_FILTERS.map((option) => (
          <button
            key={option.id}
            className="chip"
            data-active={filter.minBytes === option.id}
            onClick={() => patchFilter({ minBytes: option.id })}
          >
            {option.label}
          </button>
        ))}
        <Toggle
          checked={filter.crossFolderOnly}
          onChange={(crossFolderOnly) => patchFilter({ crossFolderOnly })}
          label="Across folders"
        />
        <Toggle checked={filter.mediaOnly} onChange={(mediaOnly) => patchFilter({ mediaOnly })} label="Media only" />
        {ignoredCount > 0 ? (
          <button className="chip" onClick={onClearIgnored} title="Bring ignored groups back">
            <Icon name="undo" size={10} /> {ignoredCount} ignored
          </button>
        ) : null}
        <span className="spacer" />
        <span className="label">Keep</span>
        <select
          className="input"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as KeeperStrategy)}
          title={strategyHint}
          style={{ width: 148, height: 28 }}
          aria-label="Which copy to keep"
        >
          {KEEPER_STRATEGIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="panel-body">
        {hashing ? (
          <div className="hashbar">
            <Spinner />
            <span>
              Reading pixels — {hashProgress ? `${hashProgress.done} / ${hashProgress.total}` : "starting…"}
            </span>
            <span className="spacer" />
            <span className="hint">Similarity runs in batches so the UI stays responsive.</span>
          </div>
        ) : null}

        {groups.length === 0 ? (
          <Empty
            icon="duplicate"
            title={scanned ? "No duplicates match these filters" : "Nothing scanned yet"}
            hint={
              scanned
                ? "Loosen the size filter, or allow “Across folders” — or scan again with Visual on."
                : "Exact matches use SHA-256; Visual uses a perceptual hash so resized or re-saved photos still match."
            }
            action={
              scanned ? null : (
                <button className="btn primary sm" onClick={onScan} disabled={busy} style={{ marginTop: 6 }}>
                  Find duplicates
                </button>
              )
            }
          />
        ) : (
          <div className="dupgrid">
            {groups.map((group) => {
              const isOpen = open === group.id;
              const keeper = keepers[group.id] ?? pickKeeper(group, strategy).id;
              const keeperFile = group.files.find((file) => file.id === keeper) ?? group.files[0];
              const isCompare = compare === group.id;
              return (
                <div className="dupcard" key={group.id} data-open={isOpen}>
                  <div className="dup-head">
                    <button className="dup-toggle" onClick={() => setOpen(isOpen ? null : group.id)} aria-expanded={isOpen}>
                      <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={13} style={{ color: "var(--text-3)" }} />
                    </button>
                    <Thumb file={keeperFile} />
                    <span className="dup-title ellipsis" title={keeperFile.path}>
                      {group.label}
                    </span>
                    <span className="spacer" />
                    <Badge tone={matcherTone(group.match)}>{MATCH_LABEL[group.match]}</Badge>
                    <span className="badge tnum">{group.files.length}×</span>
                    <span className="hint tnum" style={{ minWidth: 58, textAlign: "right" }}>
                      {humanBytes(group.reclaimable)}
                    </span>
                    <button
                      className="iconbtn"
                      title="Ignore this group"
                      onClick={() => onIgnore(group.id)}
                      style={{ width: 24, height: 24 }}
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </div>

                  {isOpen ? (
                    <>
                      <div className="dup-compare">
                        {group.files.slice(0, 3).map((file) => (
                          <button
                            key={file.id}
                            className="dup-card-mini"
                            data-keeper={file.id === keeper}
                            data-active={activeId === file.id}
                            onClick={() => onPreview(file)}
                            title={`Preview ${file.name} on the right`}
                          >
                            <Thumb file={file} />
                            <span className="dup-mini-cap">
                              <span className="mono ellipsis" title={file.name}>
                                {file.name}
                              </span>
                              <span className="hint tnum">
                                {file.width && file.height ? `${file.width}×${file.height} · ` : ""}
                                {humanBytes(file.size)} · {formatDate(file.modified)}
                              </span>
                            </span>
                          </button>
                        ))}
                        {group.files.length > 3 ? (
                          <div className="dup-card-mini more">
                            <span>+{group.files.length - 3}</span>
                            <span className="hint">more copies</span>
                          </div>
                        ) : null}
                      </div>

                      {group.files.map((file) => {
                        const isKeeper = file.id === keeper;
                        const checked = pending.has(file.id);
                        return (
                          <div className="dup-file" key={file.id} title={file.path} data-active={activeId === file.id}>
                            <button
                              className="checkbox"
                              aria-label={`Recycle ${file.name}`}
                              disabled={isKeeper}
                              onClick={() => onTogglePending(file.id)}
                              style={{
                                padding: 0,
                                borderColor: checked ? "var(--danger)" : undefined,
                                background: checked ? "var(--danger)" : undefined,
                                color: checked ? "#fff" : "transparent",
                              }}
                            >
                              <Icon name="check" size={9} strokeWidth={3} />
                            </button>
                            <button
                              className="dup-open"
                              onClick={() => onPreview(file)}
                              title={`Preview ${file.name} on the right`}
                            >
                              <Icon name="image" size={11} />
                              <span className="mono ellipsis">{file.folder}\{file.name}</span>
                            </button>
                            <span className="hint tnum">
                              {file.width && file.height ? `${file.width}×${file.height}` : formatDate(file.modified)}
                            </span>
                            <span className="hint tnum" style={{ minWidth: 56, textAlign: "right" }}>
                              {humanBytes(file.size)}
                            </span>
                            {isKeeper ? (
                              <span className="keepflag">keep</span>
                            ) : (
                              <button className="btn sm ghost" onClick={() => setKeeper(group.id, file.id)}>
                                keep
                              </button>
                            )}
                          </div>
                        );
                      })}

                      <div className="dup-foot">
                        <span className="hint">
                          {group.confidence}% confidence · keep “{keeperFile.name}” ({strategyHint}) · click any copy to compare it on
                          the right
                        </span>
                        <span className="spacer" />
                        <button className="btn sm ghost" onClick={() => setCompare(isCompare ? null : group.id)}>
                          {isCompare ? "Hide details" : "Compare"}
                        </button>
                        <button className="btn sm ghost" onClick={() => onIgnore(group.id)}>
                          Nothing to do
                        </button>
                      </div>

                      {isCompare ? (
                        <div className="dup-details">
                          {group.files.map((file) => (
                            <div key={file.id} className="meta-row">
                              <span className="k ellipsis" title={file.path}>
                                {file.folder}\{file.name}
                              </span>
                              <span className="v">
                                {file.width && file.height ? `${file.width}×${file.height} · ` : ""}
                                {humanBytes(file.size)} · {formatDate(file.modified, true)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="footbar">
        <button className="btn sm" onClick={onSelectAllButKeepers} disabled={groups.length === 0 || busy}>
          Select extras
        </button>
        <button className="btn sm ghost" onClick={onKeepOnePerFolder} disabled={groups.length === 0 || busy} title="Keep the copy in the first folder of each group">
          One per folder
        </button>
        <button className="btn sm ghost" onClick={onExport} disabled={groups.length === 0}>
          <Icon name="download" size={12} /> Report
        </button>
        <span className="hint tnum">
          {pending.size} selected · {humanBytes(pendingBytes)}
        </span>
        <span className="spacer" />
        <button className="btn danger" disabled={busy || pending.size === 0} onClick={onDelete}>
          <Icon name="trash" size={12} />
          Recycle {pending.size || ""}
        </button>
      </div>
    </div>
  );
}
