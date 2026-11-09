/**
 * Demo dataset used by the browser build (and by `npm run dev` before a folder
 * is picked). It is deliberately messy: duplicate photos, two copies of the same
 * invoice, near-identical audio takes and a couple of collisions — exactly the
 * situations the planner has to handle.
 */

import { classify, extOf, uid } from "./engine";
import type { AppFile, FolderStyle, LogEntry } from "./types";

export const DEMO_ROOT = "C:\\Users\\Sam\\Desktop";

type Seed = [
  name: string,
  folder: string,
  size: number,
  modified: string,
  extra?: Partial<AppFile>,
];

const SEEDS: Seed[] = [
  // ---- photos -------------------------------------------------------
  ["beach-2019.jpg", "Inbox", 4_410_112, "2019-07-14T10:22:00", { width: 4032, height: 3024, hash: "9f2c17ab44de01c3" }],
  ["beach-2019 (1).jpg", "Downloads", 4_410_112, "2019-07-14T10:24:00", { width: 4032, height: 3024, hash: "9f2c17ab44de01c3" }],
  ["sunset.png", "Inbox", 1_820_416, "2023-05-02T19:41:00", { width: 3840, height: 2160, hash: "3ba90c11d2e7f540" }],
  ["sunset-final.png", "Inbox", 1_910_208, "2023-05-02T20:03:00", { width: 3840, height: 2160, hash: "ab1290cd7741b9e2" }],
  ["IMG_0421.HEIC", "Camera Roll", 3_120_640, "2024-11-02T08:15:00", { width: 4032, height: 3024, hash: "c41e88ab21d09f37" }],
  ["IMG_0421.HEIC", "Inbox", 3_120_640, "2024-11-02T08:15:00", { width: 4032, height: 3024, hash: "c41e88ab21d09f37" }],
  ["mountain-banner.webp", "Downloads", 720_896, "2022-01-18T12:00:00", { width: 2560, height: 1440 }],
  ["team-photo.jpg", "Inbox", 2_640_000, "2024-03-22T17:30:00", { width: 3000, height: 2000, hash: "77f0aa3182bc9e15" }],
  ["screenshot-2024-10-11.png", "Desktop", 480_512, "2024-10-11T09:12:00", { width: 1920, height: 1080 }],
  ["logo-draft.svg", "Projects", 42_112, "2023-09-01T14:45:00", { width: 512, height: 512 }],
  ["portrait-scan.tiff", "Archive", 26_400_000, "2022-08-05T11:02:00", { width: 6000, height: 8000 }],
  ["wallhaven-8k.jpg", "Downloads", 12_800_512, "2025-01-09T21:19:00", { width: 7680, height: 4320 }],

  // ---- video --------------------------------------------------------
  ["launch-demo.mp4", "Projects", 128_400_000, "2024-06-12T16:00:00", { duration: 214, width: 1920, height: 1080 }],
  ["launch-demo-final.mp4", "Projects", 141_200_000, "2024-06-14T09:32:00", { duration: 218, width: 1920, height: 1080 }],
  ["family-trip.mov", "Archive", 842_000_000, "2023-12-28T19:05:00", { duration: 512, width: 3840, height: 2160 }],
  ["screen-recording.webm", "Desktop", 18_600_000, "2025-02-02T13:40:00", { duration: 96, width: 2560, height: 1440 }],

  // ---- audio --------------------------------------------------------
  ["Midnight Drive.mp3", "Inbox", 8_400_000, "2024-02-14T22:10:00", { duration: 214 }],
  ["01 - midnight drive.mp3", "Downloads", 8_450_000, "2024-02-14T22:12:00", { duration: 215 }],
  ["midnight drive (remaster).mp3", "Inbox", 9_100_000, "2024-08-01T22:10:00", { duration: 218 }],
  ["Lo-fi Beat.wav", "Projects", 42_000_000, "2023-11-20T18:22:00", { duration: 238 }],
  ["lofi beat.wav", "Projects", 41_500_000, "2023-11-20T18:30:00", { duration: 236 }],
  ["Podcast Ep 12.m4a", "Downloads", 62_000_000, "2025-01-22T07:00:00", { duration: 2_640 }],
  ["voice-note-2024-05-06.m4a", "Inbox", 1_240_000, "2024-05-06T15:18:00", { duration: 64 }],

  // ---- documents ----------------------------------------------------
  [
    "invoice-march.pdf",
    "Inbox",
    184_320,
    "2024-03-30T10:00:00",
    { hash: "5d1180fa33bb7c02", textPreview: "INVOICE #2024-0311\nArrangeIt Ltd.\nTotal due: $1,284.00\nNet 30" },
  ],
  ["invoice-march copy.pdf", "Downloads", 184_320, "2024-03-30T10:02:00", { hash: "5d1180fa33bb7c02" }],
  ["Q3 roadmap.docx", "Projects", 96_256, "2024-07-08T09:15:00", { textPreview: "Q3 Roadmap\n1. Ship duplicate finder\n2. Folder styles\n3. Undo safety net" }],
  ["budget-2025.xlsx", "Documents", 1_180_672, "2025-01-03T08:00:00"],
  ["notes.txt", "Desktop", 4_200, "2025-02-11T23:58:00", { textPreview: "remember to\n- move the raw photos off C:\n- back up invoices\n- delete the 8k wallpaper (12 MB!)" }],
  ["README.md", "Projects", 2_140, "2024-12-01T12:00:00", { textPreview: "# ArrangeIt\nLocal-first file organizer.\nRust + Tauri 2 + React." }],
  ["thesis-final-v7.pdf", "Documents", 8_240_128, "2023-06-18T17:45:00"],

  // ---- archives -----------------------------------------------------
  ["project-backup.zip", "Archive", 240_000_000, "2024-04-01T00:00:00", { hash: "e0c1bb4499aa1204" }],
  ["project-backup (2).zip", "Downloads", 240_000_000, "2024-04-01T00:05:00", { hash: "e0c1bb4499aa1204" }],
  ["assets.rar", "Archive", 96_000_000, "2023-02-14T13:30:00"],

  // ---- code ---------------------------------------------------------
  ["engine.ts", "Projects", 18_432, "2025-02-09T10:10:00", { textPreview: "export function arrangePreview(files, rule) {\n  return files.map(...)\n}" }],
  ["App.tsx", "Projects", 42_048, "2025-02-09T11:22:00"],
  ["installer.msi", "Downloads", 84_000_000, "2024-09-19T16:00:00"],
];

function seedToFile([name, folder, size, modified, extra]: Seed, index: number): AppFile {
  return {
    id: uid(`file${index}`),
    name,
    path: `${DEMO_ROOT}\\${folder === "Desktop" ? "" : `${folder}\\`}${name}`,
    folder,
    ext: extOf(name),
    size,
    kind: classify(name),
    modified,
    ...extra,
  };
}

export const MOCK_FILES: AppFile[] = SEEDS.map(seedToFile);

export const MOCK_FOLDERS: { name: string; count: number; bytes: number }[] = [
  "Inbox",
  "Downloads",
  "Documents",
  "Projects",
  "Archive",
  "Camera Roll",
  "Desktop",
].map((name) => {
  const files = MOCK_FILES.filter((f) => f.folder === name);
  return { name, count: files.length, bytes: files.reduce((sum, f) => sum + f.size, 0) };
});

/** Pre-seeded activity so the log tab is never empty on first paint. */
export const DEMO_LOG: LogEntry[] = [
  {
    id: "log-seed-1",
    at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    kind: "scan",
    message: "Scanned Desktop",
    detail: `${MOCK_FILES.length} files · ${(MOCK_FILES.reduce((s, f) => s + f.size, 0) / 1e9).toFixed(2)} GB`,
  },
  {
    id: "log-seed-2",
    at: new Date(Date.now() - 1000 * 60 * 41).toISOString(),
    kind: "duplicate",
    message: "7 duplicate groups found",
    detail: "4 byte-identical · 2 audio · 1 image · 308 MB reclaimable",
  },
];

/** Two folders ship pre-styled so the folder tab demonstrates a saved state. */
export const DEMO_FOLDER_STYLES: Record<string, FolderStyle> = {
  Projects: {
    folder: "Projects",
    glyph: "star",
    color: "#38bdf8",
    tooltip: "ArrangeIt · active projects",
    hideSystemFiles: true,
  },
  Archive: {
    folder: "Archive",
    glyph: "briefcase",
    color: "#94a3b8",
    tooltip: "ArrangeIt · cold storage",
    hideSystemFiles: true,
  },
};

export const MOCK_LOG = DEMO_LOG;
