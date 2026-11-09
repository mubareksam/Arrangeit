import { useEffect, useState } from "react";
import { humanBytes, keeperSuggestion, MATCH_LABEL } from "../../lib/organizer/engine";
import type { DuplicateGroup, DuplicateOptions } from "../../lib/organizer/types";
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
}) {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (groups.length === 0) return;
    setOpen((current) => (current && groups.some((g) => g.id === current) ? current : groups[0].id));
  }, [groups]);

  const patch = (next: Partial<DuplicateOptions>) => setOptions({ ...options, ...next });
  const reclaimable = groups.reduce((sum, g) => sum + g.reclaimable, 0);
  const pendingBytes = groups
    .flatMap((g) => g.files)
    .filter((f) => pending.has(f.id))
    .reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Duplicates</span>
        <span className="panel-sub">
          {scanned ? `${groups.length} groups · ${humanBytes(reclaimable)}` : "not scanned yet"}
          {scannedAt ? ` · ${scannedAt}` : ""}
        </span>
        <span className="spacer" />
        <button className="btn sm" onClick={onScan} disabled={busy}>
          {busy ? <Spinner /> : null}
          {scanned ? "Re-scan" : "Scan"}
        </button>
      </div>

      <div className="dup-options">
        <Toggle checked={options.byHash} onChange={(byHash) => patch({ byHash })} label="Exact" hint="Byte-identical (SHA-256)" />
        <Toggle checked={options.byAudio} onChange={(byAudio) => patch({ byAudio })} label="Audio" hint="Same recording, different encode" />
        <Toggle checked={options.byImage} onChange={(byImage) => patch({ byImage })} label="Images" hint="Same resolution and name" />
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
          style={{ width: 100, accentColor: "var(--accent)" }}
        />
        <Badge>{options.fuzzy}%</Badge>
      </div>

      <div className="panel-body">
        {groups.length === 0 ? (
          <Empty
            title={scanned ? "No duplicates found" : "Nothing scanned yet"}
            hint="Exact matches use SHA-256; audio compares duration, images compare pixel size, everything else falls back to fuzzy names."
            action={
              scanned ? null : (
                <button className="btn primary sm" onClick={onScan} disabled={busy}>
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
              return (
                <div className="dupcard" key={group.id} data-open={isOpen}>
                  <button className="dup-head" onClick={() => setOpen(isOpen ? null : group.id)}>
                    <span style={{ color: "var(--faint)", width: 10 }}>{isOpen ? "▾" : "▸"}</span>
                    <span className="dup-title ellipsis">{group.label}</span>
                    <span className="spacer" />
                    <Badge tone={group.match === "exact" ? "ok" : "accent"}>{MATCH_LABEL[group.match]}</Badge>
                    <span className="badge tnum">{group.files.length}×</span>
                    <span className="hint tnum" style={{ minWidth: 58, textAlign: "right" }}>
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
                              ✓
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
          Recycle {pending.size || ""}
        </button>
      </div>
    </div>
  );
}
