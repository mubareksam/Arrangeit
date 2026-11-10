import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assetUrl, inspectFile, isTauri, type FileInfo } from "../lib/organizer/bridge";
import { formatDate, humanBytes, humanDuration, waveform } from "../lib/organizer/engine";
import { KIND_CONFIG, type AppFile } from "../lib/organizer/types";
import { Icon, KIND_ICON } from "./Icon";
import { Badge, Empty, KindDot } from "./ui";

const BARS = 56;

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
          const from = i * block;
          const to = Math.min(from + block, channel.length);
          const stride = Math.max(1, Math.floor((to - from) / 400));
          for (let j = from; j < to; j += stride) peak = Math.max(peak, Math.abs(channel[j]));
          values.push(Math.max(0.05, Math.min(1, peak)));
        }
        const max = Math.max(...values, 0.001);
        if (!cancelled) setPeaks(values.map((value) => Math.max(0.05, value / max)));
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
  autoPlay = false,
  audition = false,
}: {
  file: AppFile | null;
  targetFolder?: string;
  onReveal: (path: string) => void;
  /** Smart audition: audio starts playing as soon as the file is selected. */
  autoPlay?: boolean;
  /** Shows the audition badge in the header. */
  audition?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  const [info, setInfo] = useState<FileInfo | null>(null);
  const { peaks, error: waveformError } = useWaveform(file);

  // Only ask the disk for the expensive details of the file being shown.
  useEffect(() => {
    setInfo(null);
    if (!file || !isTauri()) return;
    const needs =
      (file.kind === "image" && !file.width) ||
      ((file.kind === "audio" || file.kind === "video") && !file.duration) ||
      ((file.kind === "document" || file.kind === "code") && !file.textPreview);
    if (!needs) return;
    let cancelled = false;
    inspectFile(file.path)
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [file]);

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
  const canPlay = Boolean(url) && !mediaError;

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

  // Audition mode: selecting an audio file plays it immediately. Browsers only
  // allow this after a user gesture, and clicking a row in the list *is* one.
  useEffect(() => {
    if (!autoPlay || !file || file.kind !== "audio") return;
    const audio = audioRef.current;
    if (!audio) return;
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      void audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => undefined);
    };
    if (audio.readyState >= 2) start();
    else audio.addEventListener("loadeddata", start, { once: true });
    return () => {
      cancelled = true;
      audio.removeEventListener("loadeddata", start);
    };
  }, [autoPlay, file?.id, file?.kind]);

  const seek = useCallback((fraction: number) => {
    setProgress(fraction);
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration)) audio.currentTime = audio.duration * fraction;
  }, []);

  if (!file) {
    return (
      <div className="panel preview">
        <div className="preview-head">
          <Icon name="image" size={14} />
          <span className="panel-title">Preview</span>
        </div>
        <Empty icon="image" title="Nothing selected" hint="Pick a file to see its preview, metadata and planned destination." />
      </div>
    );
  }

  const meta = KIND_CONFIG[file.kind];
  const width = file.width ?? info?.width;
  const height = file.height ?? info?.height;
  const duration = file.duration ?? info?.duration;
  const text = file.textPreview ?? info?.textPreview;
  const elapsed = (duration ?? 0) * progress;

  return (
    <div className="panel preview">
      <div className="preview-head">
        <Icon name="image" size={14} />
        <span className="panel-title">Preview</span>
        <span className="panel-sub">· {meta.label}</span>
        <span className="spacer" />
        {audition && autoPlay ? (
          <span className="audition-flag" title="Smart audition is on — audio plays as you browse">
            <Icon name="play" size={9} strokeWidth={2.6} /> audition
          </span>
        ) : null}
        <KindDot kind={file.kind} />
        {file.ext ? <Badge>{file.ext.toUpperCase()}</Badge> : null}
      </div>

      <div className="panel-body">
        <div className="pad stack fade" key={file.id}>
          {file.kind === "image" ? (
            canPlay ? (
              <div className="media">
                <img src={url} alt={file.name} loading="lazy" onError={() => setMediaError(true)} style={{ maxHeight: 240 }} />
              </div>
            ) : (
              <div className="media">
                <div className="fallback">
                  <Icon name="image" size={22} />
                  {isTauri() ? "Image could not be decoded" : "Image preview needs the desktop app"}
                  {width ? (
                    <span className="mono" style={{ fontSize: 10 }}>
                      {width}×{height}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          ) : null}

          {file.kind === "video" ? (
            canPlay ? (
              <div className="media">
                <video src={url} controls preload="metadata" onError={() => setMediaError(true)} style={{ maxHeight: 220 }} />
              </div>
            ) : (
              <div className="media">
                <div className="fallback">
                  <Icon name="video" size={22} />
                  {isTauri() ? "Video could not be opened" : "Video preview needs the desktop app"}
                  <span className="mono" style={{ fontSize: 10 }}>
                    {width && height ? `${width}×${height} · ` : ""}
                    {humanDuration(duration)}
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
                {bars.map((value, index) => (
                  <i
                    key={index}
                    className={index / bars.length <= progress ? "on" : undefined}
                    style={{ height: `${Math.round(value * 100)}%` }}
                  />
                ))}
              </div>
              <div className="player">
                <button className="btn sm" onClick={() => void togglePlay()} disabled={!canPlay}>
                  <Icon name={playing ? "pause" : "play"} size={11} />
                  {playing ? "Pause" : "Play"}
                </button>
                <span className="tnum">
                  {humanDuration(elapsed)} / {humanDuration(duration)}
                </span>
                <span className="spacer" />
                <span className="hint">{peaks ? "decoded" : waveformError ? "waveform n/a" : "waveform"}</span>
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
            <div className="media" style={{ minHeight: 84 }}>
              <div className="fallback" style={{ color: meta.color }}>
                <Icon name={KIND_ICON[file.kind] ?? "file"} size={24} />
                <span style={{ color: "var(--text-3)" }}>{text ? "Text preview below" : "No inline preview"}</span>
              </div>
            </div>
          ) : null}

          <div>
            <div style={{ fontWeight: 600, fontSize: 12.5, wordBreak: "break-word" }}>{file.name}</div>
            <div className="hint mono" style={{ wordBreak: "break-all", marginTop: 2 }}>
              {file.path}
            </div>
          </div>

          {text ? <pre className="textprev">{text}</pre> : null}

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
            {width && height ? (
              <div className="meta-row">
                <span className="k">Dimensions</span>
                <span className="v">
                  {width}×{height}
                </span>
              </div>
            ) : null}
            {duration ? (
              <div className="meta-row">
                <span className="k">Duration</span>
                <span className="v">{humanDuration(duration)}</span>
              </div>
            ) : null}
            {info?.audioBitrate ? (
              <div className="meta-row">
                <span className="k">Bitrate</span>
                <span className="v">{info.audioBitrate} kbps</span>
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
              <Icon name="external" size={12} /> Show in Explorer
            </button>
            <button className="btn sm" onClick={() => void navigator.clipboard?.writeText(file.path)} title="Copy path">
              <Icon name="duplicate" size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
