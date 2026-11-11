/**
 * Profession-aware folder structures — v2, built from how people actually file.
 *
 * Sources behind these layouts (2025–26 workflow guides and practitioner threads):
 *  - Audio: client/project folder → Session Files, Audio Files (Recorded/Imported),
 *    Bounces, Stems, MIDI, Reference Tracks, Documentation. Sample libraries split by
 *    type (drums, synths, FX, vocals). Never a bare "stems" dump.
 *  - Video: numbered production folders — 01_Footage, 02_Audio, 03_Project Files,
 *    04_Graphics, 05_Exports, 06_Proxies, 07_Documents — with per-day/per-camera
 *    subfolders inside Footage.
 *  - Photo: date-first sessions — 2026/2026-05-15_Client/{01_RAW, 02_Selects,
 *    03_Edited, 04_Exports, 05_Documents}.
 *  - Design: client → project → Brief, Research, Working Files, Assets, Exports, Fonts,
 *    Archive — "working files and deliverables never share a folder".
 *  - Motion / 3D / Animation: Projects, Assets, Footage, Audio, Scripts, Renders,
 *    References, Fonts; 3D adds Scenes, Rigs, Models, Textures.
 *  - Code: conventional repository layout (src, tests, docs, assets, config, scripts).
 *  - Study: Lectures, Assignments, Notes, Readings, Exams, Slides, Admin.
 *  - Office / marketing / social: contracts, invoices, reports, decks, data, brand.
 *
 * Two rules keep the output clean rather than theatrical:
 *  1. Role names are written the way professionals write them, but the numeric
 *     order is applied at plan time (see `engine.renumberPlan`) so a plan never
 *     ships folders numbered 02 and 05 with nothing in 01, 03 or 04.
 *  2. A role only exists if a file lands in it — empty folders are never created.
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
  | "musician"
  | "architect";

export type TemplateStyle = "role" | "project-role" | "role-year" | "project" | "date-role" | "discipline";

export interface RoleRule {
  /** Folder name without any numeric prefix. */
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
  icon: string;
  /** Short label used as a top-level discipline folder in mixed (smart) plans. */
  discipline: string;
  /** Extensions that suggest this profession. */
  detect: string[];
  /** Extensions that are near-proof of this profession. */
  strong: string[];
  /** File kinds this profession normally works with (used by smart scoring). */
  kinds: FileKind[];
  roles: RoleRule[];
  fallback: string;
}

export interface StructureTemplate {
  id: string;
  profession: ProfessionId;
  label: string;
  description: string;
  style: TemplateStyle;
}

const ARCHIVE = ["zip", "rar", "7z", "tar", "gz", "iso", "cab"];

export const PROFESSIONS: Profession[] = [
  {
    id: "general",
    label: "General",
    blurb: "Universal fallback: documents, media, archives, code, everything else.",
    icon: "grid",
    discipline: "Files",
    detect: [],
    strong: [],
    kinds: ["document", "image", "video", "audio", "archive", "code"],
    fallback: "Other",
    roles: [
      { folder: "Documents", kinds: ["document"] },
      { folder: "Images", kinds: ["image"] },
      { folder: "Video", kinds: ["video"] },
      { folder: "Audio", kinds: ["audio"] },
      { folder: "Archives", exts: ARCHIVE },
      { folder: "Code", kinds: ["code"] },
    ],
  },
  {
    id: "designer",
    label: "Graphic designer",
    blurb: "Brief and research apart from working files, assets, fonts and exports.",
    icon: "palette",
    discipline: "Design",
    detect: ["psd", "ai", "indd", "sketch", "fig", "xd", "afdesign", "afphoto", "cdr", "ttf", "otf", "eps"],
    strong: ["psd", "ai", "indd", "sketch", "afdesign", "afphoto"],
    kinds: ["image", "document"],
    fallback: "Other",
    roles: [
      { folder: "Brief & Contracts", keywords: ["brief", "contract", "invoice", "quote", "proposal", "sow", "approval"] },
      { folder: "Research & References", keywords: ["mood", "reference", "ref ", "inspiration", "research", "competitor", "swipe", "storyboard"] },
      { folder: "Working Files", exts: ["psd", "psb", "ai", "indd", "idml", "sketch", "fig", "xd", "afdesign", "afphoto", "cdr", "eps", "afpub"] },
      { folder: "Exports", keywords: ["export", "final", "print", "web", "social", "deliver", "approved", "proof"] },
      { folder: "Assets", exts: ["png", "jpg", "jpeg", "svg", "webp", "gif", "abr", "pat", "ase", "mockup", "tif", "tiff"] },
      { folder: "Fonts", exts: ["ttf", "otf", "woff", "woff2"] },
      { folder: "Documents", exts: ["pdf", "docx", "doc", "txt", "xlsx", "csv", "md"] },
      { folder: "Archive", exts: ARCHIVE },
    ],
  },
  {
    id: "video",
    label: "Video editor",
    blurb: "Numbered production folders: footage, audio, projects, graphics, exports, proxies.",
    icon: "video",
    discipline: "Video",
    detect: ["prproj", "drp", "veg", "fcpxml", "fcpproject", "mxf", "braw", "r3d", "mts", "m2ts", "mov", "mp4", "wav", "mp3", "aif", "aiff", "m4a"],
    strong: ["prproj", "drp", "veg", "fcpxml", "braw", "r3d", "mxf"],
    kinds: ["video", "audio"],
    fallback: "Other",
    roles: [
      { folder: "Exports", keywords: ["export", "final", "render", "master", "deliver", "approved", "draft", "review", "youtube", "instagram"] },
      { folder: "Footage", exts: ["mp4", "mov", "mxf", "avi", "mkv", "mts", "m2ts", "braw", "r3d", "webm", "m4v"] },
      { folder: "Audio", kinds: ["audio"] },
      { folder: "Project Files", exts: ["prproj", "drp", "veg", "fcpxml", "fcpproject", "aep", "aepx", "xml", "edl", "aaf", "prtl", "motn"] },
      { folder: "Graphics", exts: ["psd", "psb", "ai", "svg", "png", "jpg", "jpeg", "mogrt", "tif", "tiff"], keywords: ["title", "lower third", "logo", "bumper", "overlay"] },
      { folder: "Proxies", keywords: ["proxy", "proxies"] },
      { folder: "LUTs", exts: ["cube", "3dl", "look"] },
      { folder: "Documents", exts: ["pdf", "docx", "doc", "txt", "md", "xlsx", "csv", "srt", "vtt"] },
      { folder: "Archive", exts: ARCHIVE },
    ],
  },
  {
    id: "motion",
    label: "Motion designer",
    blurb: "Project files, assets, footage, audio, scripts, renders and fonts in separate lanes.",
    icon: "sparkles",
    discipline: "Motion",
    detect: ["aep", "aepx", "c4d", "mogrt", "ffx", "jsx", "jsxbin", "prtl"],
    strong: ["aep", "aepx", "c4d", "mogrt", "ffx"],
    kinds: ["video", "image", "audio"],
    fallback: "Other",
    roles: [
      { folder: "Project Files", exts: ["aep", "aepx", "c4d", "mogrt", "ffx", "prproj", "blend", "hip", "prtl"] },
      { folder: "Renders", keywords: ["render", "preview", "playblast", "final", "draft", "export", "comp"] },
      { folder: "Assets", exts: ["psd", "psb", "ai", "svg", "png", "jpg", "jpeg", "eps", "tif", "tiff"], keywords: ["asset", "element", "overlay", "plate"] },
      { folder: "Footage", exts: ["mp4", "mov", "mxf", "braw", "r3d", "mts", "webm"] },
      { folder: "Audio", kinds: ["audio"] },
      { folder: "Scripts & Expressions", exts: ["jsx", "jsxbin", "py"] },
      { folder: "Fonts", exts: ["ttf", "otf", "woff", "woff2"] },
      { folder: "References", keywords: ["ref", "reference", "mood", "inspiration", "storyboard"] },
      { folder: "Documents", exts: ["pdf", "docx", "txt", "md", "csv"] },
    ],
  },
  {
    id: "animator",
    label: "Animator / 3D",
    blurb: "Scenes, rigs, models, textures, caches and playblasts kept apart.",
    icon: "layers",
    discipline: "3D",
    detect: ["blend", "ma", "mb", "max", "fbx", "obj", "ztl", "ztn", "abc", "usd", "usdz", "rig", "ass"],
    strong: ["blend", "ma", "mb", "max", "ztl", "ztn", "usdz"],
    kinds: ["video", "image"],
    fallback: "Other",
    roles: [
      { folder: "Scenes", exts: ["blend", "ma", "mb", "max", "c4d", "hip", "usd", "usdz"] },
      { folder: "Rigs", exts: ["rig", "fbx", "abc", "bvh"], keywords: ["rig", "skeleton", "armature"] },
      { folder: "Models", exts: ["obj", "fbx", "ztl", "ztn", "stl", "glb", "gltf", "abc", "usdz"] },
      { folder: "Textures", exts: ["png", "jpg", "jpeg", "exr", "tif", "tiff", "psd", "hdr", "hdri"] },
      { folder: "Renders", keywords: ["render", "playblast", "preview", "comp", "final"] },
      { folder: "Simulation Cache", exts: ["vdb", "bgeo", "bgeo.sc", "ass", "pc2", "mdd", "abc"] },
      { folder: "Audio", kinds: ["audio"] },
      { folder: "Reference", keywords: ["ref", "reference", "inspiration", "turnaround"] },
      { folder: "Documents", exts: ["pdf", "docx", "txt", "md", "csv"] },
    ],
  },
  {
    id: "uxui",
    label: "UI / UX designer",
    blurb: "Research, wireframes, UI, prototypes, icons, handoff — the product-design pipeline.",
    icon: "grid",
    discipline: "Product",
    detect: ["fig", "sketch", "xd", "proto", "principle", "studio"],
    strong: ["fig", "sketch", "xd"],
    kinds: ["image", "document"],
    fallback: "Other",
    roles: [
      { folder: "Research", keywords: ["research", "interview", "survey", "persona", "insight", "usability"] },
      { folder: "Wireframes", keywords: ["wireframe", "wire", "lo-fi", "lofi", "flow"] },
      { folder: "UI Screens", exts: ["fig", "sketch", "xd", "png", "jpg", "svg"], keywords: ["ui", "screen", "mock", "visual"] },
      { folder: "Prototypes", keywords: ["prototype", "proto", "demo", "interaction"] },
      { folder: "Assets & Icons", exts: ["svg", "ttf", "otf", "woff", "woff2", "png"], keywords: ["icon", "asset", "logo", "illustration"] },
      { folder: "Handoff", keywords: ["handoff", "spec", "dev", "tokens"] },
      { folder: "Documents", exts: ["pdf", "docx", "txt", "md", "csv", "json", "css"] },
      { folder: "Archive", exts: ARCHIVE },
    ],
  },
  {
    id: "coder",
    label: "Developer",
    blurb: "Conventional repository layout: source, tests, docs, assets, config, scripts.",
    icon: "code",
    discipline: "Code",
    detect: ["ts", "tsx", "js", "jsx", "rs", "py", "go", "java", "cs", "rb", "php", "c", "cpp", "h", "sql", "sh", "vue", "svelte"],
    strong: ["rs", "tsx", "go", "java", "cs", "vue", "svelte"],
    kinds: ["code", "document"],
    fallback: "Other",
    roles: [
      { folder: "Tests", keywords: ["test", "spec", "fixture", "mock", "e2e"] },
      { folder: "Docs", exts: ["md", "txt", "pdf", "rst"], keywords: ["readme", "changelog", "license", "contributing"] },
      { folder: "Config", exts: ["json", "yml", "yaml", "toml", "ini", "env", "lock", "conf"], keywords: ["dockerfile", "makefile", ".gitignore"] },
      { folder: "Scripts", exts: ["sh", "ps1", "bat", "cmd", "py"] },
      { folder: "Assets", exts: ["png", "jpg", "jpeg", "svg", "gif", "webp", "woff", "woff2", "ttf", "mp4"] },
      { folder: "Source", exts: ["ts", "tsx", "js", "jsx", "rs", "go", "java", "cs", "rb", "php", "c", "cpp", "h", "css", "html", "vue", "svelte", "sql", "kt", "swift"] },
      { folder: "Build", exts: ARCHIVE, keywords: ["dist", "build", "bundle", "release"] },
    ],
  },
  {
    id: "student",
    label: "Student",
    blurb: "Lectures, assignments, notes, readings, exams and slides — one folder per thing you do.",
    icon: "pencil",
    discipline: "Study",
    detect: ["pdf", "docx", "pptx", "xlsx", "ipynb", "tex", "epub", "odt"],
    strong: ["ipynb", "tex", "epub"],
    kinds: ["document", "image"],
    fallback: "Other",
    roles: [
      { folder: "Lectures", keywords: ["lecture", "lec", "week", "unit", "seminar", "class", "tutorial"] },
      { folder: "Assignments", keywords: ["assignment", "hw", "homework", "task", "lab", "project", "submission", "coursework"] },
      { folder: "Notes", keywords: ["note", "notes", "summary", "outline", "mindmap"] },
      { folder: "Readings", keywords: ["paper", "article", "reading", "journal", "chapter", "book", "reference", "thesis"] },
      { folder: "Exams", keywords: ["exam", "quiz", "midterm", "final", "revision", "past paper", "solution"] },
      { folder: "Slides", exts: ["ppt", "pptx", "key", "odp"] },
      { folder: "Admin", keywords: ["transcript", "certificate", "fee", "receipt", "id card", "enrol"] },
      { folder: "Documents", exts: ["pdf", "docx", "doc", "txt", "md", "xlsx", "csv"] },
      { folder: "Archive", exts: ARCHIVE },
    ],
  },
  {
    id: "business",
    label: "Business / admin",
    blurb: "Contracts, invoices, reports, decks, spreadsheets, minutes and archive.",
    icon: "doc",
    discipline: "Business",
    detect: ["xlsx", "xls", "pptx", "docx", "csv", "numbers", "pages", "key"],
    strong: ["xlsx", "xls", "numbers", "pages"],
    kinds: ["document"],
    fallback: "Other",
    roles: [
      { folder: "Contracts", keywords: ["contract", "agreement", "nda", "terms", "policy", "sow"] },
      { folder: "Invoices", keywords: ["invoice", "receipt", "bill", "quote", "purchase order", "po "] },
      { folder: "Reports", keywords: ["report", "summary", "statement", "audit", "review", "forecast"] },
      { folder: "Presentations", exts: ["ppt", "pptx", "key", "odp"] },
      { folder: "Spreadsheets", exts: ["xls", "xlsx", "csv", "numbers", "ods"] },
      { folder: "Meetings", keywords: ["minutes", "agenda", "meeting", "board"] },
      { folder: "Documents", exts: ["pdf", "docx", "doc", "txt", "md"] },
      { folder: "Archive", exts: ARCHIVE },
    ],
  },
  {
    id: "marketer",
    label: "Marketer",
    blurb: "Campaigns, creative, copy, data, reports and brand kit.",
    icon: "zap",
    discipline: "Marketing",
    detect: ["csv", "xlsx", "pptx", "ai", "psd", "eml", "msg"],
    strong: ["eml", "msg"],
    kinds: ["document", "image", "video"],
    fallback: "Other",
    roles: [
      { folder: "Campaigns", keywords: ["campaign", "launch", "promo", "brief", "strategy", "okr"] },
      { folder: "Creative", exts: ["psd", "ai", "png", "jpg", "jpeg", "mp4", "mov", "gif", "svg", "webp"], keywords: ["creative", "banner", "social", "ad", "carousel", "story"] },
      { folder: "Copy", keywords: ["copy", "caption", "blog", "email", "newsletter", "script", "headline"] },
      { folder: "Data", exts: ["csv", "xlsx", "xls", "json"], keywords: ["data", "leads", "audience", "list"] },
      { folder: "Reports", keywords: ["report", "deck", "results", "performance", "analytics"] },
      { folder: "Brand Kit", keywords: ["brand", "logo", "guideline", "styleguide", "kit", "palette"] },
      { folder: "Documents", exts: ["pdf", "docx", "doc", "txt", "md", "pptx", "ppt"] },
      { folder: "Archive", exts: ARCHIVE },
    ],
  },
  {
    id: "social",
    label: "Social media manager",
    blurb: "Reels, stills, captions, thumbnails, source files and scheduled posts.",
    icon: "image",
    discipline: "Social",
    detect: ["capcut", "srt", "vtt", "aep", "psd", "mp4", "jpg"],
    strong: ["capcut"],
    kinds: ["image", "video"],
    fallback: "Other",
    roles: [
      { folder: "Reels & Shorts", exts: ["mp4", "mov", "webm", "mkv", "m4v"], keywords: ["reel", "story", "short", "tiktok", "vertical"] },
      { folder: "Stills", exts: ["jpg", "jpeg", "png", "webp", "heic", "psd"], keywords: ["post", "carousel", "grid", "square"] },
      { folder: "Captions", exts: ["srt", "vtt"], keywords: ["caption", "copy", "hashtag", "script"] },
      { folder: "Thumbnails", keywords: ["thumb", "cover", "thumbnail"] },
      { folder: "Source Files", exts: ["aep", "psd", "prproj", "capcut", "ai", "mogrt"] },
      { folder: "Approved", keywords: ["approved", "scheduled", "ready", "final"] },
      { folder: "Documents", exts: ["pdf", "docx", "txt", "md", "csv", "xlsx"] },
      { folder: "Archive", exts: ARCHIVE },
    ],
  },
  {
    id: "photographer",
    label: "Photographer",
    blurb: "RAW, selects, edited, exports and documents per shoot — date-first.",
    icon: "image",
    discipline: "Photo",
    detect: ["cr2", "cr3", "nef", "arw", "dng", "orf", "raf", "rw2", "heic", "tif", "xmp"],
    strong: ["cr2", "cr3", "nef", "arw", "dng", "orf", "raf", "rw2"],
    kinds: ["image"],
    fallback: "Other",
    roles: [
      { folder: "RAW", exts: ["cr2", "cr3", "nef", "arw", "dng", "orf", "raf", "rw2", "raw", "heic"] },
      { folder: "Selects", keywords: ["select", "selects", "pick", "favorite", "keeper", "chosen"] },
      { folder: "Edited", exts: ["psd", "psb", "tif", "tiff", "xmp", "dng"] },
      { folder: "JPEG", exts: ["jpg", "jpeg", "png", "webp"] },
      { folder: "Exports", keywords: ["export", "web", "print", "social", "deliver", "gallery", "final"] },
      { folder: "Video", kinds: ["video"] },
      { folder: "Documents", exts: ["pdf", "docx", "txt", "md"], keywords: ["contract", "invoice", "release", "shot list", "brief"] },
      { folder: "Archive", exts: ARCHIVE },
    ],
  },
  {
    id: "musician",
    label: "Musician / producer",
    blurb: "Sessions, stems, bounces, samples, MIDI, presets and references — how studios file.",
    icon: "music",
    discipline: "Audio",
    detect: ["als", "flp", "logicx", "ptx", "rpp", "cpr", "npr", "reason", "band", "mid", "midi", "fxp", "fxb", "adg", "nki", "sylenth", "serum", "wav", "aif", "aiff", "mp3", "flac", "m4a", "ogg"],
    strong: ["als", "flp", "logicx", "ptx", "rpp", "cpr", "nki", "adg"],
    kinds: ["audio"],
    fallback: "Other",
    roles: [
      { folder: "Sessions", exts: ["als", "flp", "logicx", "ptx", "rpp", "cpr", "npr", "reason", "band", "song", "bundle"] },
      { folder: "Stems", keywords: ["stem", "stems", "trackout", "instrumental", "acapella", "vocal up"] },
      { folder: "Bounces & Mixes", keywords: ["bounce", "mix", "master", "render", "rough", "preview", "final"] },
      { folder: "References", keywords: ["ref", "reference", "demo", "idea", "inspiration"] },
      { folder: "Samples & Loops", exts: ["nki", "sfz", "rx2", "rex"], keywords: ["loop", "sample", "oneshot", "one shot", "kick", "snare", "hat", "perc", "clap", "808", "foley", "texture", "riser"] },
      { folder: "Audio Recordings", kinds: ["audio"] },
      { folder: "MIDI", exts: ["mid", "midi"] },
      { folder: "Presets", exts: ["fxp", "fxb", "adg", "vstpreset", "serum", "sylenth", "nmsv", "spf", "adv"] },
      { folder: "Docs & Lyrics", exts: ["txt", "pdf", "docx", "md"], keywords: ["lyric", "chord chart", "bpm", "notes", "split sheet", "contract"] },
      { folder: "Archive", exts: ARCHIVE },
    ],
  },
  {
    id: "architect",
    label: "Architect / CAD",
    blurb: "CAD, sheets, models, renders, site data, regulations and client documents.",
    icon: "grid",
    discipline: "CAD",
    detect: ["dwg", "dxf", "rvt", "skp", "3dm", "ifc", "pln", "dgn", "dwl", "dwl2"],
    strong: ["dwg", "dxf", "rvt", "skp", "ifc", "pln"],
    kinds: ["image", "document"],
    fallback: "Other",
    roles: [
      { folder: "CAD", exts: ["dwg", "dxf", "dgn", "rvt", "skp", "3dm", "ifc", "pln", "dwl", "dwl2"] },
      { folder: "Sheets & Drawings", exts: ["pdf", "dwf", "plt"], keywords: ["sheet", "plan", "section", "elevation", "detail"] },
      { folder: "Models & Renders", exts: ["jpg", "jpeg", "png", "exr", "tif", "tiff", "max", "blend", "lumion"], keywords: ["render", "visual", "3d", "model"] },
      { folder: "Site & Survey", keywords: ["site", "survey", "plot", "topo", "boundary", "geotech"] },
      { folder: "Client & Contracts", keywords: ["contract", "invoice", "brief", "client", "proposal", "fee"] },
      { folder: "Regulations", keywords: ["code", "regulation", "permit", "approval", "standard", "spec"] },
      { folder: "Documents", exts: ["docx", "txt", "md", "xlsx", "csv"] },
      { folder: "Archive", exts: ARCHIVE },
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
/* Templates                                                           */
/* ------------------------------------------------------------------ */

const TEMPLATES: Record<ProfessionId, { label: string; description: string; style: TemplateStyle }[]> = {
  general: [
    { label: "By type", description: "Documents, images, video, audio, archives, code.", style: "role" },
    { label: "Type + year", description: "Same lanes, split by year.", style: "role-year" },
    { label: "Project first", description: "A folder per project, then the type folders inside.", style: "project-role" },
    { label: "One folder per project", description: "Everything for a project together, no subfolders.", style: "project" },
  ],
  designer: [
    { label: "Studio folders", description: "Brief · Research · Working Files · Exports · Assets · Fonts.", style: "role" },
    { label: "Project → studio folders", description: "Each project gets the full studio skeleton.", style: "project-role" },
    { label: "Client → roles", description: "Client folder first, then working files and exports.", style: "project" },
    { label: "Roles by year", description: "Archive years on top, studio folders inside.", style: "role-year" },
  ],
  video: [
    { label: "Production folders", description: "Footage · Audio · Project Files · Graphics · Exports · Proxies.", style: "role" },
    { label: "Project → production folders", description: "The standard post-production tree per project.", style: "project-role" },
    { label: "Project only", description: "A folder per project, files kept together.", style: "project" },
    { label: "Roles by year", description: "Year archive with production folders inside.", style: "role-year" },
  ],
  motion: [
    { label: "Studio folders", description: "Projects · Renders · Assets · Footage · Audio · Scripts.", style: "role" },
    { label: "Project → studio folders", description: "Per-project skeleton for client work.", style: "project-role" },
    { label: "Project only", description: "One folder per project.", style: "project" },
    { label: "Roles by year", description: "Year archive with role folders inside.", style: "role-year" },
  ],
  animator: [
    { label: "3D folders", description: "Scenes · Rigs · Models · Textures · Renders · Caches.", style: "role" },
    { label: "Project → 3D folders", description: "Per-production 3D tree.", style: "project-role" },
    { label: "Project only", description: "One folder per shot or production.", style: "project" },
    { label: "Roles by year", description: "Year archive.", style: "role-year" },
  ],
  uxui: [
    { label: "Product pipeline", description: "Research · Wireframes · UI · Prototypes · Handoff.", style: "role" },
    { label: "Project → pipeline", description: "Per-feature or per-client product tree.", style: "project-role" },
    { label: "Project only", description: "One folder per product or feature.", style: "project" },
    { label: "Roles by year", description: "Year archive.", style: "role-year" },
  ],
  coder: [
    { label: "Repository layout", description: "Source · Tests · Docs · Assets · Config · Scripts.", style: "role" },
    { label: "Project → repository", description: "Each codebase gets the conventional layout.", style: "project-role" },
    { label: "Project only", description: "One folder per project.", style: "project" },
    { label: "Roles by year", description: "Year archive.", style: "role-year" },
  ],
  student: [
    { label: "Study folders", description: "Lectures · Assignments · Notes · Readings · Exams · Slides.", style: "role" },
    { label: "Course → study folders", description: "Every course gets the full study skeleton.", style: "project-role" },
    { label: "Course only", description: "One folder per course, files inside.", style: "project" },
    { label: "Roles by semester year", description: "Year on top, study folders inside.", style: "role-year" },
  ],
  business: [
    { label: "Office folders", description: "Contracts · Invoices · Reports · Decks · Spreadsheets · Meetings.", style: "role" },
    { label: "Account → office folders", description: "Per client or company tree.", style: "project-role" },
    { label: "Account only", description: "One folder per client.", style: "project" },
    { label: "Roles by year", description: "Year archive.", style: "role-year" },
  ],
  marketer: [
    { label: "Marketing folders", description: "Campaigns · Creative · Copy · Data · Reports · Brand.", style: "role" },
    { label: "Campaign → folders", description: "Each campaign keeps its own kit.", style: "project-role" },
    { label: "Campaign only", description: "One folder per campaign.", style: "project" },
    { label: "Roles by year", description: "Year archive.", style: "role-year" },
  ],
  social: [
    { label: "Content folders", description: "Reels · Stills · Captions · Thumbnails · Source · Approved.", style: "role" },
    { label: "Campaign → content folders", description: "Per-campaign content tree.", style: "project-role" },
    { label: "Campaign only", description: "One folder per campaign.", style: "project" },
    { label: "Roles by year", description: "Year archive.", style: "role-year" },
  ],
  photographer: [
    { label: "Shoot folders", description: "RAW · Selects · Edited · Exports · Documents.", style: "role" },
    { label: "Session → shoot folders", description: "Date-first sessions with the standard subfolders.", style: "date-role" },
    { label: "Client → shoot folders", description: "Client folder first, then RAW/Selects/Exports.", style: "project-role" },
    { label: "Roles by year", description: "Year archive with RAW, Selects and Exports inside.", style: "role-year" },
  ],
  musician: [
    { label: "Studio folders", description: "Sessions · Stems · Bounces · Samples · MIDI · Presets · References.", style: "role" },
    { label: "Song → studio folders", description: "Every song gets Sessions, Stems, Bounces, Samples and Notes.", style: "project-role" },
    { label: "Song only", description: "One folder per song, DAW files stay with their audio.", style: "project" },
    { label: "Roles by year", description: "Year archive with studio folders inside.", style: "role-year" },
  ],
  architect: [
    { label: "Practice folders", description: "CAD · Sheets · Models · Site · Client · Regulations.", style: "role" },
    { label: "Project → practice folders", description: "Full architectural project skeleton.", style: "project-role" },
    { label: "Project only", description: "One folder per building project.", style: "project" },
    { label: "Roles by year", description: "Year archive.", style: "role-year" },
  ],
};

const STYLE_SUFFIX: Record<TemplateStyle, string> = {
  role: "role",
  "project-role": "project-role",
  "role-year": "role-year",
  project: "project",
  "date-role": "date-role",
  discipline: "discipline",
};

export const STRUCTURE_TEMPLATES: StructureTemplate[] = PROFESSIONS.flatMap((profession) =>
  TEMPLATES[profession.id].map((template) => ({
    id: `${profession.id}:${STYLE_SUFFIX[template.style]}`,
    profession: profession.id,
    label: template.label,
    description: template.description,
    style: template.style,
  })),
);

export function templateById(id: string): StructureTemplate {
  return STRUCTURE_TEMPLATES.find((template) => template.id === id) ?? STRUCTURE_TEMPLATES[0];
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

/** What a role matched on — keywords beat extensions, extensions beat kinds. */
export function matchRole(
  profession: Profession,
  file: AppFile,
): { folder: string; via: "keyword" | "ext" | "kind" | "fallback" } {
  const lowerName = file.name.toLowerCase();
  // Pass 1 — name signals ("stems", "export", "contract") are the strongest.
  for (const role of profession.roles) {
    if (role.keywords?.some((keyword) => lowerName.includes(keyword))) return { folder: role.folder, via: "keyword" };
  }
  // Pass 2 — then extensions, then bare kinds.
  for (const role of profession.roles) {
    if (role.exts?.includes(file.ext)) return { folder: role.folder, via: "ext" };
  }
  for (const role of profession.roles) {
    if (role.kinds?.includes(file.kind)) return { folder: role.folder, via: "kind" };
  }
  return { folder: profession.fallback, via: "fallback" };
}

export function roleFor(profession: Profession, file: AppFile): RoleRule {
  const { folder } = matchRole(profession, file);
  return profession.roles.find((role) => role.folder === folder) ?? { folder: profession.fallback };
}

export function roleFolder(file: AppFile, structureId: string): string {
  const template = templateById(structureId);
  return roleFor(PROFESSION_BY_ID[template.profession], file).folder;
}

/* ------------------------------------------------------------------ */
/* Names                                                               */
/* ------------------------------------------------------------------ */

const VERSION_WORDS = new Set([
  "copy",
  "final",
  "finalfinal",
  "new",
  "old",
  "edit",
  "edited",
  "export",
  "exports",
  "version",
  "draft",
  "v",
  "rev",
  "backup",
  "temp",
  "test",
]);

/** Camera / messenger / OS noise that must never become a project name. */
const NOISE_PREFIX =
  /^(img|dsc|dscf|dscn|pict|pxl|mvi|vid|gopr|g\d{3}|gh\d{2}|dji|screenshot|screen[ -]?recording|whatsapp|telegram|received|untitled|new|audio|track|recording|take|voice[ -]?\d*|photo|image)[\s_-]*/i;

export function isNoiseStem(name: string): boolean {
  const base = name.replace(/\.[^.]+$/, "");
  return NOISE_PREFIX.test(base) || /^\d+$/.test(base.replace(/[\s_-]/g, ""));
}

/**
 * Best-effort project name from a file name:
 *   "acme-logo_v3_final.psd"        → "Acme Logo"
 *   "2026-05-15_Smith-Wedding_0012" → "Smith Wedding"
 *   "IMG_0421.CR3"                  → "" (no project)
 */
export function projectKey(file: AppFile): string {
  let base = file.name.replace(/\.[^.]+$/, "");
  // Drop a leading ISO date, keeping the descriptive part.
  base = base.replace(/^\d{4}[-_.]\d{2}[-_.]\d{2}[\s_-]*/, "");
  base = base.replace(NOISE_PREFIX, "");

  const tokens = base
    .split(/[\s_.-]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^v?\d+$/i.test(token) && !VERSION_WORDS.has(token.toLowerCase()));

  const kept = tokens.slice(0, 2);
  if (kept.length === 0) return "";
  return kept
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ")
    .slice(0, 42);
}

export function isoDate(file: AppFile): string {
  const date = new Date(file.modified);
  if (Number.isNaN(date.getTime())) return "";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function yearOf(file: AppFile): number {
  const year = new Date(file.modified).getFullYear();
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

/* ------------------------------------------------------------------ */
/* Structure plan                                                      */
/* ------------------------------------------------------------------ */

/** Relative folder for one file under one structure template. */
export function folderForStructure(file: AppFile, structureId: string): string {
  const template = templateById(structureId);
  const profession = PROFESSION_BY_ID[template.profession];
  const role = roleFor(profession, file).folder;
  const project = projectKey(file);

  switch (template.style) {
    case "role":
      return role;
    case "role-year":
      return `_${yearOf(file)}/${role}`;
    case "project-role":
      return project ? `${project}/${role}` : `Unsorted/${role}`;
    case "project":
      return project || `Unsorted`;
    case "date-role": {
      const date = isoDate(file);
      const session = project ? `${date}_${project}` : date || "Undated";
      return `${yearOf(file)}/${session}/${role}`;
    }
    default:
      return role;
  }
}

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

/**
 * Applies professional-looking numeric prefixes (`01_`, `02_`…) to role
 * folders, per parent, ordered by the profession's own role order. Numbering
 * happens at plan time, so a plan never ships 01 and 05 with nothing in 03.
 */
export function numberRoleFolders(
  paths: Map<string, string>,
  rank: (parent: string, leaf: string) => number | null,
): void {
  const groups = new Map<string, Set<string>>();
  for (const folder of paths.values()) {
    const cut = folder.lastIndexOf("/");
    const parent = cut < 0 ? "" : folder.slice(0, cut);
    const leaf = cut < 0 ? folder : folder.slice(cut + 1);
    if (rank(parent, leaf) === null) continue;
    const leaves = groups.get(parent) ?? new Set<string>();
    leaves.add(leaf);
    groups.set(parent, leaves);
  }

  const renamed = new Map<string, string>();
  for (const [parent, leaves] of groups) {
    const ordered = [...leaves].sort(
      (a, b) => (rank(parent, a) ?? 99) - (rank(parent, b) ?? 99) || a.localeCompare(b),
    );
    ordered.forEach((leaf, index) => {
      const prefix = `${index + 1}`.padStart(2, "0");
      renamed.set(`${parent}|${leaf}`, `${parent ? `${parent}/` : ""}${prefix}_${leaf.replace(/^\d+_/, "")}`);
    });
  }

  for (const [id, folder] of paths) {
    const cut = folder.lastIndexOf("/");
    const parent = cut < 0 ? "" : folder.slice(0, cut);
    const leaf = cut < 0 ? folder : folder.slice(cut + 1);
    const next = renamed.get(`${parent}|${leaf}`);
    if (next) paths.set(id, next);
  }
}

export interface StructureGroup {
  folder: string;
  files: number;
  bytes: number;
  reason: string;
}

export interface StructurePlan {
  /** file id → relative folder, already numbered. */
  folders: Map<string, string>;
  groups: StructureGroup[];
  /** Numeric template style, so the UI can explain what it did. */
  style: TemplateStyle;
}

/** The plan for a persona structure: every file's folder, numbered and counted. */
export function structurePlan(files: AppFile[], structureId: string): StructurePlan {
  const template = templateById(structureId);
  const profession = PROFESSION_BY_ID[template.profession];
  const folders = new Map<string, string>();
  const reasons = new Map<string, string>();

  for (const file of files) {
    const folder = folderForStructure(file, structureId);
    folders.set(file.id, folder);
    const role = roleFor(profession, file);
    const lower = file.name.toLowerCase();
    if (template.style === "project" || template.style === "project-role") {
      const project = projectKey(file);
      reasons.set(folder, project ? `project “${project}”` : "project name not clear from the file name");
    } else {
      const hit = role.keywords?.find((keyword) => lower.includes(keyword));
      const exts = role.exts?.slice(0, 2).join(", ");
      reasons.set(folder, hit ? `“${hit}” in the name` : exts ? `${exts} file` : `${file.kind} file`);
    }
  }

  numberRoleFolders(folders, (_parent, leaf) => {
    const index = profession.roles.findIndex((role) => role.folder === leaf);
    if (index >= 0) return index;
    return leaf === profession.fallback ? 98 : null;
  });

  const groups = new Map<string, StructureGroup>();
  for (const file of files) {
    const folder = folders.get(file.id) ?? "Other";
    const entry = groups.get(folder) ?? { folder, files: 0, bytes: 0, reason: reasons.get(folder) ?? "matched by type" };
    entry.files += 1;
    entry.bytes += file.size;
    groups.set(folder, entry);
  }

  return {
    folders,
    style: template.style,
    groups: [...groups.values()].sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true })),
  };
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
  /** Every profession with a non-zero weight, biggest first. */
  ranking: { profession: Profession; matched: number; confidence: number }[];
}

/**
 * Guesses the profession from the extension mix, weighting signature formats
 * (`.aep`, `.prproj`, `.als`, `.CR3`) far above generic ones (`.jpg`, `.pdf`).
 * Returns the general structure when nothing recognisable turns up.
 */
export function detectProfession(files: AppFile[]): ProfessionGuess {
  const total = Math.max(1, files.length);
  const scored = PROFESSIONS.filter((profession) => profession.detect.length > 0)
    .map((profession) => {
      const weak = new Set(profession.detect);
      const strong = new Set(profession.strong);
      let matched = 0;
      for (const file of files) {
        if (strong.has(file.ext)) matched += 3;
        else if (weak.has(file.ext)) matched += 1;
      }
      return { profession, matched, confidence: Math.min(99, Math.round((matched / total) * 34)) };
    })
    .filter((entry) => entry.matched > 0)
    .sort((a, b) => b.matched - a.matched);

  if (scored.length === 0 || scored[0].matched < 4) {
    return {
      profession: PROFESSION_BY_ID.general,
      confidence: 0,
      matched: scored[0]?.matched ?? 0,
      total: files.length,
      ranking: [],
    };
  }

  return {
    profession: scored[0].profession,
    confidence: Math.min(97, Math.round((scored[0].matched / (scored[0].matched + files.length)) * 100)),
    matched: scored[0].matched,
    total: files.length,
    runnerUp: scored[1] ? { profession: scored[1].profession, confidence: scored[1].confidence } : undefined,
    ranking: scored.slice(0, 4),
  };
}

/** A short, human explanation of why the guess was made. */
export function explainGuess(guess: ProfessionGuess): string {
  if (guess.confidence === 0) return "Not enough signal — pick a profession or use Smart.";
  return `${guess.matched} matching ${guess.matched === 1 ? "file" : "files"} of ${guess.total} point to ${guess.profession.label.toLowerCase()}.`;
}
