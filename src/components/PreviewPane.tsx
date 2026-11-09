import { useEffect, useMemo, useState } from "react";
import {
  formatDate,
  gradientFor,
  humanBytes,
  humanDuration,
  waveform,
} from "../lib/organizer/engine";
import { KIND_CONFIG, type AppFile } from "../lib/organizer/types";
import { Badge, Empty, KindDot } from "./ui";

function Waveform({ seed, progress, bars = 42 }: { seed: string; progress: number; bars?: number }) {
  const data = useMemo(() => waveform(seed, bars), [seed, bars]);
  return (
    <div className="waveform" aria-hidden="true">
      {data.map((value, i) => (
        <i
          key={i}
          className={i / bars <= progress ? "played" : undefined}
          style={{ height: `${Math.round(value * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function PreviewPane({
  file,
  targetFolder,
  onReveal,
}: {
  file: AppFile | null;
  targetFolder?: string;
  onReveal: (path: string) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
  }, [file?.id]);

  useEffect(() => {
    if (!playing || !file?.duration) return;
    const tick = 200;
    const timer = window.setInterval(() => {
      setProgress((p) => {
        const next = p + tick / 1000 / file.duration!;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
    }, tick);
    return () => window.clearInterval(timer);
  }, [playing, file?.duration]);

  if (!file) {
    return (
      <div className="panel preview">
        <div className="panel-head">
          <span className="panel-title">Preview</span>
        </div>
        <Empty title="Nothing selected" hint="Pick a file on the left to inspect it, or press Space on a row." />
      </div>
    );
  }

  const meta = KIND_CONFIG[file.kind];
  const elapsed = Math.round((file.duration ?? 0) * progress);

  return (
    <div className="panel preview">
      <div className="panel-head">
        <KindDot kind={file.kind} />
        <span className="panel-title">{meta.label}</span>
        <span className="spacer" />
        <span className="badge">{file.ext ? file.ext.toUpperCase() : "NO EXT"}</span>
      </div>

      <div className="panel-body">
        <div className="pad stack fade-in" key={file.id}>
          {file.kind === "image" ? (
            <div
              className="thumb"
              style={{ background: gradientFor(file.name, meta.color), borderColor: "transparent" }}
            >
              <span style={{ fontSize: 34, color: "rgba(255,255,255,.85)", textShadow: "0 2px 12px rgba(0,0,0,.4)" }}>
                {meta.glyph}
              </span>
              <div className="overlay">
                <span>
                  {file.width}×{file.height}
                </span>
                <span>{humanBytes(file.size)}</span>
              </div>
            </div>
          ) : null}

          {file.kind === "audio" ? (
            <>
              <Waveform seed={file.name} progress={progress} />
              <div className="player">
                <button className="btn tiny primary" onClick={() => setPlaying((p) => !p)}>
                  {playing ? "❚❚ Pause" : "▶ Play"}
                </button>
                <span className="mono tnum">
                  {humanDuration(elapsed)} / {humanDuration(file.duration)}
                </span>
                <span className="spacer" />
                <span className="hint">42-band preview</span>
              </div>
            </>
          ) : null}

          {file.kind === "video" ? (
            <div
              className="thumb"
              style={{ background: gradientFor(file.name, meta.color), borderColor: "transparent" }}
            >
              <span style={{ fontSize: 30, color: "rgba(255,255,255,.9)" }}>▶</span>
              <div className="overlay">
                <span>
                  {file.width}×{file.height}
                </span>
                <span>{humanDuration(file.duration)}</span>
              </div>
            </div>
          ) : null}

          {file.kind !== "image" && file.kind !== "video" && file.kind !== "audio" ? (
            <div className="thumb" style={{ aspectRatio: "16 / 7" }}>
              <span style={{ fontSize: 30, color: meta.color }}>{meta.glyph}</span>
            </div>
          ) : null}

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, wordBreak: "break-word" }}>{file.name}</div>
            <div className="hint mono" style={{ marginTop: 3, wordBreak: "break-all" }}>
              {file.path}
            </div>
          </div>

          <div className="meta">
            <div>
              <div className="mk">Size</div>
              <div className="mv">{humanBytes(file.size)}</div>
            </div>
            <div>
              <div className="mk">Modified</div>
              <div className="mv">{formatDate(file.modified, true)}</div>
            </div>
            <div>
              <div className="mk">Folder</div>
              <div className="mv">{file.folder}</div>
            </div>
            <div>
              <div className="mk">Kind</div>
              <div className="mv">{meta.label}</div>
            </div>
            {file.width ? (
              <div>
                <div className="mk">Dimensions</div>
                <div className="mv">
                  {file.width}×{file.height}
                </div>
              </div>
            ) : null}
            {file.duration ? (
              <div>
                <div className="mk">Duration</div>
                <div className="mv">{humanDuration(file.duration)}</div>
              </div>
            ) : null}
            {file.hash ? (
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="mk">SHA-256</div>
                <div className="mv">{file.hash}…</div>
              </div>
            ) : null}
          </div>

          {file.textPreview ? (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Text preview
              </div>
              <div className="textprev">{file.textPreview}</div>
            </div>
          ) : null}

          {targetFolder ? (
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="label">Arranges into</span>
              <Badge tone="accent">{targetFolder}</Badge>
            </div>
          ) : null}

          <button className="btn" onClick={() => onReveal(file.path)}>
            Open containing folder
          </button>
        </div>
      </div>
    </div>
  );
}
