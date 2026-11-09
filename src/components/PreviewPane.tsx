import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assetUrl, isTauri } from "../lib/organizer/bridge";
import { formatDate, humanBytes, humanDuration, waveform } from "../lib/organizer/engine";
import { KIND_CONFIG, type AppFile } from "../lib/organizer/types";
import { Badge, Empty, KindDot } from "./ui";

const BARS = 56;

/** Decodes the real file to real peak values; falls back to a deterministic shape. */
function useWaveform(file: AppFile | null) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setPeaks(null);
    setError(false);
    if (!file || file.kind !== "audio" || !isTauri()) return;

    let cancelled = false;
    const url = assetUrl(file.path);
    (async () => {
      try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(buffer);
        const channel = audio.getChannelData(0);
        const block = Math.floor(channel.length / BARS) || 1;
        const values: number[] = [];
        for (let i = 0; i < BARS; i += 1) {
          let peak = 0;
          const start = i * block;
          const end = Math.min(start + block, channel.length);
          // stride for long files so this stays fast
          const stride = Math.max(1, Math.floor((end - start) / 512));
          for (let j = start; j < end; j += stride) peak = Math.max(peak, Math.abs(channel[j]));
          values.push(Math.max(0.06, Math.min(1, peak)));
        }
        const max = Math.max(...values, 0.001);
        if (!cancelled) setPeaks(values.map((v) => Math.max(0.06, v / max)));
        void ctx.close();
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  return { peaks, error };
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  const { peaks, error: waveformError } = useWaveform(file);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setMediaError(false);
  }, [file?.id]);

  const bars = useMemo(() => {
    if (peaks) return peaks;
    return waveform(file?.name ?? "empty", BARS);
  }, [peaks, file?.name]);

  const url = file ? assetUrl(file.path) : "";
  const canPlayMedia = Boolean(url) && !mediaError;

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setMediaError(true);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, []);

  const seek = useCallback(
    (fraction: number) => {
      setProgress(fraction);
      const audio = audioRef.current;
      if (audio && Number.isFinite(audio.duration)) audio.currentTime = audio.duration * fraction;
    },
    [],
  );

  if (!file) {
    return (
      <div className="panel preview">
        <div className="preview-head">
          <span className="panel-title">Preview</span>
        </div>
        <Empty title="Nothing selected" hint="Select a file to see its preview, metadata and planned destination." />
      </div>
    );
  }

  const meta = KIND_CONFIG[file.kind];
  const elapsed = (file.duration ?? 0) * progress;

  return (
    <div className="panel preview">
      <div className="preview-head">
        <KindDot kind={file.kind} />
        <span className="panel-title">{meta.label}</span>
        <span className="spacer" />
        {file.ext ? <Badge>{file.ext.toUpperCase()}</Badge> : null}
      </div>

      <div className="panel-body">
        <div className="pad stack fade" key={file.id}>
          {/* ---------- media ---------- */}
          {file.kind === "image" ? (
            canPlayMedia ? (
              <div className="media">
                <img
                  src={url}
                  alt={file.name}
                  loading="lazy"
                  onError={() => setMediaError(true)}
                  style={{ maxHeight: 240 }}
                />
              </div>
            ) : (
              <div className="media">
                <div className="fallback">
                  <span className="big">▣</span>
                  {isTauri() ? "Image could not be decoded" : "Image preview needs the desktop app"}
                  <span className="mono" style={{ fontSize: 10 }}>
                    {file.width}×{file.height}
                  </span>
                </div>
              </div>
            )
          ) : null}

          {file.kind === "video" ? (
            canPlayMedia ? (
              <div className="media">
                <video
                  src={url}
                  controls
                  preload="metadata"
                  onError={() => setMediaError(true)}
                  style={{ maxHeight: 220 }}
                />
              </div>
            ) : (
              <div className="media">
                <div className="fallback">
                  <span className="big">▶</span>
                  {isTauri() ? "Video could not be opened" : "Video preview needs the desktop app"}
                  <span className="mono" style={{ fontSize: 10 }}>
                    {file.width}×{file.height} · {humanDuration(file.duration)}
                  </span>
                </div>
              </div>
            )
          ) : null}

          {file.kind === "audio" ? (
            <>
              <div
                className="waveform"
                role="slider"
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                tabIndex={0}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  seek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
                }}
              >
                {bars.map((value, i) => (
                  <i key={i} className={i / bars.length <= progress ? "on" : undefined} style={{ height: `${Math.round(value * 100)}%` }} />
                ))}
              </div>
              <div className="player">
                <button className="btn sm" onClick={() => void togglePlay()} disabled={!canPlayMedia}>
                  {playing ? "❚❚" : "▶"} {playing ? "Pause" : "Play"}
                </button>
                <span className="tnum">
                  {humanDuration(elapsed)} / {humanDuration(file.duration)}
                </span>
                <span className="spacer" />
                <span className="hint">
                  {peaks ? "Real peaks" : waveformError ? "Waveform unavailable" : isTauri() ? "Waveform" : "Demo waveform"}
                </span>
              </div>
              {url ? (
                <audio
                  ref={audioRef}
                  src={url}
                  preload="metadata"
                  onTimeUpdate={(e) => {
                    const el = e.currentTarget;
                    if (Number.isFinite(el.duration) && el.duration > 0) setProgress(el.currentTime / el.duration);
                  }}
                  onEnded={() => {
                    setPlaying(false);
                    setProgress(1);
                  }}
                  onError={() => setMediaError(true)}
                />
              ) : null}
            </>
          ) : null}

          {file.kind !== "image" && file.kind !== "video" && file.kind !== "audio" ? (
            <div className="media" style={{ minHeight: 96 }}>
              <div className="fallback">
                <span className="big" style={{ color: meta.color }}>
                  {meta.glyph}
                </span>
                {file.textPreview ? "Text preview below" : "No inline preview for this type"}
              </div>
            </div>
          ) : null}

          {/* ---------- identity ---------- */}
          <div>
            <div style={{ fontWeight: 600, fontSize: 12.5, wordBreak: "break-word" }}>{file.name}</div>
            <div className="hint mono" style={{ wordBreak: "break-all", marginTop: 2 }}>
              {file.path}
            </div>
          </div>

          {file.textPreview ? <pre className="textprev">{file.textPreview}</pre> : null}

          <div className="meta-list">
            <div className="meta-row">
              <span className="k">Size</span>
              <span className="v">{humanBytes(file.size)}</span>
            </div>
            <div className="meta-row">
              <span className="k">Modified</span>
              <span className="v">{formatDate(file.modified, true)}</span>
            </div>
            <div className="meta-row">
              <span className="k">Folder</span>
              <span className="v">{file.folder}</span>
            </div>
            {file.width ? (
              <div className="meta-row">
                <span className="k">Dimensions</span>
                <span className="v">
                  {file.width}×{file.height}
                </span>
              </div>
            ) : null}
            {file.duration ? (
              <div className="meta-row">
                <span className="k">Duration</span>
                <span className="v">{humanDuration(file.duration)}</span>
              </div>
            ) : null}
            {file.hash ? (
              <div className="meta-row">
                <span className="k">SHA-256</span>
                <span className="v" title={file.hash}>
                  {file.hash.slice(0, 16)}…
                </span>
              </div>
            ) : null}
          </div>

          {targetFolder ? (
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="label">Planned folder</span>
              <Badge tone="accent">{targetFolder}</Badge>
            </div>
          ) : null}

          <div className="row">
            <button className="btn sm block" onClick={() => onReveal(file.path)} disabled={!isTauri()}>
              Show in Explorer
            </button>
            <button
              className="btn sm"
              onClick={() => void navigator.clipboard?.writeText(file.path)}
              title="Copy path"
            >
              ⇢
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
