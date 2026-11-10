import type { CSSProperties, ReactNode } from "react";

export type IconName =
  | "sort"
  | "duplicate"
  | "pencil"
  | "folder"
  | "sparkles"
  | "history"
  | "search"
  | "chevronRight"
  | "chevronDown"
  | "check"
  | "close"
  | "play"
  | "pause"
  | "undo"
  | "refresh"
  | "sliders"
  | "download"
  | "plus"
  | "trash"
  | "image"
  | "music"
  | "video"
  | "doc"
  | "archive"
  | "code"
  | "file"
  | "alert"
  | "star"
  | "arrowRight"
  | "grid"
  | "external"
  | "info"
  | "lock"
  | "clock"
  | "zap"
  | "palette"
  | "command"
  | "scan"
  | "layers";

const S: Record<IconName, ReactNode> = {
  sort: <path d="M7 4v16M7 4L4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" />,
  duplicate: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 012-2h9" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17z" />
      <path d="M14 6l4 4" />
    </>
  ),
  folder: <path d="M3 8a2 2 0 012-2h3.6l2 2H19a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  sparkles: (
    <>
      <path d="M11 3l1.7 4.3L17 9l-4.3 1.7L11 15l-1.7-4.3L5 9l4.3-1.7z" />
      <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.7L3 8" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4.5l3 1.7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronDown: <path d="M5 9l7 7 7-7" />,
  check: <path d="M4 12.5l5 5L20 6.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="7" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="13.6" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h9a6 6 0 016 6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 11-2.4-5.7" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h6M14 7h6M4 17h10M18 17h2" />
      <circle cx="12" cy="7" r="2" />
      <circle cx="16" cy="17" r="2" />
    </>
  ),
  download: <path d="M12 4v10M12 14l-4-4M12 14l4-4M5 19h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />,
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="M21 16l-5-5-8 8" />
    </>
  ),
  music: (
    <>
      <circle cx="7" cy="17" r="3" />
      <circle cx="18" cy="15" r="3" />
      <path d="M10 17V8l11-2v9" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" />
    </>
  ),
  doc: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4.5" rx="1.4" />
      <path d="M5 8.5V19h14V8.5M10 12h4" />
    </>
  ),
  code: <path d="M9 8l-5 4 5 4M15 8l5 4-5 4" />,
  file: <path d="M6 3h8l4 4v14H6z" />,
  alert: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17.2v.2" />
    </>
  ),
  star: <path d="M12 4l2.4 5 5.6.8-4 4 1 5.6L12 16.8 6.9 19.4l1-5.6-4-4L9.6 9z" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6M20 4l-8 8" />
      <path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.2" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10" rx="2" />
      <path d="M8 10V7.5a4 4 0 018 0V10" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  zap: <path d="M13 3L5 14h5l-1 7 8-11h-5z" />,
  palette: (
    <>
      <path d="M12 3a9 9 0 000 18 2.2 2.2 0 002.2-2.2c0-1.5 1.2-2.3 2.6-2.3H19a2 2 0 002-2A9.5 9.5 0 0012 3z" />
      <circle cx="8" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  command: <path d="M9 6a2.5 2.5 0 10-2.5 2.5H9V6zm0 0h6M9 18a2.5 2.5 0 11-2.5-2.5H9V18zm6-12a2.5 2.5 0 112.5 2.5H15V6zm0 12a2.5 2.5 0 102.5-2.5H15V18zm0-12v12H9V6z" />,
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 12l9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V6a2 2 0 012-2h2M20 8V6a2 2 0 00-2-2h-2M4 16v2a2 2 0 002 2h2M20 16v2a2 2 0 01-2 2h-2" />
      <path d="M4 12h16" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.7,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flex: "0 0 auto", ...style }}
      aria-hidden="true"
      focusable="false"
    >
      {S[name]}
    </svg>
  );
}

/** Kind → icon mapping used by the file list and preview. */
export const KIND_ICON: Record<string, IconName> = {
  image: "image",
  video: "video",
  audio: "music",
  document: "doc",
  archive: "archive",
  code: "code",
  other: "file",
};
