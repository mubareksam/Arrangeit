/**
 * Core domain types for ArrangeIt.
 *
 * Every value that crosses the Rust <-> JS boundary is plain JSON, so these
 * shapes are mirrored 1:1 by the `AppFile` / result structs in
 * `src-tauri/src/main.rs`.
 */

export type FileKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "archive"
  | "code"
  | "other";

export interface AppFile {
  id: string;
  name: string;
  /** Full absolute path, Windows-style in production. */
  path: string;
  /** Parent folder name, used by the "keep folder structure" rules. */
  folder: string;
  /** Lowercase, no leading dot. Empty string when there is no extension. */
  ext: string;
  size: number;
  kind: FileKind;
  /** ISO-8601 timestamp. */
  modified: string;
  hash?: string;
  width?: number;
  height?: number;
  /** Seconds, audio + video only. */
  duration?: number;
  textPreview?: string;
}

export interface KindMeta {
  label: string;
  plural: string;
  glyph: string;
  color: string;
  extensions: string[];
}

export const KIND_CONFIG: Record<FileKind, KindMeta> = {
  image: {
    label: "Image",
    plural: "Images",
    glyph: "▣",
    color: "#38bdf8",
    extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic", "avif", "raw", "cr2", "nef"],
  },
  video: {
    label: "Video",
    plural: "Videos",
    glyph: "▶",
    color: "#f472b6",
    extensions: ["mp4", "mkv", "mov", "avi", "wmv", "webm", "flv", "m4v", "mpg", "mpeg", "ts"],
  },
  audio: {
    label: "Audio",
    plural: "Audio",
    glyph: "♪",
    color: "#a78bfa",
    extensions: ["mp3", "wav", "flac", "aac", "ogg", "opus", "m4a", "wma", "aiff", "alac", "mid"],
  },
  document: {
    label: "Document",
    plural: "Documents",
    glyph: "≡",
    color: "#fbbf24",
    extensions: ["pdf", "doc", "docx", "txt", "rtf", "odt", "xls", "xlsx", "csv", "ppt", "pptx", "epub", "md", "pages", "numbers"],
  },
  archive: {
    label: "Archive",
    plural: "Archives",
    glyph: "⌸",
    color: "#fb923c",
    extensions: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso", "cab"],
  },
  code: {
    label: "Code",
    plural: "Code",
    glyph: "⌘",
    color: "#34d399",
    extensions: ["ts", "tsx", "js", "jsx", "rs", "py", "go", "java", "c", "cpp", "h", "cs", "rb", "php", "sh", "json", "yml", "yaml", "toml", "sql", "html", "css"],
  },
  other: {
    label: "Other",
    plural: "Other",
    glyph: "◆",
    color: "#94a3b8",
    extensions: [],
  },
};

export const ALL_EXTENSIONS: Record<string, FileKind> = Object.entries(KIND_CONFIG).reduce(
  (acc, [kind, meta]) => {
    for (const ext of meta.extensions) acc[ext] = kind as FileKind;
    return acc;
  },
  {} as Record<string, FileKind>,
);

/* ------------------------------------------------------------------ */
/* Arrange                                                             */
/* ------------------------------------------------------------------ */

export type ArrangeMode = "date" | "type" | "size" | "similarity" | "name" | "ext" | "profession" | "smart";
export type DateGranularity = "year" | "month" | "day";
export type ArrangeAction = "move" | "copy";

export interface SizeRange {
  id: string;
  label: string;
  min: number;
  /** Exclusive upper bound; `null` means "no limit". */
  max: number | null;
}

export const DEFAULT_SIZE_RANGES: SizeRange[] = [
  { id: "tiny", label: "Tiny  (< 1 MB)", min: 0, max: 1_000_000 },
  { id: "small", label: "Small  (1–10 MB)", min: 1_000_000, max: 10_000_000 },
  { id: "medium", label: "Medium  (10–100 MB)", min: 10_000_000, max: 100_000_000 },
  { id: "large", label: "Large  (100 MB–1 GB)", min: 100_000_000, max: 1_000_000_000 },
  { id: "huge", label: "Huge  (> 1 GB)", min: 1_000_000_000, max: null },
];

export interface ArrangeRule {
  mode: ArrangeMode;
  dateGranularity: DateGranularity;
  sizeRanges: SizeRange[];
  /** 0–100, how close names must be to land in the same similarity bucket. */
  similarityThreshold: number;
  action: ArrangeAction;
  dryRun: boolean;
  /** `${profession}:${style}` — only used when `mode` is "profession". */
  structureId: string;
  /** Knobs for "smart" mode. */
  smart: SmartOptions;
}

/** What smart arrange is allowed to do. */
export interface SmartOptions {
  /** Top-level folders per discipline when the mix is genuinely mixed. */
  splitDisciplines: boolean;
  /** Group files that share a project name into one folder. */
  projectFolders: boolean;
  /** Add a year folder when the files span several years. */
  yearArchive: boolean;
}

export const DEFAULT_SMART_OPTIONS: SmartOptions = {
  splitDisciplines: true,
  projectFolders: true,
  yearArchive: false,
};

export interface ArrangeItem {
  file: AppFile;
  targetFolder: string;
  targetPath: string;
  /** `collision` when a file with the same name already sits in the bucket. */
  status: "ok" | "collision";
}

export interface ArrangeSummaryRow {
  folder: string;
  count: number;
  bytes: number;
  kinds: FileKind[];
  status: "ok" | "collision";
}

/* ------------------------------------------------------------------ */
/* Duplicates                                                          */
/* ------------------------------------------------------------------ */

export type DuplicateMatch = "exact" | "audio" | "image" | "video" | "visual" | "name";

export interface DuplicateOptions {
  byHash: boolean;
  byAudio: boolean;
  byImage: boolean;
  /** Perceptual (dHash) comparison of image content. */
  byVisual: boolean;
  byName: boolean;
  /** 0–100 name similarity floor for fuzzy matching. */
  fuzzy: number;
}

export interface DuplicateGroup {
  id: string;
  label: string;
  match: DuplicateMatch;
  /** 0–100 confidence; exact hash matches are always 100. */
  confidence: number;
  size: number;
  files: AppFile[];
  /** Bytes recoverable if every copy but the keeper is removed. */
  reclaimable: number;
}

/* ------------------------------------------------------------------ */
/* Rename                                                              */
/* ------------------------------------------------------------------ */

export type CaseMode = "keep" | "lower" | "upper" | "title";

export interface RenameOptions {
  pattern: string;
  find: string;
  replace: string;
  caseMode: CaseMode;
  startIndex: number;
  seqPadding: number;
}

/** A folder rename row — same shape as a file row, without size/kind. */
export interface FolderRenameRow {
  id: string;
  name: string;
  path: string;
  nextName: string;
  changed: boolean;
  conflict: boolean;
  error?: string;
}

export interface RenameRow {
  file: AppFile;
  nextName: string;
  changed: boolean;
  conflict: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Folder styles                                                       */
/* ------------------------------------------------------------------ */

export type FolderGlyph =
  | "folder"
  | "star"
  | "book"
  | "film"
  | "music"
  | "camera"
  | "briefcase"
  | "flask"
  | "heart"
  | "bolt"
  | "cloud"
  | "shield"
  | "gear"
  | "leaf"
  | "flame"
  | "moon"
  | "sun"
  | "plane"
  | "cart"
  | "home"
  | "key"
  | "clock"
  | "layers"
  | "terminal"
  | "gamepad";

/** 25 drawable badge shapes — each one is rendered into the .ico by the Rust side. */
export const FOLDER_GLYPHS: { id: FolderGlyph; label: string; glyph: string }[] = [
  { id: "folder", label: "Folder", glyph: "🗀" },
  { id: "star", label: "Star", glyph: "★" },
  { id: "book", label: "Book", glyph: "▤" },
  { id: "film", label: "Film", glyph: "▶" },
  { id: "music", label: "Music", glyph: "♪" },
  { id: "camera", label: "Camera", glyph: "◉" },
  { id: "briefcase", label: "Briefcase", glyph: "▥" },
  { id: "flask", label: "Flask", glyph: "⚗" },
  { id: "heart", label: "Heart", glyph: "♥" },
  { id: "bolt", label: "Bolt", glyph: "ϟ" },
  { id: "cloud", label: "Cloud", glyph: "☁" },
  { id: "shield", label: "Shield", glyph: "⛨" },
  { id: "gear", label: "Gear", glyph: "⚙" },
  { id: "leaf", label: "Leaf", glyph: "❧" },
  { id: "flame", label: "Flame", glyph: "♨" },
  { id: "moon", label: "Moon", glyph: "☾" },
  { id: "sun", label: "Sun", glyph: "☀" },
  { id: "plane", label: "Plane", glyph: "✈" },
  { id: "cart", label: "Cart", glyph: "🛒" },
  { id: "home", label: "Home", glyph: "⌂" },
  { id: "key", label: "Key", glyph: "⚿" },
  { id: "clock", label: "Clock", glyph: "◷" },
  { id: "layers", label: "Layers", glyph: "▤" },
  { id: "terminal", label: "Terminal", glyph: ">_" },
  { id: "gamepad", label: "Gamepad", glyph: "◍" },
];

export interface StylePreset {
  id: string;
  label: string;
  glyph: FolderGlyph;
  color: string;
  tooltip: string;
}

/** One-click looks for the folders people actually keep. */
export const STYLE_PRESETS: StylePreset[] = [
  { id: "archive", label: "Archive", glyph: "briefcase", color: "#94a3b8", tooltip: "Cold storage" },
  { id: "images", label: "Images", glyph: "camera", color: "#38bdf8", tooltip: "Photos & screenshots" },
  { id: "audio", label: "Audio", glyph: "music", color: "#a78bfa", tooltip: "Music & recordings" },
  { id: "video", label: "Video", glyph: "film", color: "#f472b6", tooltip: "Footage & clips" },
  { id: "docs", label: "Documents", glyph: "book", color: "#fbbf24", tooltip: "Papers & invoices" },
  { id: "code", label: "Code", glyph: "terminal", color: "#34d399", tooltip: "Repos & scripts" },
  { id: "projects", label: "Projects", glyph: "layers", color: "#5b9dff", tooltip: "Active work" },
  { id: "games", label: "Games", glyph: "gamepad", color: "#c084fc", tooltip: "Saves & installs" },
  { id: "finance", label: "Finance", glyph: "cart", color: "#4ade80", tooltip: "Taxes & receipts" },
  { id: "travel", label: "Travel", glyph: "plane", color: "#22d3ee", tooltip: "Trips & tickets" },
  { id: "home", label: "Home", glyph: "home", color: "#fb923c", tooltip: "Personal & household" },
  { id: "secure", label: "Private", glyph: "key", color: "#f43f5e", tooltip: "Restricted" },
  { id: "temp", label: "Temp", glyph: "clock", color: "#8b95a5", tooltip: "Safe to delete" },
  { id: "backup", label: "Backup", glyph: "shield", color: "#2dd4bf", tooltip: "Recovery copies" },
  { id: "favourites", label: "Favourites", glyph: "star", color: "#eab308", tooltip: "Best of" },
  { id: "ideas", label: "Ideas", glyph: "bolt", color: "#f59e0b", tooltip: "Sparks & drafts" },
];

export interface FolderStyle {
  folder: string;
  /** Absolute folder path — lets you style any directory, not just subfolders of the scan root. */
  path?: string;
  glyph: FolderGlyph;
  /** Hex accent used for the tile and the generated `.ico` name. */
  color: string;
  tooltip: string;
  hideSystemFiles: boolean;
  /** Optional explicit icon path override (e.g. a custom .ico). */
  iconPath?: string;
}

export interface StyleStep {
  command: string;
  ok: boolean;
  detail: string;
}

/* ------------------------------------------------------------------ */
/* Activity log / undo                                                 */
/* ------------------------------------------------------------------ */

export type LogKind = "scan" | "arrange" | "duplicate" | "rename" | "style" | "undo" | "error";

export interface LogEntry {
  id: string;
  at: string;
  kind: LogKind;
  message: string;
  detail?: string;
}

export interface UndoOp {
  /** Path before the operation. */
  from: string;
  /** Path after the operation. Reverting moves `to` back to `from`. */
  to: string;
}

export interface UndoRecord {
  id: string;
  kind: LogKind;
  label: string;
  /** Human readable list of reversals, e.g. `a.jpg  /Inbox → /2024`. */
  entries: string[];
  /** Machine-readable moves, used by the `revert_files` command. */
  ops?: UndoOp[];
}

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

export type InsightKind = "duplicates" | "screenshots" | "large" | "stale" | "mixed" | "similar" | "unstyled" | "installers";

export interface Insight {
  /** Ids of the files this insight is talking about, so the UI can select them. */
  files?: string[];
  id: string;
  kind: InsightKind;
  title: string;
  detail: string;
  /** e.g. "412 MB reclaimable" */
  impact?: string;
  actionLabel: string;
  /** Where the action sends the user. */
  target: "duplicates" | "arrange" | "styles" | "files";
  rule?: Partial<ArrangeRule>;
  folder?: string;
  preset?: StylePreset;
  count?: number;
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export interface HistoryEntry {
  id: string;
  at: string;
  kind: LogKind;
  label: string;
  detail?: string;
  entries: string[];
  ops: UndoOp[];
  /** false once the paths it refers to have been reversed or cleaned up. */
  reversible: boolean;
}
