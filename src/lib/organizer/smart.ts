/**
 * Smart arrange.
 *
 * Persona structures are opinionated: you pick a job, you get that job's folders.
 * Smart mode is the opposite — it reads the folder and decides.
 *
 * What it looks at
 *  - the extension mix, weighted by signature formats (.aep, .prproj, .als, .CR3)
 *    and by the kinds of file a profession actually works with,
 *  - file names: deliverable vs working, screenshots, installers, versions,
 *  - shared name stems, to find projects that are not in folders yet,
 *  - the date span, to decide whether a year archive is worth it,
 *  - how many disciplines are genuinely present, so design work *and* video work
 *    in one folder are split by discipline instead of being forced into one.
 *
 * Everything it decides is reported back with a reason, so the plan is
 * reviewable instead of magic.
 */

import {
  PROFESSION_BY_ID,
  PROFESSIONS,
  isoDate,
  isNoiseStem,
  matchRole,
  numberRoleFolders,
  projectKey,
  yearOf,
  type Profession,
  type ProfessionId,
  type RoleRule,
} from "./structures";
import { DEFAULT_SMART_OPTIONS, type AppFile, type SmartOptions } from "./types";

export const DEFAULT_SMART: SmartOptions = DEFAULT_SMART_OPTIONS;

export interface SmartGroup {
  folder: string;
  files: number;
  bytes: number;
  reason: string;
  sample: string[];
}

export interface SmartDiscipline {
  id: ProfessionId;
  label: string;
  discipline: string;
  files: number;
  share: number;
}

export interface SmartReport {
  headline: string;
  confidence: number;
  mixed: boolean;
  disciplines: SmartDiscipline[];
  projects: { name: string; files: number }[];
  groups: SmartGroup[];
  notes: string[];
  folders: number;
}

export interface SmartPlan {
  /** file id → relative folder ("Video/01_Footage", "Summer/02_Stems"). */
  folders: Map<string, string>;
  report: SmartReport;
}

/** Roles used when no profession fits — the "other field" case. */
const GENERIC_ROLES: RoleRule[] = [
  { folder: "Contracts & Invoices", keywords: ["contract", "agreement", "invoice", "receipt", "quote", "nda", "terms", "sow"] },
  { folder: "Final & Approved", keywords: ["final", "approved", "signed", "delivered", "print-ready"] },
  { folder: "Working Files", keywords: ["wip", "draft", "working", "revision", "rev ", "v1", "v2", "v3"] },
  { folder: "Documents", kinds: ["document"] },
  { folder: "Images", kinds: ["image"] },
  { folder: "Video", kinds: ["video"] },
  { folder: "Audio", kinds: ["audio"] },
  { folder: "Archives", exts: ["zip", "rar", "7z", "tar", "gz", "iso"] },
  { folder: "Code", kinds: ["code"] },
];

const DELIVERABLE = /\b(final|finale|export|exports|deliver|delivery|approved|mastered|print[ -]?ready|signed)\b/i;
const WORKING = /\b(wip|draft|working|revision|rev\d*|v\d+)\b/i;
const SCREENSHOT = /(screenshot|screen[ -]?shot|snip|screen capture|cleanshot|lightshot)/i;
const INSTALLER = /(setup|installer|install[-_ ]|\.(msi|msix|appx|dmg|pkg|deb|rpm)$)/i;
const INSTALLER_EXTS = ["exe", "msi", "msix", "appx", "dmg", "pkg", "zip", "rar", "7z"];

/**
 * Evidence that a file belongs to a profession.
 *   signature format (.aep, .prproj, .als, .CR3)  → 3
 *   signature name word ("stems", "footage", …)   → 2.5
 *   recognised extension (.jpg, .pdf, .wav)       → 1.5
 * A bare file kind (any picture whatsoever) counts for nothing on its own —
 * that is what made every folder look "mixed" before.
 */
function evidence(file: AppFile, profession: Profession): number {
  if (profession.id === "general") return 0.2;
  const role = matchRole(profession, file);
  let value = 0;
  if (profession.strong.includes(file.ext)) value = 3;
  else if (profession.detect.includes(file.ext)) value = 1.5;
  if (role.via === "keyword") value = Math.max(value, 2.5);
  if (value > 0 && profession.kinds.includes(file.kind)) value += 0.4;
  return value;
}

const scoreFile = evidence;

/** A profession only earns a discipline folder with signature evidence. */
function signatureCount(files: AppFile[], profession: Profession): number {
  const strong = new Set(profession.strong);
  return files.filter((file) => strong.has(file.ext)).length;
}

function keywordCount(files: AppFile[], profession: Profession): number {
  return files.filter((file) => matchRole(profession, file).via === "keyword").length;
}

function genericRole(file: AppFile): RoleRule {
  const lower = file.name.toLowerCase();
  for (const role of GENERIC_ROLES) {
    if (role.keywords?.some((keyword) => lower.includes(keyword))) return role;
    if (role.exts?.includes(file.ext)) return role;
    if (role.kinds?.includes(file.kind)) return role;
  }
  return { folder: "Other" };
}

function bestRole(profession: Profession, file: AppFile): RoleRule {
  if (profession.id === "general") return genericRole(file);
  const role = matchRole(profession, file);
  return profession.roles.find((entry) => entry.folder === role.folder) ?? { folder: profession.fallback };
}

function deliverableRole(profession: Profession): string | null {
  const role = profession.roles.find((entry) => /export|render|deliver|master|bounce|approved|final/i.test(entry.folder));
  return role?.folder ?? null;
}

function roleRank(profession: Profession): (leaf: string) => number | null {
  return (leaf: string) => {
    if (leaf === "Screenshots") return 96;
    if (leaf === "Installers") return 97;
    if (profession.id === "general") {
      const index = GENERIC_ROLES.findIndex((role) => role.folder === leaf);
      return index >= 0 ? index : leaf === "Other" ? 98 : null;
    }
    const index = profession.roles.findIndex((role) => role.folder === leaf);
    if (index >= 0) return index;
    return leaf === profession.fallback ? 98 : null;
  };
}

/** Files whose names share a stem become a project folder. */
function detectProjects(files: AppFile[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const key = projectKey(file);
    if (!key || key.length < 3 || isNoiseStem(file.name)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // A "project" needs at least three files; otherwise it is just a name.
  for (const [key, count] of [...counts.entries()]) {
    if (count < 3) counts.delete(key);
  }
  return counts;
}

export function smartPlan(files: AppFile[], options: SmartOptions): SmartPlan {
  const folders = new Map<string, string>();
  const reasons = new Map<string, string>();

  if (files.length === 0) {
    return {
      folders,
      report: {
        headline: "Nothing to analyse yet",
        confidence: 0,
        mixed: false,
        disciplines: [],
        projects: [],
        groups: [],
        notes: [],
        folders: 0,
      },
    };
  }

  /* ---- 1. which disciplines are genuinely present ----------------- */

  const scored = PROFESSIONS.filter((profession) => profession.id !== "general")
    .map((profession) => {
      let total = 0;
      let count = 0;
      for (const file of files) {
        const value = evidence(file, profession);
        if (value >= 1.5) {
          total += value;
          count += 1;
        }
      }
      return {
        profession,
        total,
        count,
        signature: signatureCount(files, profession),
        keywords: keywordCount(files, profession),
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.signature - a.signature || b.count - a.count || b.total - a.total);

  const top = scored[0];

  // No signature format and no repeated name words → the folder belongs to a
  // field we do not model. Generic semantic roles beat a wrong guess.
  const confident = Boolean(top) && (top.signature >= 1 || top.keywords >= 3);
  const chosen: Profession[] = [];
  if (top && confident) {
    chosen.push(top.profession);
    if (options.splitDisciplines) {
      for (const candidate of scored.slice(1, 3)) {
        const second = candidate;
        const qualifies =
          second.count >= 4 &&
          second.count >= files.length * 0.15 &&
          second.signature >= 1 &&
          (second.signature >= 2 || second.count >= top.count * 0.5);
        if (qualifies) chosen.push(second.profession);
      }
    }
  }
  const primary = chosen[0] ?? PROFESSION_BY_ID.general;
  const mixed = chosen.length > 1;

  /* ---- 2. project + year signals ---------------------------------- */

  const projectCounts = options.projectFolders ? detectProjects(files) : new Map<string, number>();
  const years = new Set(files.map((file) => yearOf(file)));
  const useYears = options.yearArchive && years.size >= 2;

  /* ---- 3. assign every file --------------------------------------- */

  const projects = new Map<string, number>();
  const disciplineFiles = new Map<ProfessionId, number>();
  const ownerByFile = new Map<string, Profession>();

  for (const file of files) {
    let owner = primary;
    let best = -1;
    for (const candidate of chosen) {
      const score = scoreFile(file, candidate);
      if (score > best) {
        best = score;
        owner = candidate;
      }
    }
    // No evidence at all never invents a discipline folder.
    if (best < 1.5) owner = primary;
    ownerByFile.set(file.id, owner);

    const role = bestRole(owner, file);
    const segments: string[] = [];
    const why: string[] = [];

    if (mixed) {
      segments.push(owner.discipline);
      why.push(`${owner.label.toLowerCase()} work`);
    }
    if (useYears && owner.id !== "photographer") segments.push(`_${yearOf(file)}`);

    const key = projectKey(file);
    const projectQualified = options.projectFolders && Boolean(key) && (projectCounts.get(key) ?? 0) >= 3;

    let leaf = role.folder;

    if (SCREENSHOT.test(file.name)) {
      leaf = "Screenshots";
      why.push("screenshot name");
    } else if (INSTALLER.test(file.name) && INSTALLER_EXTS.includes(file.ext)) {
      leaf = "Installers";
      why.push("installer / setup package");
    } else if (DELIVERABLE.test(file.name) && owner.id !== "general") {
      const exportRole = deliverableRole(owner);
      if (exportRole && exportRole !== leaf) {
        leaf = exportRole;
        why.push("name says final / export / approved");
      } else {
        why.push(`“${leaf}” from the file name`);
      }
    } else if (WORKING.test(file.name)) {
      why.push("working version");
    } else if (role.keywords?.some((keyword) => file.name.toLowerCase().includes(keyword))) {
      why.push(`“${role.keywords.find((keyword) => file.name.toLowerCase().includes(keyword))}” in the name`);
    } else if (role.exts?.length) {
      why.push(`${role.exts.slice(0, 2).join(", ")} files`);
    } else {
      why.push(`${owner.label.toLowerCase()} ${file.kind} file`);
    }

    if (owner.id === "photographer") {
      // Shoots are filed by date first — that is the one convention every
      // photographer shares.
      const date = isoDate(file);
      const session = projectQualified && key ? `${date}_${key}` : date || "Undated";
      segments.push(`${yearOf(file)}`, session);
      why.push("date-first session folder");
      if (projectQualified && key) projects.set(key, (projects.get(key) ?? 0) + 1);
    } else if (projectQualified && key) {
      segments.push(key);
      projects.set(key, (projects.get(key) ?? 0) + 1);
      why.push(`project “${key}”`);
    }

    segments.push(leaf);
    const folder = segments.filter(Boolean).join("/");
    folders.set(file.id, folder);
    reasons.set(file.id, why.join(" · "));
    disciplineFiles.set(owner.id, (disciplineFiles.get(owner.id) ?? 0) + 1);
  }

  /* ---- 4. number the role folders --------------------------------- */

  const rankByFolder = new Map<string, number>();
  for (const file of files) {
    const folder = folders.get(file.id);
    if (!folder) continue;
    const cut = folder.lastIndexOf("/");
    const parent = cut < 0 ? "" : folder.slice(0, cut);
    const leaf = cut < 0 ? folder : folder.slice(cut + 1);
    const owner = ownerByFile.get(file.id) ?? primary;
    const rank = roleRank(owner)(leaf);
    if (rank !== null) rankByFolder.set(`${parent}|${leaf}`, rank);
  }
  numberRoleFolders(folders, (parent, leaf) => {
    const rank = rankByFolder.get(`${parent}|${leaf}`);
    return rank === undefined ? null : rank;
  });

  /* ---- 5. report --------------------------------------------------- */

  const byFolder = new Map<string, { files: number; bytes: number; samples: string[]; reasons: string[] }>();
  for (const file of files) {
    const folder = folders.get(file.id) ?? "Other";
    const entry = byFolder.get(folder) ?? { files: 0, bytes: 0, samples: [], reasons: [] };
    entry.files += 1;
    entry.bytes += file.size;
    if (entry.samples.length < 3) entry.samples.push(file.name);
    entry.reasons.push(reasons.get(file.id) ?? "");
    byFolder.set(folder, entry);
  }

  const groups: SmartGroup[] = [...byFolder.entries()]
    .map(([folder, entry]) => {
      const counts = new Map<string, number>();
      for (const reason of entry.reasons) {
        const key = reason.split(" · ").pop() ?? reason;
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const topReason = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "matched by type";
      return { folder, files: entry.files, bytes: entry.bytes, reason: topReason, sample: entry.samples };
    })
    .sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true }));

  const disciplines: SmartDiscipline[] = chosen.map((profession) => ({
    id: profession.id,
    label: profession.label,
    discipline: profession.discipline,
    files: disciplineFiles.get(profession.id) ?? 0,
    share: Math.round(((disciplineFiles.get(profession.id) ?? 0) / files.length) * 100),
  }));

  const covered = files.filter((file) => evidence(file, ownerByFile.get(file.id) ?? primary) >= 1.5).length;
  const confidence = Math.max(
    24,
    Math.min(97, Math.round(30 + (covered / files.length) * 52 + (projects.size > 0 ? 7 : 0) + (mixed ? 4 : 0))),
  );

  const notes: string[] = [];
  if (mixed) {
    notes.push(`Mixed work: ${disciplines.map((entry) => `${entry.label.toLowerCase()} ${entry.share}%`).join(" + ")} — split by discipline.`);
  } else if (primary.id === "general") {
    notes.push("No profession fits this folder — contracts, documents, media and archives are separated by meaning.");
  } else {
    notes.push(`Mostly ${primary.label.toLowerCase()} work — one discipline, so no extra nesting.`);
  }
  if (projects.size > 0) {
    notes.push(`${projects.size} project${projects.size === 1 ? "" : "s"} found from shared file names.`);
  }
  if (useYears) notes.push(`${years.size} years of files — archive folders keep old work out of the way.`);
  if (chosen.some((profession) => profession.id === "photographer")) {
    notes.push("Photo-heavy folder: sessions are date-first, the way shot work is filed.");
  }
  if ([...byFolder.keys()].some((key) => key.endsWith("Screenshots"))) {
    notes.push("Screenshots are pulled out of the real work.");
  }

  return {
    folders,
    report: {
      headline: mixed
        ? `Mixed: ${chosen.map((profession) => profession.label.toLowerCase()).join(" + ")}`
        : primary.id === "general"
          ? "No single field detected — generic folders"
          : `${primary.label} folder`,
      confidence,
      mixed,
      disciplines,
      projects: [...projects.entries()].map(([name, count]) => ({ name, files: count })).sort((a, b) => b.files - a.files),
      groups,
      notes,
      folders: byFolder.size,
    },
  };
}
