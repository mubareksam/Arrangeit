/**
 * Pure, dependency-free planning engine.
 *
 * Nothing in this file touches the filesystem — every function takes a list of
 * `AppFile`s and returns a *plan*. The Rust side executes the plan; the browser
 * demo renders it. That split is what makes dry-run, undo and instant previews
 * cheap (no per-file round trips, no I/O on the hot path).
 */

import {
  ALL_EXTENSIONS,
  DEFAULT_SIZE_RANGES,
  KIND_CONFIG,
  STYLE_PRESETS,
  type AppFile,
  type ArrangeItem,
  type ArrangeRule,
  type ArrangeSummaryRow,
  type DateGranularity,
  type DuplicateGroup,
  type DuplicateOptions,
  type FileKind,
  type FolderStyle,
  type Insight,
  type RenameOptions,
  type RenameRow,
  type SizeRange,
  type StylePreset,
  type StyleStep,
} from "./types";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

let seq = 0;
export const uid = (prefix = "id") => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name;
  return name.slice(0, dot);
}

export function classify(name: string): FileKind {
  return ALL_EXTENSIONS[extOf(name)] ?? "other";
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
  if (!withTime) return date;
  return `${date} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function humanDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Windows forbids `<>:"/\|?*` and trailing dots/spaces in file names. */
export function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/[. ]+$/g, "").trim();
}

/* ------------------------------------------------------------------ */
/* String similarity                                                   */
/* ------------------------------------------------------------------ */

function bigrams(value: string): Set<string> {
  const out = new Set<string>();
  const clean = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (let i = 0; i < clean.length - 1; i += 1) out.add(clean.slice(i, i + 2));
  return out;
}

/**
 * Sørensen–Dice coefficient over character bigrams, 0–100.
 * Mirrors the `strsim` similarity used on the Rust side so the browser demo and
 * the native scan agree on which files cluster together.
 */
export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return a.toLowerCase() === b.toLowerCase() ? 100 : 0;
  let overlap = 0;
  for (const g of A) if (B.has(g)) overlap += 1;
  return Math.round((200 * overlap) / (A.size + B.size));
}

/** Strips copy suffixes and track numbers so `song (1).mp3` ≈ `song.mp3`. */
export function normalizeStem(name: string): string {
  return stemOf(name)
    .toLowerCase()
    .replace(/\((?:copy|copie|\d+)\)/g, " ")
    .replace(/\bcopy\b/g, " ")
    .replace(/^\s*\d{1,3}[\s._-]+/, " ")
    .replace(/[\s._-]+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Buckets                                                             */
/* ------------------------------------------------------------------ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dateBucket(iso: string, granularity: DateGranularity): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  if (granularity === "year") return `${yyyy}`;
  if (granularity === "month") return `${yyyy}-${mm} ${MONTHS[d.getMonth()]}`;
  return `${yyyy}-${mm}-${`${d.getDate()}`.padStart(2, "0")}`;
}

export function sizeBucket(bytes: number, ranges: SizeRange[] = DEFAULT_SIZE_RANGES): string {
  const hit = ranges.find((r) => bytes >= r.min && (r.max === null || bytes < r.max));
  return hit ? hit.label.replace(/\s{2,}/g, " ") : "Uncategorised";
}

const NAME_BUCKETS: { label: string; test: (c: string) => boolean }[] = [
  { label: "0–9", test: (c) => /[0-9]/.test(c) },
  { label: "A–F", test: (c) => /[a-f]/i.test(c) },
  { label: "G–L", test: (c) => /[g-l]/i.test(c) },
  { label: "M–R", test: (c) => /[m-r]/i.test(c) },
  { label: "S–Z", test: (c) => /[s-z]/i.test(c) },
];

export function nameBucket(name: string): string {
  const first = normalizeStem(name).charAt(0);
  if (!first) return "Other";
  return NAME_BUCKETS.find((b) => b.test(first))?.label ?? "Other";
}

export function extBucket(name: string): string {
  const ext = extOf(name);
  return ext ? ext.toUpperCase() : "No extension";
}

/**
 * Greedy clustering: files whose stems score at or above `threshold` land in the
 * same bucket, named after the first member's dominant token.
 */
export function similarityBuckets(files: AppFile[], threshold: number): Map<string, AppFile[]> {
  const buckets: { label: string; files: AppFile[] }[] = [];
  for (const file of files) {
    const stem = normalizeStem(file.name);
    let placed = false;
    for (const bucket of buckets) {
      const score = Math.max(...bucket.files.map((f) => similarity(stem, normalizeStem(f.name))));
      if (score >= threshold) {
        bucket.files.push(file);
        placed = true;
        break;
      }
    }
    if (!placed) buckets.push({ label: stem.split(" ").slice(0, 2).join(" ") || file.name, files: [file] });
  }
  const out = new Map<string, AppFile[]>();
  const used = new Set<string>();
  for (const bucket of buckets) {
    let label = `${bucket.label.charAt(0).toUpperCase()}${bucket.label.slice(1)}`;
    let candidate = label;
    let n = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${label} (${n})`;
      n += 1;
    }
    used.add(candidate.toLowerCase());
    out.set(candidate, bucket.files);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Arrange                                                             */
/* ------------------------------------------------------------------ */

const byName = (a: AppFile, b: AppFile) => a.name.localeCompare(b.name, undefined, { numeric: true });

export function bucketFor(file: AppFile, rule: ArrangeRule): string {
  switch (rule.mode) {
    case "date":
      return dateBucket(file.modified, rule.dateGranularity);
    case "type":
      return KIND_CONFIG[file.kind].plural;
    case "size":
      return sizeBucket(file.size, rule.sizeRanges);
    case "ext":
      return extBucket(file.name);
    case "name":
      return nameBucket(file.name);
    case "similarity":
    default:
      return "Similar";
  }
}

/**
 * Builds the complete move/copy plan. Pure and idempotent, so the UI can rebuild
 * it on every keystroke without touching disk.
 */
export function arrangePreview(files: AppFile[], rule: ArrangeRule, basePath = ""): ArrangeItem[] {
  const root = basePath.replace(/[\\/]+$/, "");
  const items: ArrangeItem[] = [];

  if (rule.mode === "similarity") {
    const buckets = similarityBuckets(files, rule.similarityThreshold);
    for (const [label, group] of buckets) {
      // A lone file has nothing to be similar *to* — park it in one shared bucket
      // instead of creating a folder per file.
      const targetFolder = group.length > 1 ? `Similar · ${label}` : "Unmatched";
      for (const file of [...group].sort(byName)) {
        items.push({
          file,
          targetFolder,
          targetPath: `${root}\\${targetFolder}\\${file.name}`,
          status: "ok",
        });
      }
    }
  } else {
    for (const file of files) {
      const targetFolder = bucketFor(file, rule);
      items.push({
        file,
        targetFolder,
        targetPath: `${root}\\${targetFolder}\\${file.name}`,
        status: "ok",
      });
    }
  }

  // Collision detection: two selected files landing on the same name+folder.
  const seen = new Map<string, number>();
  for (const item of items) {
    const key = `${item.targetFolder}\\${item.file.name}`.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const item of items) {
    const key = `${item.targetFolder}\\${item.file.name}`.toLowerCase();
    if ((seen.get(key) ?? 0) > 1) item.status = "collision";
  }

  return items.sort(
    (a, b) => a.targetFolder.localeCompare(b.targetFolder, undefined, { numeric: true }) || byName(a.file, b.file),
  );
}

export function summarizeArrange(items: ArrangeItem[]): ArrangeSummaryRow[] {
  const rows = new Map<string, ArrangeSummaryRow>();
  for (const item of items) {
    const row = rows.get(item.targetFolder) ?? {
      folder: item.targetFolder,
      count: 0,
      bytes: 0,
      kinds: [],
      status: "ok" as const,
    };
    row.count += 1;
    row.bytes += item.file.size;
    if (!row.kinds.includes(item.file.kind)) row.kinds.push(item.file.kind);
    if (item.status === "collision") row.status = "collision";
    rows.set(item.targetFolder, row);
  }
  return [...rows.values()].sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true }));
}

/* ------------------------------------------------------------------ */
/* Duplicates                                                          */
/* ------------------------------------------------------------------ */

export const DEFAULT_DUPLICATE_OPTIONS: DuplicateOptions = {
  byHash: true,
  byAudio: true,
  byImage: true,
  byVisual: true,
  byName: false,
  fuzzy: 80,
};

export function findDuplicates(files: AppFile[], options: DuplicateOptions): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const claimed = new Set<string>();

  // 1. Byte-identical files: same size *and* same hash.
  if (options.byHash) {
    const byHash = new Map<string, AppFile[]>();
    for (const file of files) {
      if (!file.hash) continue;
      const key = `${file.size}:${file.hash}`;
      const list = byHash.get(key) ?? [];
      list.push(file);
      byHash.set(key, list);
    }
    for (const list of byHash.values()) {
      if (list.length < 2) continue;
      const sorted = [...list].sort(byName);
      sorted.forEach((f) => claimed.add(f.id));
      const label = [...sorted].sort((a, b) => a.name.length - b.name.length)[0].name;
      groups.push({
        id: uid("dup"),
        label,
        match: "exact",
        confidence: 100,
        size: sorted[0].size,
        files: sorted,
        reclaimable: sorted[0].size * (sorted.length - 1),
      });
    }
  }

  // 2. Near-duplicates by kind: audio metadata, image resolution, fuzzy names.
  const candidates = files.filter((f) => !claimed.has(f.id));
  const modes: { match: "audio" | "image" | "name"; kinds: FileKind[]; enabled: boolean }[] = [
    { match: "audio", kinds: ["audio"], enabled: options.byAudio },
    { match: "image", kinds: ["image"], enabled: options.byImage },
    { match: "name", kinds: ["image", "video", "audio", "document", "archive", "code", "other"], enabled: options.byName },
  ];

  for (const mode of modes) {
    if (!mode.enabled) continue;
    const pool = candidates.filter((f) => mode.kinds.includes(f.kind) && !claimed.has(f.id));
    for (let i = 0; i < pool.length; i += 1) {
      const first = pool[i];
      if (claimed.has(first.id)) continue;
      const cluster = [first];
      let best = 0;
      for (let j = i + 1; j < pool.length; j += 1) {
        const second = pool[j];
        if (claimed.has(second.id)) continue;
        const nameScore = similarity(normalizeStem(first.name), normalizeStem(second.name));

        // Audio: two encodes of the same recording run within a few seconds of
        // each other — duration is stronger evidence than the file name.
        const sameDuration =
          mode.match === "audio" &&
          first.duration !== undefined &&
          second.duration !== undefined &&
          Math.abs(first.duration - second.duration) <= 5;

        // Images: identical pixel dimensions plus a vaguely similar name.
        const sameFrame =
          mode.match === "image" &&
          first.width !== undefined &&
          first.width === second.width &&
          first.height === second.height;

        const floor = mode.match === "image" ? Math.min(options.fuzzy, 60) : options.fuzzy;
        const score = Math.max(nameScore, sameDuration ? 95 : 0, sameFrame ? Math.max(nameScore, 70) : 0);
        if (score >= floor) {
          cluster.push(second);
          best = Math.max(best, score);
        }
      }
      if (cluster.length > 1) {
        cluster.forEach((f) => claimed.add(f.id));
        groups.push({
          id: uid("dup"),
          label: first.name,
          match: mode.match,
          confidence: best,
          size: first.size,
          files: cluster,
          reclaimable: first.size * (cluster.length - 1),
        });
      }
    }
  }

  return groups.sort((a, b) => b.reclaimable - a.reclaimable);
}

/** Which copy to keep: highest resolution, then largest, then oldest. */
export function keeperSuggestion(group: DuplicateGroup): AppFile {
  return [...group.files].sort((a, b) => {
    const pixA = (a.width ?? 0) * (a.height ?? 0);
    const pixB = (b.width ?? 0) * (b.height ?? 0);
    if (pixA !== pixB) return pixB - pixA;
    if (a.size !== b.size) return b.size - a.size;
    return new Date(a.modified).getTime() - new Date(b.modified).getTime();
  })[0];
}

/* ------------------------------------------------------------------ */
/* Duplicate review                                                    */
/* ------------------------------------------------------------------ */

export type KeeperStrategy = "best" | "newest" | "oldest" | "largest" | "shortest";

export const KEEPER_STRATEGIES: { id: KeeperStrategy; label: string; hint: string }[] = [
  { id: "best", label: "Best quality", hint: "Highest resolution, then largest, then oldest" },
  { id: "newest", label: "Newest", hint: "Keep the most recently modified copy" },
  { id: "oldest", label: "Oldest", hint: "Keep the original" },
  { id: "largest", label: "Largest", hint: "Keep the copy with the most bytes" },
  { id: "shortest", label: "Shortest path", hint: "Keep the copy closest to the top of the tree" },
];

/** Picks the copy to keep according to a review strategy. */
export function pickKeeper(group: DuplicateGroup, strategy: KeeperStrategy = "best"): AppFile {
  const files = group.files;
  if (strategy === "best") return keeperSuggestion(group);
  const sorted = [...files].sort((a, b) => {
    if (strategy === "newest") return new Date(b.modified).getTime() - new Date(a.modified).getTime();
    if (strategy === "oldest") return new Date(a.modified).getTime() - new Date(b.modified).getTime();
    if (strategy === "largest") return b.size - a.size;
    return a.path.split(/[\\/]+/).length - b.path.split(/[\\/]+/).length || a.path.length - b.path.length;
  });
  return sorted[0] ?? files[0];
}

export interface DuplicateFilter {
  minBytes: number;
  crossFolderOnly: boolean;
  /** Only show groups whose members are all media. */
  mediaOnly: boolean;
}

export const DEFAULT_DUPLICATE_FILTER: DuplicateFilter = {
  minBytes: 0,
  crossFolderOnly: false,
  mediaOnly: false,
};

export function filterDuplicateGroups(groups: DuplicateGroup[], filter: DuplicateFilter): DuplicateGroup[] {
  return groups.filter((group) => {
    if (group.reclaimable < filter.minBytes) return false;
    if (filter.crossFolderOnly) {
      const folders = new Set(group.files.map((file) => file.folder.toLowerCase()));
      if (folders.size < 2) return false;
    }
    if (filter.mediaOnly) {
      const media = group.files.every((file) => file.kind === "image" || file.kind === "video" || file.kind === "audio");
      if (!media) return false;
    }
    return true;
  });
}

export interface DuplicateStats {
  groups: number;
  files: number;
  extras: number;
  reclaimable: number;
  biggest: number;
  byMatch: { match: DuplicateGroup["match"]; groups: number; bytes: number }[];
}

export function duplicateStats(groups: DuplicateGroup[]): DuplicateStats {
  const byMatch = new Map<DuplicateGroup["match"], { groups: number; bytes: number }>();
  let files = 0;
  let reclaimable = 0;
  let biggest = 0;
  for (const group of groups) {
    files += group.files.length;
    reclaimable += group.reclaimable;
    biggest = Math.max(biggest, group.size);
    const entry = byMatch.get(group.match) ?? { groups: 0, bytes: 0 };
    entry.groups += 1;
    entry.bytes += group.reclaimable;
    byMatch.set(group.match, entry);
  }
  return {
    groups: groups.length,
    files,
    extras: groups.reduce((sum, group) => sum + Math.max(0, group.files.length - 1), 0),
    reclaimable,
    biggest,
    byMatch: [...byMatch.entries()].map(([match, value]) => ({ match, ...value })),
  };
}

/** How similar two images are, 0–100, from their 64-bit dHash. */
export function similarityPercent(a: string, b: string): number {
  const distance = hamming(a, b);
  return Math.round(Math.max(0, 100 - (distance / 32) * 100));
}

/** Badge tone for a duplicate match kind. */
export function matcherTone(match: DuplicateGroup["match"]): "neutral" | "ok" | "warn" | "danger" | "accent" {
  if (match === "exact") return "ok";
  if (match === "name") return "neutral";
  return "accent";
}

export const MATCH_LABEL: Record<DuplicateGroup["match"], string> = {
  exact: "Byte-identical",
  audio: "Same audio",
  image: "Same picture",
  visual: "Visually similar",
  name: "Similar name",
};

/* ------------------------------------------------------------------ */
/* Batch rename                                                        */
/* ------------------------------------------------------------------ */

export const DEFAULT_RENAME_OPTIONS: RenameOptions = {
  pattern: "{name}-{counter}",
  find: "",
  replace: "",
  caseMode: "keep",
  startIndex: 1,
  seqPadding: 3,
};

export const RENAME_TOKENS = [
  { token: "{name}", label: "Original name" },
  { token: "{ext}", label: "Extension" },
  { token: "{counter}", label: "Sequence" },
  { token: "{date}", label: "Modified date" },
  { token: "{yyyy}", label: "Year" },
  { token: "{mm}", label: "Month" },
  { token: "{kind}", label: "File kind" },
  { token: "{size}", label: "Size" },
  { token: "{folder}", label: "Parent folder" },
];

function applyCase(value: string, mode: RenameOptions["caseMode"]): string {
  if (mode === "lower") return value.toLowerCase();
  if (mode === "upper") return value.toUpperCase();
  if (mode === "title") {
    return value
      .toLowerCase()
      .replace(/(^|[\s_-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  return value;
}

export function buildPatternName(file: AppFile, options: RenameOptions, index: number): string {
  const d = new Date(file.modified);
  const safe = (fn: () => string) => (Number.isNaN(d.getTime()) ? "" : fn());
  // Keep the original casing: renaming IMG_0421.HEIC must not become .heic.
  const dotIndex = file.name.lastIndexOf(".");
  const ext = dotIndex > 0 ? file.name.slice(dotIndex + 1) : "";
  const tokens: Record<string, string> = {
    "{name}": stemOf(file.name),
    "{ext}": ext,
    "{counter}": `${index}`.padStart(options.seqPadding, "0"),
    "{date}": safe(() => d.toISOString().slice(0, 10)),
    "{yyyy}": safe(() => `${d.getFullYear()}`),
    "{mm}": safe(() => `${d.getMonth() + 1}`.padStart(2, "0")),
    "{kind}": KIND_CONFIG[file.kind].label,
    "{size}": humanBytes(file.size).replace(" ", ""),
    "{folder}": file.folder,
  };

  let out = options.pattern || "{name}";
  for (const [token, value] of Object.entries(tokens)) out = out.split(token).join(value);

  // Keep the original extension unless the pattern already carries one.
  const patternHasExt = options.pattern.includes("{ext}") || /\.[a-z0-9]{1,6}$/i.test(options.pattern);
  const stem = patternHasExt ? out : `${out}.${ext}`;

  let next = stem;
  if (options.find) {
    next = next.split(options.find).join(options.replace);
  }
  // Case changes apply to the stem so extensions stay lowercase-safe.
  const dot = next.lastIndexOf(".");
  const nextStem = dot > 0 ? next.slice(0, dot) : next;
  const nextExt = dot > 0 ? next.slice(dot) : "";
  return sanitizeName(applyCase(nextStem, options.caseMode) + nextExt);
}

export function applyRename(files: AppFile[], options: RenameOptions): RenameRow[] {
  const ordered = [...files].sort(byName);
  const rows: RenameRow[] = ordered.map((file, i) => {
    const nextName = buildPatternName(file, options, options.startIndex + i);
    return { file, nextName, changed: nextName !== file.name, conflict: false };
  });

  const used = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.file.folder}\\${row.nextName}`.toLowerCase();
    used.set(key, (used.get(key) ?? 0) + 1);
  }
  for (const row of rows) {
    const key = `${row.file.folder}\\${row.nextName}`.toLowerCase();
    if ((used.get(key) ?? 0) > 1) row.conflict = true;
    if (!row.nextName.trim()) row.error = "Empty name";
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Folder styles (desktop.ini)                                         */
/* ------------------------------------------------------------------ */

export const FOLDER_COLORS = [
  "#f59e0b",
  "#38bdf8",
  "#a78bfa",
  "#34d399",
  "#f472b6",
  "#fb7185",
  "#94a3b8",
  "#eab308",
];

export function iconFileName(style: FolderStyle): string {
  return `${style.glyph}-${style.color.replace("#", "")}.ico`;
}

export function buildDesktopIni(style: FolderStyle, iconDir = "%APPDATA%\\ArrangeIt\\icons"): string {
  const icon = style.iconPath ?? `${iconDir}\\${iconFileName(style)}`;
  return [
    "[.ShellClassInfo]",
    "ConfirmFileOp=0",
    "NoSharing=1",
    `IconFile=${icon}`,
    "IconIndex=0",
    `InfoTip=${style.tooltip || `ArrangeIt · ${style.folder}`}`,
    `IconResource="${icon}",0`,
    "",
    "[ViewState]",
    "Mode=",
    "Vid=",
    "FolderType=Documents",
    "",
  ].join("\r\n");
}

/**
 * The exact sequence Windows needs for a folder to pick up `desktop.ini`.
 * `attrib +r` blocks the shell from regenerating the folder metadata, `+s +h`
 * hides the ini, and `ie4uinit -show` flushes the icon cache without a reboot.
 */
export function styleSteps(style: FolderStyle, root = "C:\\"): StyleStep[] {
  const folder = `${root}${style.folder}`.replace(/\\+/g, "\\");
  return [
    { command: `icon → ${iconFileName(style)}`, ok: true, detail: "16/32/48/256 px icon generated" },
    { command: `write "${folder}\\desktop.ini"`, ok: true, detail: "IconResource + InfoTip written" },
    { command: `attrib +r "${folder}"`, ok: true, detail: "Folder marked so Windows honours desktop.ini" },
    {
      command: `attrib +s +h "${folder}\\desktop.ini"`,
      ok: true,
      detail: style.hideSystemFiles ? "Hidden + system" : "Left visible",
    },
    { command: "ie4uinit.exe -show", ok: true, detail: "Shell icon cache refreshed" },
  ];
}

/* ------------------------------------------------------------------ */
/* Demo audio waveform + image gradients (preview placeholders)        */
/* ------------------------------------------------------------------ */

/** Deterministic 42-bar waveform derived from the file name hash. */
export function waveform(seed: string, bars = 42): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const base = Math.abs(h % 1000) / 1000;
    // Envelope so the wave looks like real music, not noise.
    const t = i / (bars - 1);
    const env = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, Math.max(0, t * 1.15)));
    out.push(Math.max(0.08, Math.min(1, base * env + 0.18)));
  }
  return out;
}

export function gradientFor(seed: string, color: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, ${color} 0%, hsl(${h} 70% 45%) 55%, hsl(${(h + 55) % 360} 65% 30%) 100%)`;
}

/* ------------------------------------------------------------------ */
/* Perceptual hashing (dHash)                                          */
/* ------------------------------------------------------------------ */

/** Number of differing bits between two 16-hex dHash signatures. */
export function hamming(a: string, b: string): number {
  let diff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    diff += ((xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1));
  }
  return diff;
}

export interface SignatureEntry {
  path: string;
  hash: string;
}

/**
 * Groups images whose dHash differs by at most `threshold` bits (0–64).
 * This catches re-saves, resizes, crops-adjacent shots and renamed copies that
 * byte-level hashing can never match.
 */
export function clusterSignatures(entries: SignatureEntry[], threshold = 8): SignatureEntry[][] {
  const clusters: SignatureEntry[][] = [];
  for (const entry of entries) {
    const hit = clusters.find((cluster) => hamming(cluster[0].hash, entry.hash) <= threshold);
    if (hit) hit.push(entry);
    else clusters.push([entry]);
  }
  return clusters.filter((cluster) => cluster.length > 1);
}

/**
 * Turns perceptual signatures into duplicate groups. Files already grouped by a
 * stronger signal (exact hash) are skipped by the caller via `exclude`.
 */
export function visualDuplicateGroups(
  entries: SignatureEntry[],
  files: AppFile[],
  threshold = 10,
  exclude: Set<string> = new Set(),
): DuplicateGroup[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const usable = entries.filter((entry) => !exclude.has(entry.path) && byPath.has(entry.path));
  const clusters = clusterSignatures(usable, threshold);

  return clusters.map((cluster) => {
    const groupFiles = cluster
      .map((entry) => byPath.get(entry.path))
      .filter((file): file is AppFile => Boolean(file))
      .sort(byName);
    const average =
      cluster.reduce((sum, entry) => sum + hamming(cluster[0].hash, entry.hash), 0) / Math.max(1, cluster.length);
    return {
      id: uid("dup"),
      label: groupFiles[0]?.name ?? "Similar images",
      match: "visual" as const,
      confidence: Math.round(Math.max(55, 100 - average * 4)),
      size: groupFiles[0]?.size ?? 0,
      files: groupFiles,
      reclaimable: groupFiles.slice(1).reduce((sum, file) => sum + file.size, 0),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Folder intelligence                                                 */
/* ------------------------------------------------------------------ */

export function dominantKind(files: AppFile[]): FileKind {
  const counts = new Map<FileKind, number>();
  for (const file of files) {
    if (file.kind === "other") continue;
    counts.set(file.kind, (counts.get(file.kind) ?? 0) + 1);
  }
  let best: FileKind = "other";
  let bestCount = 0;
  for (const [kind, count] of counts) {
    if (count > bestCount) {
      best = kind;
      bestCount = count;
    }
  }
  return best;
}

export function presetForKind(kind: FileKind): StylePreset {
  const byId = (id: string) => STYLE_PRESETS.find((preset) => preset.id === id) ?? STYLE_PRESETS[0];
  switch (kind) {
    case "image":
      return byId("images");
    case "audio":
      return byId("audio");
    case "video":
      return byId("video");
    case "document":
      return byId("docs");
    case "code":
      return byId("code");
    case "archive":
      return byId("archive");
    default:
      return byId("archive");
  }
}

const DAY = 86_400_000;

/**
 * Turns the folder contents into a short, ranked to-do list. Everything here is
 * derived from data the app already has — no telemetry, no AI service.
 */
export function buildInsights(
  files: AppFile[],
  folders: { name: string; files: number; bytes: number }[],
  groups: DuplicateGroup[],
  styledFolders: Set<string>,
): Insight[] {
  const insights: Insight[] = [];
  const now = Date.now();

  const reclaimable = groups.reduce((sum, group) => sum + group.reclaimable, 0);
  if (reclaimable > 0) {
    insights.push({
      id: "duplicates",
      kind: "duplicates",
      title: `${groups.length} duplicate group${groups.length === 1 ? "" : "s"}`,
      detail: "Byte-identical or visually similar copies are safe to recycle — keep one of each.",
      impact: `${humanBytes(reclaimable)} reclaimable`,
      actionLabel: "Review duplicates",
      target: "duplicates",
      count: groups.reduce((sum, group) => sum + group.files.length - 1, 0),
    });
  }

  const screenshots = files.filter((file) => /screenshot|screen[ -]?shot|snip|grab|frame \d{4}/i.test(file.name));
  if (screenshots.length >= 5) {
    insights.push({
      id: "screenshots",
      kind: "screenshots",
      title: `${screenshots.length} screenshots are loose`,
      detail: "They bury real photos in the same folder. Grouping by month usually fixes the scroll.",
      impact: humanBytes(screenshots.reduce((sum, file) => sum + file.size, 0)),
      actionLabel: "Group photos by month",
      target: "arrange",
      rule: { mode: "date", dateGranularity: "month" },
      count: screenshots.length,
    });
  }

  const big = files.filter((file) => file.size >= 100 * 1024 * 1024);
  if (big.length > 0) {
    insights.push({
      id: "large",
      kind: "large",
      title: `${big.length} file${big.length === 1 ? "" : "s"} over 100 MB`,
      detail: "These dominate your disk usage. Bucket them by size, then move the huge ones to a spare drive.",
      impact: humanBytes(big.reduce((sum, file) => sum + file.size, 0)),
      actionLabel: "Plan by size",
      target: "arrange",
      rule: { mode: "size", sizeRanges: DEFAULT_SIZE_RANGES.slice(3) },
      count: big.length,
    });
  }

  const stale = files.filter((file) => now - new Date(file.modified).getTime() > 3 * 365 * DAY);
  if (stale.length >= 5) {
    insights.push({
      id: "stale",
      kind: "stale",
      title: `${stale.length} files untouched for 3+ years`,
      detail: "A year-based archive keeps the active folder light without deleting anything.",
      impact: humanBytes(stale.reduce((sum, file) => sum + file.size, 0)),
      actionLabel: "Group by year",
      target: "arrange",
      rule: { mode: "date", dateGranularity: "year" },
      count: stale.length,
    });
  }

  const installers = files.filter(
    (file) => /\.(exe|msi|zip|rar|7z|iso)$/i.test(file.name) && now - new Date(file.modified).getTime() > 90 * DAY,
  );
  if (installers.length >= 3) {
    insights.push({
      id: "installers",
      kind: "installers",
      title: `${installers.length} old installers and archives`,
      detail: "Probably already installed or extracted. One folder by extension keeps them findable.",
      impact: humanBytes(installers.reduce((sum, file) => sum + file.size, 0)),
      actionLabel: "Group by extension",
      target: "arrange",
      rule: { mode: "ext" },
      count: installers.length,
    });
  }

  // A folder that mixes many kinds is a junk drawer.
  const junkDrawers = folders
    .map((folder) => {
      const inner = files.filter((file) => file.folder === folder.name);
      return { folder, kinds: new Set(inner.map((file) => file.kind)), inner };
    })
    .filter((entry) => entry.inner.length >= 15 && entry.kinds.size >= 5)
    .sort((a, b) => b.kinds.size - a.kinds.size)
    .slice(0, 2);

  for (const entry of junkDrawers) {
    insights.push({
      id: `mixed-${entry.folder.name}`,
      kind: "mixed",
      title: `${entry.folder.name} mixes ${entry.kinds.size} file types`,
      detail: "A classic junk drawer. Sorting by type takes one run and is fully reversible.",
      impact: `${entry.inner.length} files`,
      actionLabel: "Tidy by type",
      target: "arrange",
      rule: { mode: "type" },
      folder: undefined,
      count: entry.inner.length,
    });
  }

  const clusters = [...similarityBuckets(files, 85).entries()].filter(([, group]) => group.length >= 3);
  if (clusters.length > 0) {
    const biggest = clusters.sort((a, b) => b[1].length - a[1].length)[0];
    insights.push({
      id: "similar",
      kind: "similar",
      title: `${clusters.length} look-alike name cluster${clusters.length === 1 ? "" : "s"}`,
      detail: `“${biggest[0]}” alone has ${biggest[1].length} variants — probably duplicates or versions.`,
      impact: `${clusters.reduce((sum, [, group]) => sum + group.length, 0)} files`,
      actionLabel: "Cluster similar names",
      target: "arrange",
      rule: { mode: "similarity", similarityThreshold: 85 },
      count: clusters.length,
    });
  }

  // Style nudge: the biggest unstyled folder gets a suggested preset.
  const unstyled = folders
    .filter((folder) => !styledFolders.has(folder.name) && folder.files >= 3)
    .sort((a, b) => b.files - a.files)[0];
  if (unstyled) {
    const inner = files.filter((file) => file.folder === unstyled.name);
    const preset = presetForKind(dominantKind(inner));
    insights.push({
      id: `unstyled-${unstyled.name}`,
      kind: "unstyled",
      title: `${unstyled.name} has no icon yet`,
      detail: `Mostly ${KIND_CONFIG[dominantKind(inner)].plural.toLowerCase()} — the “${preset.label}” badge fits.`,
      impact: `${unstyled.files} files`,
      actionLabel: "Style it",
      target: "styles",
      folder: unstyled.name,
      preset,
      count: unstyled.files,
    });
  }

  return insights;
}
