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

export type ArrangeMode = "date" | "type" | "size" | "similarity" | "name" | "ext";
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
}

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

export type DuplicateMatch = "exact" | "audio" | "image" | "name";

export interface DuplicateOptions {
  byHash: boolean;
  byAudio: boolean;
  byImage: boolean;
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
  | "music"
  | "film"
  | "camera"
  | "briefcase"
  | "flask";

export const FOLDER_GLYPHS: { id: FolderGlyph; label: string; glyph: string }[] = [
  { id: "folder", label: "Folder", glyph: "🗀" },
  { id: "star", label: "Star", glyph: "★" },
  { id: "book", label: "Book", glyph: "📖" },
  { id: "music", label: "Music", glyph: "♪" },
  { id: "film", label: "Film", glyph: "▶" },
  { id: "camera", label: "Camera", glyph: "◉" },
  { id: "briefcase", label: "Work", glyph: "▤" },
  { id: "flask", label: "Lab", glyph: "⚗" },
];

export interface FolderStyle {
  folder: string;
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
