/**
 * Content system inputs (pure): what the writer is told about the proven
 * library, past tests and the latest niche scan, and which items it may use.
 */
import { REVIVAL_FORMATS, type ContentScript, type ScriptSource } from "./content";
import { addDaysTo, median, type ProvenFormat, type ProvenVideo } from "./proven";
import type { YyyyMmDd } from "./types";

/** A family counts its remakes as "recent" over this many days. */
export const RECENT_REMAKE_DAYS = 21;
/** Scan candidates offered to the writer for the 3 adapted slots. */
export const SCAN_CANDIDATES = 8;
/** Niches an adaptation may come from, in order of preference. */
export const ADAPT_NICHES = ["hair", "tests", "posture", "face", "men"];

export type LibVideo = Pick<ProvenVideo, "status" | "format" | "hook_family" | "views" | "hook_line" | "added_by" | "test_result"> & {
  id: string;
  hook_full?: string;
  stats: Pick<ProvenVideo["stats"], "remakes" | "beat_normal" | "judged" | "last_remake_on" | "recent_wins">;
  tired?: { flagged?: boolean } | null;
};

export interface FamilyRollup {
  family: string;
  format: ProvenFormat | "other";
  videos: number;
  median_views: number;
  remakes: number;
  /** Videos in the family remade within RECENT_REMAKE_DAYS. */
  recent: number;
  /** Judged remakes that beat the remaker's normal / judged (null = none judged). */
  beat_rate: number | null;
  recent_wins: number;
  tired: boolean;
  /** Best video in the family (most views), for list rows. */
  top: { id: string; hook: string };
}

const hookOf = (v: LibVideo) => v.hook_full || v.hook_line;

/** Active, in-rotation videos grouped by stored hook family (videos without one are left out). */
export function familyRollups(videos: LibVideo[], today: YyyyMmDd): FamilyRollup[] {
  const from = addDaysTo(today, -RECENT_REMAKE_DAYS);
  const groups = new Map<string, LibVideo[]>();
  for (const v of videos) {
    if (v.status !== "active" || !v.hook_family) continue;
    if (v.added_by === "founder_idea" && v.test_result !== "promoted") continue;
    const k = v.hook_family;
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  return [...groups].map(([family, list]) => {
    const judged = list.reduce((a, v) => a + (v.stats.judged ?? 0), 0);
    const beat = list.reduce((a, v) => a + (v.stats.beat_normal ?? 0), 0);
    const formats = new Map<string, number>();
    for (const v of list) formats.set(v.format ?? "other", (formats.get(v.format ?? "other") ?? 0) + 1);
    const top = [...list].sort((a, b) => b.views - a.views)[0];
    return {
      family,
      format: [...formats].sort((a, b) => b[1] - a[1])[0][0] as ProvenFormat,
      videos: list.length,
      median_views: median(list.map((v) => v.views)) ?? 0,
      remakes: list.reduce((a, v) => a + (v.stats.remakes ?? 0), 0),
      recent: list.filter((v) => (v.stats.last_remake_on ?? "") >= from).length,
      beat_rate: judged ? beat / judged : null,
      recent_wins: list.reduce((a, v) => a + (v.stats.recent_wins ?? 0), 0),
      tired: list.some((v) => !!v.tired?.flagged),
      top: { id: top.id, hook: hookOf(top) },
    };
  });
}

/** Families worth a new angle: not tired, high median, few recent remakes (best first). */
export function strongFamilies(rollups: FamilyRollup[], n = 6): FamilyRollup[] {
  return rollups
    .filter((r) => !r.tired && !/unknown/i.test(r.family))
    .sort((a, b) => b.median_views / (1 + b.recent) - a.median_views / (1 + a.recent) || a.family.localeCompare(b.family))
    .slice(0, n);
}

/** Families whose recent remakes beat creators' normal (rising). */
export function risingFamilies(rollups: FamilyRollup[]): FamilyRollup[] {
  return rollups
    .filter((r) => !r.tired && r.recent_wins > 0 && (r.beat_rate ?? 0) >= 0.5)
    .sort((a, b) => b.recent_wins - a.recent_wins || (b.beat_rate ?? 0) - (a.beat_rate ?? 0));
}

export interface FormatRollup {
  format: ProvenFormat | "other";
  count: number;
  median_views: number;
  recent: number;
}

export function formatRollups(videos: LibVideo[], today: YyyyMmDd): FormatRollup[] {
  const from = addDaysTo(today, -RECENT_REMAKE_DAYS);
  const by = new Map<string, LibVideo[]>();
  for (const v of videos) if (v.status === "active") by.set(v.format ?? "other", [...(by.get(v.format ?? "other") ?? []), v]);
  return [...by].map(([format, list]) => ({
    format: format as ProvenFormat,
    count: list.length,
    median_views: median(list.map((v) => v.views)) ?? 0,
    recent: list.filter((v) => (v.stats.last_remake_on ?? "") >= from).length,
  })).sort((a, b) => b.count - a.count);
}

/** Revival formats ranked: strong median, least used lately. */
export function revivalFormats(formats: FormatRollup[], n = 2): ProvenFormat[] {
  const known = new Map(formats.map((f) => [f.format, f]));
  return [...REVIVAL_FORMATS]
    .sort((a, b) => {
      const fa = known.get(a);
      const fb = known.get(b);
      const score = (f?: FormatRollup) => (f ? f.median_views / (1 + f.recent) : 0);
      return score(fb) - score(fa) || a.localeCompare(b);
    })
    .slice(0, n);
}

export interface ScanItem {
  url: string;
  handle: string;
  platform: "tiktok" | "instagram";
  niche: string;
  views: number;
  likes?: number;
  caption: string;
  transcript?: string;
  cover?: string;
  cover_mirror?: string;
}

const scoreOf = (v: ScanItem) => v.views || (v.likes ?? 0) * 20;

/** Every item of a scan, deduped by url, best first (videos, accounts and the hair list). */
export function scanItems(scan: { videos?: ScanItem[]; accounts?: ScanItem[]; hair?: ScanItem[] } | null): ScanItem[] {
  if (!scan) return [];
  const seen = new Set<string>();
  const out: ScanItem[] = [];
  for (const v of [...(scan.hair ?? []), ...(scan.accounts ?? []), ...(scan.videos ?? [])]) {
    if (!v?.url || seen.has(v.url)) continue;
    seen.add(v.url);
    out.push(v);
  }
  return out.sort((a, b) => scoreOf(b) - scoreOf(a));
}

const NOISE = /\b(prank|funny|meme|asmr|lol|wig reveal|filter|capcut)\b|😂|💀/i;

/**
 * Scan items the writer may adapt: relevant niches, not noise, not already
 * adapted; items with a transcript first, then by views.
 */
export function adaptCandidates(items: ScanItem[], usedUrls: Set<string>, n = SCAN_CANDIDATES): ScanItem[] {
  return items
    .filter((v) => ADAPT_NICHES.includes(v.niche) && !usedUrls.has(v.url) && !NOISE.test(v.caption ?? ""))
    .sort((a, b) => Number(!!b.transcript?.trim()) - Number(!!a.transcript?.trim()) || scoreOf(b) - scoreOf(a))
    .slice(0, n);
}

export interface TestOutcome {
  source: ScriptSource;
  format: string;
  hook_family: string;
  title: string;
  result: "won" | "dropped" | "running" | "borderline";
  best_views: number | null;
}

/** Win / loss counts by key (for the writer and the founder page). */
export function tally<T>(rows: T[], key: (r: T) => string, won: (r: T) => boolean): { key: string; tested: number; won: number }[] {
  const m = new Map<string, { key: string; tested: number; won: number }>();
  for (const r of rows) {
    const k = key(r);
    const e = m.get(k) ?? { key: k, tested: 0, won: 0 };
    e.tested++;
    if (won(r)) e.won++;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.tested - a.tested || a.key.localeCompare(b.key));
}

/** Rejected scripts with reasons (newest first), so the writer learns from them. */
export function rejectionLessons(scripts: Pick<ContentScript, "status" | "reject_reason" | "title" | "hook" | "source" | "history">[], n = 20) {
  return scripts
    .filter((s) => s.status === "rejected" || s.status === "replaced")
    .map((s) => ({ title: s.title, hook: s.hook, source: s.source, reason: s.reject_reason || "(no reason given)", at: s.history.find((h) => h.kind === "reject")?.at ?? "" }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, n);
}
