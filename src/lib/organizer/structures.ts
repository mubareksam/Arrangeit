/**
 * Profession-aware folder structures.
 *
 * Different jobs keep different folders. A video editor wants 01_Footage /
 * 02_Audio / 03_Project Files; a student wants Lectures / Assignments / Notes;
 * a coder wants src / tests / docs. This module describes those structures as
 * data, generates four variants of each (flat roles, roles + year, project-first,
 * project then roles), and can guess which profession a folder belongs to from
 * its extension mix.
 *
 * Pure functions only — no I/O, so the same code backs both the dry-run preview
 * and the executed plan.
 */

import type { AppFile, FileKind } from "./types";

export type ProfessionId =
  | "general"
  | "designer"
  | "video"
  | "motion"
  | "animator"
  | "uxui"
  | "coder"
  | "student"
  | "business"
  | "marketer"
  | "social"
  | "photographer"
  | "musician";

export type StructureStyle = "groups" | "groups+year" | "project" | "project+groups";

export interface GroupSpec {
  folder: string;
  exts?: string[];
  kinds?: FileKind[];
  /** Lower-case substrings matched against the file name. */
  keywords?: string[];
}

export interface Profession {
  id: ProfessionId;
  label: string;
  blurb: string;
  /** Icon name used by the UI cards. */
  icon: string;
  /** Extensions that suggest this profession during auto-detection. */
  detect: string[];
  groups: GroupSpec[];
  fallback: string;
}

export interface StructureVariant {
  id: string;
  profession: ProfessionId;
  label: string;
  description: string;
  style: StructureStyle;
}

const YEAR = (file: AppFile) => new Date(file.modified).getFullYear() || new Date().getFullYear();

/* ------------------------------------------------------------------ */
/* Project key                                                         */
/* ------------------------------------------------------------------ */

const VERSION_WORDS = new Set([
  "copy",
  "final",
  "finalfinal",
  "new",
  "old",
  "edit",
  "export",
  "version",
  "draft",
  "v",
  "rev",
  "backup",
  "temp",
]);

/**
 * Best-effort project name from a file name:
 *   "acme-logo_v3_final.psd" → "Acme Logo"
 *   "2024-05-12_wedding.mp4" → "2024-05-12 Wedding"
 */
export function projectKey(file: AppFile): string {
  const base = file.name.replace(/\.[^.]+$/, "");
  const tokens = base
    .split(/[\s_.-]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^v\d+$/i.test(token) && !/^\d{1,2}$/.test(token) && !VERSION_WORDS.has(token.toLowerCase()));

  const kept = tokens.slice(0, 2);
  if (kept.length === 0) return "Unsorted";
  return kept
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ")
    .slice(0, 42);
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

function matches(group: GroupSpec, file: AppFile): boolean {
  if (group.exts && group.exts.includes(file.ext)) return true;
  if (group.kinds && group.kinds.includes(file.kind)) return true;
  if (group.keywords) {
    const name = file.name.toLowerCase();
    if (group.keywords.some((keyword) => name.includes(keyword))) return true;
  }
  return false;
}

export function groupFor(profession: Profession, file: AppFile): string {
  for (const group of profession.groups) {
    if (matches(group, file)) return group.folder;
  }
  return profession.fallback;
}

/* ------------------------------------------------------------------ */
/* Profession catalogue                                                */
/* ------------------------------------------------------------------ */

const ARCHIVE_EXTS = ["zip", "rar", "7z", "tar", "gz", "iso"];

export const PROFESSIONS: Profession[] = [
  {
    id: "general",
    label: "General",
    blurb: "The reliable default: documents, media, archives, code.",
    icon: "grid",
    detect: [],
    fallback: "99_Other",
    groups: [
      { folder: "01_Documents", kinds: ["document"] },
      { folder: "02_Images", kinds: ["image"] },
      { folder: "03_Video", kinds: ["video"] },
      { folder: "04_Audio", kinds: ["audio"] },
      { folder: "05_Archives", exts: ARCHIVE_EXTS },
      { folder: "06_Code", kinds: ["code"] },
    ],
  },
  {
    id: "designer",
    label: "Graphic designer",
    blurb: "Working files, exports, references, fonts and assets kept apart.",
    icon: "palette",
    detect: ["psd", "ai", "indd", "sketch", "fig", "xd", "afdesign", "afphoto", "cdr", "ttf", "otf", "eps"],
    fallback: "06_Archive",
    groups: [
      { folder: "01_Design Files", exts: ["psd", "ai", "indd", "sketch", "fig", "xd", "afdesign", "afphoto", "cdr", "eps", "svg"] },
      { folder: "02_Exports", exts: ["png", "jpg", "jpeg", "pdf", "webp", "gif", "tif", "tiff"] },
      { folder: "03_Fonts", exts: ["ttf", "otf", "woff", "woff2"] },
      { folder: "04_Assets", exts: ["abr", "pat", "ase", "grime", "brush"] },
      { folder: "05_Reference", kinds: ["image"], keywords: ["ref", "inspiration", "mood", "mockup"] },
      { folder: "06_Archive", exts: ARCHIVE_EXTS },
    ],
  },
  {
    id: "video",
    label: "Video editor",
    blurb: "Footage, audio, project files, graphics and renders — never mixed.",
    icon: "video",
    detect: ["prproj", "drp", "veg", "fcpbundle", "mov", "mxf", "braw", "r3d", "prproj"],
    fallback: "07_Other",
    groups: [
      { folder: "01_Footage", exts: ["mp4", "mov", "mxf", "avi", "mkv", "braw", "r3d", "mts", "m2ts", "webm"] },
      { folder: "02_Audio", exts: ["wav", "mp3", "aif", "aiff", "flac", "m4a", "ogg", "wma"] },
      { folder: "03_Project Files", exts: ["prproj", "drp", "veg", "aep", "fcpbundle", "xml", "edl", "aaf"] },
      { folder: "04_Graphics", exts: ["png", "jpg", "jpeg", "psd", "ai", "svg", "tif", "tiff", "psb"] },
      { folder: "05_LUTs", exts: ["cube", "3dl", "look"] },
      { folder: "06_Exports", keywords: ["export", "final", "delivery", "render", "master", "v1", "v2"] },
    ],
  },
  {
    id: "motion",
    label: "Motion designer",
    blurb: "Comps, renders, scripts, LUTs and elements in separate lanes.",
    icon: "sparkles",
    detect: ["aep", "aepx", "c4d", "blend", "mogrt", "jsx", "jsxbin", "ffx"],
    fallback: "07_Other",
    groups: [
      { folder: "01_Comps", exts: ["aep", "aepx", "c4d", "mogrt", "ffx"] },
      { folder: "02_Renders", exts: ["mp4", "mov", "png", "exr", "tif", "tiff", "webm", "gif"] },
      { folder: "03_Elements", exts: ["psd", "ai", "svg", "eps", "png"], keywords: ["element", "asset", "overlay"] },
      { folder: "04_Footage", exts: ["mp4", "mov", "mxf", "braw", "r3d"] },
      { folder: "05_Scripts", exts: ["jsx", "jsxbin", "py", "txt"], keywords: ["expr", "script"] },
      { folder: "06_Audio", kinds: ["audio"] },
    ],
  },
  {
    id: "animator",
    label: "Animator / 3D",
    blurb: "Scenes, rigs, textures, caches and playblasts kept in order.",
    icon: "layers",
    detect: ["blend", "ma", "mb", "max", "fbx", "obj", "ztl", "ztn", "abc", "usd", "usdz", "rig"],
    fallback: "07_Other",
    groups: [
      { folder: "01_Scenes", exts: ["blend", "ma", "mb", "max", "c4d", "hip", "usd", "usdz"] },
      { folder: "02_Rigs", exts: ["rig", "fbx", "abc"], keywords: ["rig", "skeleton", "armature"] },
      { folder: "03_Models", exts: ["obj", "fbx", "ztl", "ztn", "stl", "glb", "gltf"] },
      { folder: "04_Textures", exts: ["png", "jpg", "jpeg", "exr", "tif", "tiff", "psd", "hdr"] },
      { folder: "05_Renders", exts: ["mp4", "mov", "png", "exr", "gif"], keywords: ["render", "playblast", "preview"] },
      { folder: "06_Reference", keywords: ["ref", "reference", "inspiration"] },
    ],
  },
  {
    id: "uxui",
    label: "UI / UX designer",
    blurb: "Research, wireframes, UI, prototypes, icon assets and handoff.",
    icon: "grid",
    detect: ["fig", "sketch", "xd", "proto", "principle", "studio"],
    fallback: "07_Other",
    groups: [
      { folder: "01_Research", keywords: ["research", "interview", "survey", "persona", "insight"], exts: ["pdf", "docx", "md"] },
      { folder: "02_Wireframes", keywords: ["wireframe", "wire", "lo-fi", "lofi", "sketch"] },
      { folder: "03_UI", exts: ["fig", "sketch", "xd", "png", "jpg", "svg"], keywords: ["ui", "screen", "mock"] },
      { folder: "04_Prototypes", exts: ["fig", "proto", "html", "mp4", "gif"], keywords: ["prototype", "flow", "demo"] },
      { folder: "05_Assets", exts: ["svg", "png", "ttf", "otf", "woff", "woff2"], keywords: ["icon", "asset", "logo"] },
      { folder: "06_Handoff", keywords: ["handoff", "spec", "dev", "tokens"], exts: ["json", "css", "zip"] },
    ],
  },
  {
    id: "coder",
    label: "Developer",
    blurb: "Source, tests, docs, assets, config and build output separated.",
    icon: "code",
    detect: ["ts", "tsx", "js", "jsx", "rs", "py", "go", "java", "cs", "rb", "php", "c", "cpp", "h", "sql", "sh"],
    fallback: "99_Other",
    groups: [
      { folder: "src", kinds: ["code"], keywords: [".test.", "spec"] },
      { folder: "tests", keywords: ["test", "spec", "fixture", "mock"] },
      { folder: "docs", exts: ["md", "txt", "pdf", "rst"], keywords: ["readme", "changelog", "license"] },
      { folder: "assets", kinds: ["image"], exts: ["svg", "woff", "woff2", "ttf", "mp4"] },
      { folder: "config", exts: ["json", "yml", "yaml", "toml", "ini", "env", "lock"], keywords: [".config", "dockerfile", "makefile"] },
      { folder: "build", exts: ARCHIVE_EXTS, keywords: ["dist", "build", "bundle"] },
    ],
  },
  {
    id: "student",
    label: "Student",
    blurb: "Lectures, assignments, notes, papers, slides and exam prep.",
    icon: "pencil",
    detect: ["pdf", "docx", "pptx", "xlsx", "ipynb", "tex", "epub", "odt"],
    fallback: "07_Other",
    groups: [
      { folder: "01_Lectures", keywords: ["lecture", "lec", "week", "unit", "class", "seminar"] },
      { folder: "02_Assignments", keywords: ["assignment", "hw", "homework", "task", "project", "lab"] },
      { folder: "03_Notes", keywords: ["note", "notes", "summary", "outline"], exts: ["md", "txt"] },
      { folder: "04_Research", keywords: ["paper", "thesis", "article", "journal", "citation", "reference"] },
      { folder: "05_Slides", exts: ["ppt", "pptx", "key", "odp"] },
      { folder: "06_Exam Prep", keywords: ["exam", "quiz", "test", "midterm", "final", "revision"] },
    ],
  },
  {
    id: "business",
    label: "Business / admin",
    blurb: "Contracts, invoices, reports, decks, data and archive.",
    icon: "doc",
    detect: ["xlsx", "xls", "pptx", "docx", "pdf", "csv", "numbers", "pages"],
    fallback: "07_Other",
    groups: [
      { folder: "01_Contracts", keywords: ["contract", "agreement", "nda", "terms", "policy"] },
      { folder: "02_Invoices", keywords: ["invoice", "receipt", "bill", "quote", "purchase", "po"] },
      { folder: "03_Reports", keywords: ["report", "summary", "statement", "audit", "review"] },
      { folder: "04_Presentations", exts: ["ppt", "pptx", "key", "odp"] },
      { folder: "05_Spreadsheets", exts: ["xls", "xlsx", "csv", "numbers", "ods"] },
      { folder: "06_Archive", exts: ARCHIVE_EXTS, keywords: ["archive", "old", "backup"] },
    ],
  },
  {
    id: "marketer",
    label: "Marketer",
    blurb: "Campaigns, creative, copy, data, reports and brand assets.",
    icon: "zap",
    detect: ["csv", "xlsx", "pptx", "pdf", "ai", "psd", "mp4"],
    fallback: "07_Other",
    groups: [
      { folder: "01_Campaigns", keywords: ["campaign", "launch", "promo", "ad", "ads", "brief"] },
      { folder: "02_Creative", kinds: ["image", "video"], keywords: ["creative", "banner", "social", "ad"] },
      { folder: "03_Copy", keywords: ["copy", "caption", "blog", "email", "newsletter", "script"], exts: ["docx", "md", "txt"] },
      { folder: "04_Data", exts: ["csv", "xlsx", "xls", "json"], keywords: ["data", "list", "leads", "audience"] },
      { folder: "05_Reports", keywords: ["report", "deck", "results", "performance", "analytics"], exts: ["pptx", "pdf", "xlsx"] },
      { folder: "06_Brand", keywords: ["brand", "logo", "guideline", "styleguide", "kit"] },
    ],
  },
  {
    id: "social",
    label: "Social media manager",
    blurb: "Reels, stills, captions, thumbnails, source and scheduled posts.",
    icon: "image",
    detect: ["mp4", "mov", "jpg", "png", "psd", "aep", "capcut", "srt"],
    fallback: "07_Other",
    groups: [
      { folder: "01_Reels", kinds: ["video"], keywords: ["reel", "story", "short", "tiktok", "vertical"] },
      { folder: "02_Stills", kinds: ["image"], keywords: ["post", "carousel", "story", "grid"] },
      { folder: "03_Captions", exts: ["txt", "md", "srt", "docx"], keywords: ["caption", "copy", "hashtag"] },
      { folder: "04_Thumbnails", keywords: ["thumb", "cover", "thumbnail"] },
      { folder: "05_Source", exts: ["aep", "psd", "prproj", "capcut", "ai"] },
      { folder: "06_Scheduled", keywords: ["scheduled", "queue", "ready", "approved"] },
    ],
  },
  {
    id: "photographer",
    label: "Photographer",
    blurb: "RAW, JPEG, edited, client selects and contracts.",
    icon: "image",
    detect: ["cr2", "cr3", "nef", "arw", "dng", "orf", "raf", "rw2", "heic", "tif"],
    fallback: "07_Other",
    groups: [
      { folder: "01_RAW", exts: ["cr2", "cr3", "nef", "arw", "dng", "orf", "raf", "rw2", "raw"] },
      { folder: "02_JPEG", exts: ["jpg", "jpeg", "png", "heic", "webp"] },
      { folder: "03_Edited", exts: ["psd", "tif", "tiff", "xmp", "dng"], keywords: ["edit", "retouch", "graded"] },
      { folder: "04_Client Selects", keywords: ["select", "selects", "proof", "favorite"] },
      { folder: "05_Contracts", keywords: ["contract", "invoice", "agreement", "release"] },
      { folder: "06_Delivery", exts: ["zip", "pdf"], keywords: ["delivery", "final", "export"] },
    ],
  },
  {
    id: "musician",
    label: "Musician / producer",
    blurb: "Stems, projects, masters, samples, MIDI and references.",
    icon: "music",
    detect: ["wav", "aif", "aiff", "flac", "als", "flp", "logicx", "ptx", "mid", "midi", "nki"],
    fallback: "07_Other",
    groups: [
      { folder: "01_Stems", keywords: ["stem", "trackout", "bounce"], exts: ["wav", "aiff", "mp3"] },
      { folder: "02_Projects", exts: ["als", "flp", "logicx", "ptx", "rpp", "cpr", "reason", "band"] },
      { folder: "03_Masters", keywords: ["master", "final", "mixdown"] },
      { folder: "04_Samples", exts: ["wav", "aif", "aiff", "nki", "sfz", "rex"] },
      { folder: "05_MIDI", exts: ["mid", "midi"] },
      { folder: "06_Reference", keywords: ["ref", "reference", "demo", "idea"] },
    ],
  },
];

export const PROFESSION_BY_ID: Record<ProfessionId, Profession> = PROFESSIONS.reduce(
  (acc, profession) => {
    acc[profession.id] = profession;
    return acc;
  },
  {} as Record<ProfessionId, Profession>,
);

/* ------------------------------------------------------------------ */
/* Variants                                                            */
/* ------------------------------------------------------------------ */

const VARIANT_TEMPLATES: { id: string; label: string; description: string; style: StructureStyle }[] = [
  { id: "groups", label: "By role", description: "One folder per kind of work — flat and obvious.", style: "groups" },
  { id: "groups-year", label: "Role + year", description: "Same lanes, split by year so old work stops cluttering.", style: "groups+year" },
  { id: "project", label: "Project first", description: "A folder per project, inferred from file names.", style: "project" },
  { id: "project-groups", label: "Project, then role", description: "Client folder, then the roles inside it. Deepest, tidiest.", style: "project+groups" },
];

export const STRUCTURE_VARIANTS: StructureVariant[] = PROFESSIONS.flatMap((profession) =>
  VARIANT_TEMPLATES.map((template) => ({
    id: `${profession.id}:${template.id}`,
    profession: profession.id,
    label: template.label,
    description: template.description,
    style: template.style,
  })),
);

export function variantById(id: string): StructureVariant {
  return STRUCTURE_VARIANTS.find((variant) => variant.id === id) ?? STRUCTURE_VARIANTS[0];
}

/** Folder (may contain one `/`) for a file under a given structure. */
export function folderForStructure(file: AppFile, structureId: string): string {
  const variant = variantById(structureId);
  const profession = PROFESSION_BY_ID[variant.profession];
  const group = groupFor(profession, file);

  switch (variant.style) {
    case "groups":
      return group;
    case "groups+year":
      return `${group}/${YEAR(file)}`;
    case "project":
      return projectKey(file);
    case "project+groups":
      return `${projectKey(file)}/${group}`;
    default:
      return group;
  }
}

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

export interface ProfessionGuess {
  profession: Profession;
  /** 0–100, how much of the folder this profession explains. */
  confidence: number;
  matched: number;
  total: number;
  runnerUp?: { profession: Profession; confidence: number };
}

/**
 * Guesses the profession from the extension mix. Deliberately conservative:
 * with fewer than 4 recognisable files it returns the general structure, so the
 * UI never tells a photographer they are a coder because of one .json file.
 */
export function detectProfession(files: AppFile[]): ProfessionGuess {
  const total = Math.max(1, files.length);
  const scored = PROFESSIONS.filter((profession) => profession.detect.length > 0)
    .map((profession) => {
      const set = new Set(profession.detect);
      const matched = files.filter((file) => set.has(file.ext)).length;
      return { profession, matched, confidence: Math.round((matched / total) * 100) };
    })
    .sort((a, b) => b.matched - a.matched);

  const [top, second] = scored;
  if (!top || top.matched < 4) {
    return { profession: PROFESSION_BY_ID.general, confidence: 0, matched: top?.matched ?? 0, total: files.length };
  }
  return {
    profession: top.profession,
    confidence: Math.min(99, Math.round((top.matched / total) * 130)),
    matched: top.matched,
    total: files.length,
    runnerUp: second ? { profession: second.profession, confidence: Math.min(99, Math.round((second.matched / total) * 130)) } : undefined,
  };
}

/** A short, human explanation of why the guess was made. */
export function explainGuess(guess: ProfessionGuess): string {
  if (guess.confidence === 0) return "Not enough signal yet — pick a structure manually.";
  const sample = guess.profession.groups
    .flatMap((group) => group.exts ?? [])
    .slice(0, 4)
    .join(", ");
  return `${guess.matched} of ${guess.total} files look like ${guess.profession.label.toLowerCase()} work${sample ? ` (${sample}…)` : ""}.`;
}
