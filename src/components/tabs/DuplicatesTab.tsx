import { useState } from "react";
import { humanBytes, MATCH_LABEL, keeperSuggestion } from "../../lib/organizer/engine";
import type { DuplicateGroup, DuplicateOptions } from "../../lib/organizer/types";
import { Badge, Empty, KindDot, Stat, Toggle } from "../ui";

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
}) {
  const [open, setOpen] = useState<string | null>(groups[0]?.id ?? null);
  const reclaimable = groups.reduce((sum, g) => sum + g.reclaimable, 0);
  const pendingBytes = groups
    .flatMap((g) => g.files)
    .filter((f) => pending.has(f.id))
    .reduce((sum, f) => sum + f.size, 0);

  const patch = (next: Partial<DuplicateOptions>) => setOptions({ ...options, ...next });

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Duplicate finder</span>
        <span className="spacer" />
        <button className="btn tiny" onClick={onScan} disabled={busy}>
          {busy ? "Hashing…" : scanned ? "Re-scan" : "Scan folder"}
        </button>
      </div>

      <div className="pad stack" style={{ paddingBottom: 8 }}>
        <div className="row wrap" style={{ gap: 12 }}>
          <Toggle checked={options.byHash} onChange={(byHash) => patch({ byHash })} label="Exact hash" hint="SHA-256 byte comparison" />
          <Toggle checked={options.byAudio} onChange={(byAudio) => patch({ byAudio })} label="Audio" hint="Same track, different bitrate" />
          <Toggle checked={options.byImage} onChange={(byImage) => patch({ byImage })} label="Images" hint="Same resolution + name" />
          <Toggle checked={options.byName} onChange={(byName) => patch({ byName })} label="Fuzzy names" />
        </div>

        <div className="field">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="label">Fuzzy threshold</span>
            <span className="badge tnum">{options.fuzzy}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={100}
            value={options.fuzzy}
            onChange={(e) => patch({ fuzzy: Number(e.target.value) })}
            aria-label="Fuzzy threshold"
            style={{ accentColor: "var(--accent)" }}
          />
        </div>

        <div className="stats">
          <Stat value={groups.length} label="Groups" />
          <Stat value={humanBytes(reclaimable)} label="Reclaimable" tone="var(--ok)" />
          <Stat value={pending.size} label="Selected" tone={pending.size ? "var(--warn)" : undefined} />
        </div>
      </div>

      <div className="panel-body">
        {groups.length === 0 ? (
          <Empty
            title={scanned ? "No duplicates — everything is unique." : "Run a scan to group duplicates"}
            hint="Exact matches use SHA-256; audio and images fall back to metadata plus fuzzy name matching."
          />
        ) : (
          <div className="dupgrid">
            {groups.map((group) => {
              const isOpen = open === group.id;
              const keeper = keepers[group.id] ?? keeperSuggestion(group).id;
              return (
                <div className="dupcard" key={group.id}>
                  <div className="dup-head" onClick={() => setOpen(isOpen ? null : group.id)}>
                    <span style={{ color: "var(--text-3)", width: 10 }}>{isOpen ? "▾" : "▸"}</span>
                    <span className="ellipsis" style={{ fontWeight: 560, fontSize: 12.5, minWidth: 0 }} title={group.label}>
                      {group.label}
                    </span>
                    <span className="spacer" />
                    <Badge tone={group.match === "exact" ? "ok" : "accent"}>{MATCH_LABEL[group.match]}</Badge>
                    <Badge>{group.confidence}%</Badge>
                    <span className="badge tnum">{group.files.length}×</span>
                    <span className="hint tnum" style={{ minWidth: 62, textAlign: "right" }}>
                      {humanBytes(group.reclaimable)}
                    </span>
                  </div>

                  {isOpen ? (
                    <div className="dup-files">
                      {group.files.map((file) => {
                        const isKeeper = file.id === keeper;
                        return (
                          <div className="dupfile" key={file.id} title={file.path}>
                            <button
                              className="checkbox btn"
                              style={{
                                padding: 0,
                                width: 14,
                                height: 14,
                                justifyContent: "center",
                                borderRadius: 4,
                                borderColor: pending.has(file.id) ? "var(--danger)" : undefined,
                                background: pending.has(file.id) ? "var(--danger)" : undefined,
                                color: pending.has(file.id) ? "#fff" : "transparent",
                              }}
                              aria-label={`Recycle ${file.name}`}
                              onClick={() => onTogglePending(file.id)}
                              disabled={isKeeper}
                            >
                              ✓
                            </button>
                            <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
                              <KindDot kind={file.kind} />
                              <span className="ellipsis mono" style={{ fontSize: 11.5 }}>
                                {file.folder}\{file.name}
                              </span>
                            </span>
                            <span className="hint tnum">{humanBytes(file.size)}</span>
                            {isKeeper ? (
                              <span className="keepflag">keep</span>
                            ) : (
                              <button className="btn tiny ghost" onClick={() => setKeeper(group.id, file.id)}>
                                keep this
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="footbar">
        <button className="btn tiny" onClick={onSelectAllButKeepers} disabled={groups.length === 0}>
          Select extras
        </button>
        <span className="hint">
          {pending.size} file{pending.size === 1 ? "" : "s"} · {humanBytes(pendingBytes)}
        </span>
        <span className="spacer" />
        <button className="btn danger" disabled={busy || pending.size === 0} onClick={onDelete}>
          Recycle {pending.size} file{pending.size === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
