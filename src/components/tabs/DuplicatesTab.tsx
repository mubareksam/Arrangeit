import { useEffect, useState } from "react";
import { assetUrl } from "../../lib/organizer/bridge";
import { humanBytes, keeperSuggestion, MATCH_LABEL } from "../../lib/organizer/engine";
import type { DuplicateGroup, DuplicateOptions } from "../../lib/organizer/types";
import { Icon } from "../Icon";
import { Badge, Empty, Spinner, Toggle } from "../ui";

export function DuplicatesTab({
  groups,
  options,
  setOptions,
  keepers,
  setKeeper,
  pending,
  onTogglePending,
  onSelectAllButKeepers,
  onDelete,
  onScan,
  busy,
  scanned,
  scannedAt,
  hashing,
}: {
  groups: DuplicateGroup[];
  options: DuplicateOptions;
  setOptions: (next: DuplicateOptions) => void;
  keepers: Record<string, string>;
  setKeeper: (groupId: string, fileId: string) => void;
  pending: Set<string>;
  onTogglePending: (fileId: string) => void;
  onSelectAllButKeepers: () => void;
  onDelete: () => void;
  onScan: () => void;
  busy: boolean;
  scanned: boolean;
  scannedAt: string | null;
  hashing: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (groups.length === 0) return;
    setOpen((current) => (current && groups.some((group) => group.id === current) ? current : groups[0].id));
  }, [groups]);

  const patch = (next: Partial<DuplicateOptions>) => setOptions({ ...options, ...next });
  const reclaimable = groups.reduce((sum, group) => sum + group.reclaimable, 0);
  const pendingBytes = groups
    .flatMap((group) => group.files)
    .filter((file) => pending.has(file.id))
    .reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <Icon name="duplicate" size={14} />
          Duplicates
        </span>
        <span className="panel-sub">
          {scanned ? `· ${groups.length} groups · ${humanBytes(reclaimable)}` : "· not scanned"}
          {scannedAt && scanned ? ` · ${scannedAt}` : ""}
        </span>
        <span className="spacer" />
        <button className="btn sm" onClick={onScan} disabled={busy || hashing}>
          {hashing ? <Spinner /> : <Icon name="scan" size={12} />}
          {scanned ? "Re-scan" : "Find duplicates"}
        </button>
      </div>

      <div className="dup-options">
        <Toggle checked={options.byHash} onChange={(byHash) => patch({ byHash })} label="Exact" hint="Byte-identical (SHA-256)" />
        <Toggle checked={options.byAudio} onChange={(byAudio) => patch({ byAudio })} label="Audio" hint="Same recording length" />
        <Toggle checked={options.byImage} onChange={(byImage) => patch({ byImage })} label="Images" hint="Same pixel size + name" />
        <Toggle checked={options.byVisual} onChange={(byVisual) => patch({ byVisual })} label="Visually similar" hint="Perceptual dHash — catches resizes and re-saves" />
        <Toggle checked={options.byName} onChange={(byName) => patch({ byName })} label="Fuzzy" />
        <span className="spacer" />
        <span className="label">Similarity</span>
        <input
          type="range"
          min={50}
          max={100}
          value={options.fuzzy}
          onChange={(e) => patch({ fuzzy: Number(e.target.value) })}
          aria-label="Fuzzy threshold"
          style={{ width: 92, accentColor: "var(--accent)" }}
        />
        <Badge>{options.fuzzy}%</Badge>
      </div>

      <div className="panel-body">
        {groups.length === 0 ? (
          <Empty
            icon="duplicate"
            title={scanned ? "No duplicates found" : "Nothing scanned yet"}
            hint="Exact matches use SHA-256. “Visually similar” uses a perceptual hash, so resized or re-saved photos still match."
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
              const keeper = keepers[group.id] ?? keeperSuggestion(group).id;
              const sample = group.files[0];
              return (
                <div className="dupcard" key={group.id} data-open={isOpen}>
                  <button className="dup-head" onClick={() => setOpen(isOpen ? null : group.id)}>
                    <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={13} style={{ color: "var(--text-3)" }} />
                    {sample.kind === "image" ? (
                      <span className="dup-thumb">
                        <img src={assetUrl(sample.path)} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
                      </span>
                    ) : (
                      <span className="dup-thumb">
                        <Icon name="file" size={13} style={{ color: "var(--text-3)" }} />
                      </span>
                    )}
                    <span className="dup-title ellipsis">{group.label}</span>
                    <span className="spacer" />
                    <Badge tone={group.match === "exact" ? "ok" : "accent"}>{MATCH_LABEL[group.match]}</Badge>
                    <span className="badge tnum">{group.files.length}×</span>
                    <span className="hint tnum" style={{ minWidth: 56, textAlign: "right" }}>
                      {humanBytes(group.reclaimable)}
                    </span>
                  </button>

                  {isOpen
                    ? group.files.map((file) => {
                        const isKeeper = file.id === keeper;
                        const checked = pending.has(file.id);
                        return (
                          <div className="dup-file" key={file.id} title={file.path}>
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
                            <span className="mono ellipsis" style={{ minWidth: 0 }}>
                              {file.folder}\{file.name}
                            </span>
                            <span className="hint tnum">{humanBytes(file.size)}</span>
                            {isKeeper ? (
                              <span className="keepflag">keep</span>
                            ) : (
                              <button className="btn sm ghost" onClick={() => setKeeper(group.id, file.id)}>
                                keep
                              </button>
                            )}
                          </div>
                        );
                      })
                    : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="footbar">
        <button className="btn sm" onClick={onSelectAllButKeepers} disabled={groups.length === 0}>
          Select extras
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
