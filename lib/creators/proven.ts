/**
 * The "proven list": videos that already worked, which creators remake.
 * Pure rules only (no Firestore). Storage + jobs live in proven-db.ts.
 *
 *   ProvenVideos/{id}                    ProvenVideo (id = "<platform>_<post id>" or "idea_<random>")
 *   ProvenVideos/{id}/remakes/{key}      ProvenRemake (key = "<creator>_<date>_<slot>")
 *   ContentCreators/{id}/daily_picks/{date}  DailyPicks (stable for the creator's local day)
 *   ContentCreators/{id}/posting_days/{date}.videos[i].proven_id   remake attribution
 *
 * Founder-approved rules:
 *   - Seed: @aadi.keshah + Isai videos with >= 100K views come in as "suggested".
 *   - Auto-suggest: a creator post from the last 30 days with >= 100K views, or
 *     >= 3x that creator's normal (median views of their non-pinned posts over
 *     the last 30 days, per platform) and >= 20K.
 *   - Daily picks: 5 per creator (3 for format creators), least recently used
 *     first, never twice in a day, at most twice a week (soft), recent winners
 *     first among equals, audience respected.
 *   - Tired: flag only. >= 6 remakes by >= 3 creators over >= 2 weeks, most
 *     below each remaker's normal, and the original isn't still pulling views.
 */
import type { Platform, YyyyMmDd } from "./types";

export const PROVEN_COLLECTION = "ProvenVideos";
export const PROVEN_MIN_VIEWS = 100_000;
export const SUGGEST_MULTIPLE = 3;
export const SUGGEST_MULTIPLE_MIN_VIEWS = 20_000;
export const NORMAL_WINDOW_DAYS = 30;
export const SUGGEST_WINDOW_DAYS = 30;
export const DAILY_GIVEN = 5;
export const DAILY_GIVEN_FORMAT = 3;
export const MAX_PER_WEEK = 2;
/** Remakes that beat normal in this many days count as "recent wins". */
export const RECENT_WIN_DAYS = 14;
/** A remake is judged (beat / below normal) once it's this many days old, so fresh posts don't read as flops. */
export const REMAKE_JUDGE_AFTER_DAYS = 3;
export const TIRED_MIN_REMAKES = 6;
export const TIRED_MIN_CREATORS = 3;
export const TIRED_MIN_SPAN_DAYS = 14;
/** The original counts as "still pulling views" while it gains at least this many views a week. */
export const STILL_PULLING_WEEKLY_VIEWS = 10_000;
/** A founder idea goes to this many creators the next day. */
export const IDEA_CREATORS = 3;
/** Ideas stay with their test creators only for this long before joining everyone's rotation. */
export const IDEA_TEST_DAYS = 7;

export type ProvenStatus = "suggested" | "active" | "paused" | "retired";
export type ProvenSource = "seed" | "auto" | "founder_idea";
export type Audience = "men" | "women" | "any";

export interface ProvenStats {
  remakes: number;
  /** Judged remakes that beat the remaker's normal. */
  beat_normal: number;
  /** Remakes old enough to judge. */
  judged: number;
  creators: number;
  first_remake_on: YyyyMmDd | null;
  last_remake_on: YyyyMmDd | null;
  /** Judged remakes posted in the last RECENT_WIN_DAYS that beat normal. */
  recent_wins: number;
}

export interface TiredCheck {
  flagged: boolean;
  /** Plain-English reason (shown in admin). */
  reason: string;
  remakes: number;
  creators: number;
  span_days: number;
  below_normal: number;
  /** Original's views gained per week (null = unknown). */
  original_weekly_gain: number | null;
}

export interface ProvenVideo {
  source_url: string | null;
  platform: Platform | null;
  handle: string | null;
  posted_at: string | null;
  views: number;
  caption: string;
  transcript: string;
  /** First sentence of the transcript (editable by the founder). */
  hook_line: string;
  status: ProvenStatus;
  added_by: ProvenSource;
  created_at: string;
  approved_at: string | null;
  audience?: Audience;
  remake_count: number;
  last_used_at: string | null;
  stats: ProvenStats;
  // founder ideas
  idea_text?: string;
  talking_points?: string[];
  reference_url?: string;
  idea_assignments?: { creator_id: string; date: YyyyMmDd }[];
  // auto suggestions
  source_creator_id?: string;
  suggest_reason?: string;
  /** Still waiting on a transcript (fetch failed or ran out of time). */
  transcript_pending?: boolean;
  views_history?: { at: string; views: number }[];
  tired?: TiredCheck & { checked_at: string; kept_at?: string | null };
  hook_edited?: boolean;
  /** Came in at 100K+ from the daily scan and went straight to active. */
  auto_approved?: boolean;
  /** Cover image of the original (signed CDN URL; refreshed by the seed / daily job, can expire). */
  thumbnail_url?: string;
  /** Our own permanent copy of the cover (proven-media.ts). Wins over thumbnail_url. */
  media?: ProvenMedia;
  /** Who wrote talking_points on a proven video: "auto" (proven-beats.ts) or "admin" (never overwritten). */
  talking_points_source?: "auto" | "admin";
  /** The original's pinned-video ending, cleaned up (proven-beats.ts). "" or missing = none. */
  cta_line?: string;
  /** 2-4 word name for list rows (proven-beats.ts), e.g. "Pinch test". */
  short_title?: string;
  /** The whole hook from the transcript start (proven-beats.ts); hook_line is often only its first sentence. */
  hook_full?: string;
  /** The hook claims the speaker's own results; such videos aren't given out (proven-beats.ts). */
  hook_first_person?: boolean;
  /** Scroll-stopping on-screen text for the top of the video, separate from the spoken hook (proven-beats.ts). */
  header_text?: string;
  /** Beat generation bookkeeping (proven-beats.ts). */
  beats?: { generated_at?: string; model?: string; attempts?: number; last_error?: string; last_attempt_at?: string };
}

/** ProvenVideos/{id}.media: the mirrored cover, or why mirroring keeps failing. */
export interface ProvenMedia {
  /** Firebase Storage download-token URL (never expires). */
  thumbnail_url?: string;
  /** ~360px-wide JPEG of the same cover, for list rows. */
  thumb_small_url?: string;
  small_attempts?: number;
  mirrored_at?: string;
  attempts?: number;
  last_error?: string;
  last_attempt_at?: string;
}

export interface ProvenRemake {
  creator_id: string;
  creator_name: string;
  date: YyyyMmDd;
  slot: number;
  tiktok_url: string;
  instagram_url: string;
  views: { tiktok: number | null; instagram: number | null };
  normal: { tiktok: number | null; instagram: number | null };
  /** Average of views / normal over the platforms we could measure. */
  ratio: number | null;
  judged: boolean;
  beat: boolean;
  updated_at: string;
}

export interface DailyPick {
  slot: number;
  proven_id: string;
  /** The pick this one replaced, when the creator swapped. */
  swapped_from?: string;
}

export interface DailyPicks {
  date: YyyyMmDd;
  given: number;
  picks: DailyPick[];
  /** Every proven id swapped out today (never offered again today). */
  swapped_out: string[];
  created_at: string;
  updated_at: string;
  /**
   * Which detected posts the creator said remake which slot ("I posted it" in
   * the app, POST /api/creator/posts/check). Keyed by slot number as a string.
   */
  slot_attribution?: Record<string, SlotAttribution>;
}

export interface SlotAttribution {
  proven_id: string | null;
  tiktok_url?: string;
  instagram_url?: string;
  at: string;
}

export const emptyStats = (): ProvenStats => ({
  remakes: 0,
  beat_normal: 0,
  judged: 0,
  creators: 0,
  first_remake_on: null,
  last_remake_on: null,
  recent_wins: 0,
});

// ---------------------------------------------------------------- dates

const DAY_MS = 86400000;
const dayNum = (d: YyyyMmDd) => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd) / DAY_MS;
};
export const addDaysTo = (d: YyyyMmDd, n: number): YyyyMmDd => new Date((dayNum(d) + n) * DAY_MS).toISOString().slice(0, 10);
export const daysApart = (a: YyyyMmDd, b: YyyyMmDd): number => Math.round(dayNum(b) - dayNum(a));

// ---------------------------------------------------------------- text

/** First sentence of a transcript (falls back to the caption without hashtags). Max 200 chars. */
export function hookLineFrom(transcript: string, caption = ""): string {
  const first = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (!t) return "";
    const m = t.match(/^(.+?[.!?])(\s|$)/);
    const out = (m ? m[1] : t).trim();
    return out.length > 200 ? `${out.slice(0, 197).trimEnd()}...` : out;
  };
  return first(transcript) || first(String(caption).replace(/#[^\s#]+/g, "").replace(/@[^\s@]+/g, ""));
}

export function provenIdFor(platform: Platform, postId: string): string {
  return `${platform}_${postId}`;
}

// ---------------------------------------------------------------- normal views + suggestions

export function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export interface ViewPost {
  platform: Platform;
  posted_at: string;
  views: number;
  pinned: boolean;
}

/**
 * A creator's "normal": median views of their non-pinned posts posted in the
 * last NORMAL_WINDOW_DAYS. Pass `platform` for one platform. null = no posts.
 */
export function normalViews(posts: ViewPost[], nowIso: string, platform?: Platform): number | null {
  const now = Date.parse(nowIso);
  const from = now - NORMAL_WINDOW_DAYS * DAY_MS;
  return median(
    posts
      .filter((p) => !p.pinned && (!platform || p.platform === platform))
      .filter((p) => {
        const t = Date.parse(p.posted_at);
        return t >= from && t <= now;
      })
      .map((p) => p.views),
  );
}

/**
 * Why this creator post should be suggested for the proven list, or null.
 * `normal` is the creator's normal on the post's platform.
 */
export function suggestReason(post: ViewPost, normal: number | null, nowIso: string): string | null {
  if (post.pinned) return null;
  const age = Date.parse(nowIso) - Date.parse(post.posted_at);
  if (!(age >= 0 && age <= SUGGEST_WINDOW_DAYS * DAY_MS)) return null;
  if (post.views >= PROVEN_MIN_VIEWS) return `${fmtViews(post.views)} views`;
  if (normal && normal > 0 && post.views >= SUGGEST_MULTIPLE_MIN_VIEWS && post.views >= SUGGEST_MULTIPLE * normal) {
    return `${(post.views / normal).toFixed(1)}x this creator's normal (${fmtViews(normal)})`;
  }
  return null;
}

export function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

// ---------------------------------------------------------------- daily picks

export interface PickCandidate {
  id: string;
  /** Re-uploads of the same video share a format (formatGroups at DUPLICATE_SIMILARITY): doing one counts for all. */
  format?: string;
  /** Variations of one idea share a family (formatGroups at FAMILY_SIMILARITY), e.g. every pinch test: one per day. */
  family?: string;
  audience?: Audience;
  recent_wins: number;
  views: number;
}

export interface PickInput {
  candidates: PickCandidate[];
  /** proven id -> dates (before today) this creator was given it. */
  history: Record<string, YyyyMmDd[]>;
  date: YyyyMmDd;
  count: number;
  creatorId: string;
  creatorAudience?: Audience | null;
  /** Ids that must be included first (founder ideas assigned for this day). */
  forced?: string[];
  /** Ids never to pick (already on today's list, swapped out today). */
  exclude?: string[];
}

function audienceOk(video: Audience | undefined, creator: Audience | null | undefined): boolean {
  if (!video || video === "any" || !creator || creator === "any") return true;
  return video === creator;
}

/** Small stable hash so creators with the same history don't all get the same order. */
function spread(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Weighted random order key (lower = earlier): -ln(u) / weight, with u a stable
 * per-creator-per-day hash. Weight grows with views and recent wins.
 */
export function luckKey(seed: string, c: Pick<PickCandidate, "views" | "recent_wins">): number {
  const u = (spread(seed) + 1) / 4294967297;
  const weight = Math.log10(Math.max(c.views, 10)) + 2 * Math.max(0, c.recent_wins);
  return -Math.log(u) / weight;
}

/**
 * Candidates in pick order: least recently used by this creator first (never
 * used = oldest), then a per-creator per-day weighted shuffle (luckKey). Each entry carries this week's use count.
 */
export function rankCandidates(input: PickInput): { id: string; week: number; format: string }[] {
  const weekStart = addDaysTo(input.date, -6);
  const fmt = (c: PickCandidate) => c.format ?? c.id;
  // A format counts as used whenever any of its versions was given.
  const formatLast = new Map<string, string>();
  for (const c of input.candidates) {
    for (const d of input.history[c.id] ?? []) {
      if (d < input.date && d > (formatLast.get(fmt(c)) ?? "")) formatLast.set(fmt(c), d);
    }
  }
  return input.candidates
    .filter((c) => audienceOk(c.audience, input.creatorAudience))
    .map((c) => {
      const dates = (input.history[c.id] ?? []).filter((d) => d < input.date);
      const last = dates.reduce((m, d) => (d > m ? d : m), "");
      return { c, last, flast: formatLast.get(fmt(c)) ?? "", week: dates.filter((d) => d >= weekStart).length };
    })
    .map((x) => ({ ...x, luck: luckKey(`${input.creatorId}|${input.date}|${x.c.id}`, x.c) }))
    .sort(
      (a, b) =>
        a.flast.localeCompare(b.flast) ||
        a.last.localeCompare(b.last) ||
        // Among equally fresh videos: a weighted shuffle per creator per day, so creators
        // don't all get the same videos, while big and recently winning ones still come up more.
        a.luck - b.luck,
    )
    .map((x) => ({ id: x.c.id, week: x.week, format: fmt(x.c) }));
}

/**
 * Today's picks. Forced ideas first; then ranked candidates used fewer than
 * MAX_PER_WEEK times this week; then (soft cap) anyone else rather than leave
 * a slot empty. Never the same video twice in a day, so a list smaller than
 * `count` leaves the remaining slots empty.
 */
export function selectDailyPicks(input: PickInput): string[] {
  const out: string[] = [];
  const taken = new Set(input.exclude ?? []);
  const formatOf = new Map(input.candidates.map((c) => [c.id, c.family ?? c.format ?? c.id]));
  const usedFormats = new Set([...taken].map((id) => formatOf.get(id) ?? id));
  const add = (id: string, sameFormatOk = false) => {
    if (out.length >= input.count || taken.has(id)) return;
    const f = formatOf.get(id) ?? id;
    if (!sameFormatOk && usedFormats.has(f)) return;
    taken.add(id);
    usedFormats.add(f);
    out.push(id);
  };
  for (const id of input.forced ?? []) add(id, true);
  const ranked = rankCandidates(input);
  for (const r of ranked) if (r.week < MAX_PER_WEEK) add(r.id);
  for (const r of ranked) add(r.id);
  // Only when there are fewer families than slots: a second one from a family beats an empty slot.
  for (const r of ranked) add(r.id, true);
  return out;
}

/** Words that carry meaning in a hook (lowercase, 3+ letters). */
function hookWords(h: string): Set<string> {
  return new Set(h.toLowerCase().replace(/[^a-z ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));
}

/**
 * Groups near-identical videos (the same hook re-filmed) into formats: hooks
 * sharing at least half their words. Returns id -> format id (the group's
 * most viewed video). Videos without a hook are their own format.
 */
/** Hooks sharing this much are the same video posted again. */
export const DUPLICATE_SIMILARITY = 0.7;
/** Hooks sharing this much are variations of one idea (every pinch test, every scalp-move test). */
export const FAMILY_SIMILARITY = 0.5;

export function formatGroups(videos: { id: string; hook: string; views: number }[], threshold = DUPLICATE_SIMILARITY): Map<string, string> {
  const words = videos.map((v) => hookWords(v.hook));
  const parent = videos.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < videos.length; i++) {
    if (!words[i].size) continue;
    for (let j = i + 1; j < videos.length; j++) {
      if (!words[j].size) continue;
      let both = 0;
      for (const w of words[i]) if (words[j].has(w)) both++;
      if (both / (words[i].size + words[j].size - both) >= threshold) parent[find(i)] = find(j);
    }
  }
  const lead = new Map<number, number>();
  videos.forEach((v, i) => {
    const r = find(i);
    const cur = lead.get(r);
    if (cur === undefined || v.views > videos[cur].views) lead.set(r, i);
  });
  return new Map(videos.map((v, i) => [v.id, videos[lead.get(find(i))!].id]));
}

/** Replacement for a swapped pick under the same rules (null = nothing left to offer). */
export function swapCandidate(input: Omit<PickInput, "count" | "forced"> & { current: string[]; swappedOut: string[] }): string | null {
  const [id] = selectDailyPicks({
    ...input,
    count: 1,
    forced: [],
    exclude: [...(input.exclude ?? []), ...input.current, ...input.swappedOut],
  });
  return id ?? null;
}

/** Fill only the empty slots of an existing day (existing picks never move). */
export function topUpPicks(existing: DailyPick[], given: number, fresh: string[]): DailyPick[] {
  const bySlot = new Map(existing.map((p) => [p.slot, p]));
  const queue = [...fresh];
  const out: DailyPick[] = [];
  for (let slot = 0; slot < given; slot++) {
    const have = bySlot.get(slot);
    if (have) out.push(have);
    else if (queue.length) out.push({ slot, proven_id: queue.shift()! });
  }
  return out;
}

/** Is this founder idea still in its test window (only its assigned creators get it)? */
export function ideaInTest(v: Pick<ProvenVideo, "added_by" | "created_at">, nowIso: string): boolean {
  return v.added_by === "founder_idea" && Date.parse(nowIso) - Date.parse(v.created_at) < IDEA_TEST_DAYS * DAY_MS;
}

// ---------------------------------------------------------------- founder ideas

export interface IdeaCreator {
  id: string;
  status: string;
  /** Most recent date this creator was given a founder idea ("" = never). */
  last_idea_on: YyyyMmDd | "";
}

/**
 * Who tests a new idea: up to IDEA_CREATORS trial/active creators, the ones
 * who got an idea least recently first (stable tie-break by id hash + idea id).
 */
export function pickIdeaCreators(creators: IdeaCreator[], ideaId: string, n = IDEA_CREATORS): string[] {
  return creators
    .filter((c) => c.status === "active" || c.status === "trial")
    .sort((a, b) => a.last_idea_on.localeCompare(b.last_idea_on) || spread(`${ideaId}|${a.id}`) - spread(`${ideaId}|${b.id}`))
    .slice(0, n)
    .map((c) => c.id);
}

// ---------------------------------------------------------------- remakes

/** Put the day's pick ids on the posting rows by position (row i = pick slot i). Rows past the picks lose any stale id. */
export function stampProvenIds<T extends { proven_id?: string }>(rows: T[], pickIds: (string | undefined)[]): T[] {
  return rows.map((r, i) => {
    const { proven_id: _old, ...rest } = r;
    void _old;
    const id = pickIds[i];
    return (id ? { ...rest, proven_id: id } : rest) as T;
  });
}

/** Average views / normal over the platforms where both are known. */
export function remakeRatio(
  views: { tiktok: number | null; instagram: number | null },
  normal: { tiktok: number | null; instagram: number | null },
): number | null {
  const r: number[] = [];
  for (const p of ["tiktok", "instagram"] as const) {
    const v = views[p];
    const n = normal[p];
    if (v != null && n != null && n > 0) r.push(v / n);
  }
  return r.length ? r.reduce((s, x) => s + x, 0) / r.length : null;
}

export function statsFrom(remakes: Pick<ProvenRemake, "creator_id" | "date" | "judged" | "beat">[], today: YyyyMmDd): ProvenStats {
  if (!remakes.length) return emptyStats();
  const dates = remakes.map((r) => r.date).sort();
  const recentFrom = addDaysTo(today, -RECENT_WIN_DAYS);
  return {
    remakes: remakes.length,
    beat_normal: remakes.filter((r) => r.judged && r.beat).length,
    judged: remakes.filter((r) => r.judged).length,
    creators: new Set(remakes.map((r) => r.creator_id)).size,
    first_remake_on: dates[0],
    last_remake_on: dates[dates.length - 1],
    recent_wins: remakes.filter((r) => r.judged && r.beat && r.date >= recentFrom).length,
  };
}

/** Views gained per week from a views history (latest vs an observation at least 6 days older). null = unknown. */
export function weeklyGain(history: { at: string; views: number }[]): number | null {
  const h = [...history].filter((x) => x && Number.isFinite(x.views)).sort((a, b) => a.at.localeCompare(b.at));
  if (h.length < 2) return null;
  const last = h[h.length - 1];
  const lastMs = Date.parse(last.at);
  const older = [...h].reverse().find((x) => lastMs - Date.parse(x.at) >= 6 * DAY_MS);
  if (!older) return null;
  const days = (lastMs - Date.parse(older.at)) / DAY_MS;
  return Math.max(0, ((last.views - older.views) / days) * 7);
}

/** Does this video meet the remake side of the tired rule? (Cheap check before looking up the original.) */
export function remakesLookTired(remakes: Pick<ProvenRemake, "creator_id" | "date" | "judged" | "beat">[]): boolean {
  const judged = remakes.filter((r) => r.judged);
  if (judged.length < TIRED_MIN_REMAKES) return false;
  if (new Set(judged.map((r) => r.creator_id)).size < TIRED_MIN_CREATORS) return false;
  const dates = judged.map((r) => r.date).sort();
  if (daysApart(dates[0], dates[dates.length - 1]) < TIRED_MIN_SPAN_DAYS) return false;
  return judged.filter((r) => !r.beat).length * 2 > judged.length;
}

/**
 * The tired rule (flag only, never auto-retire). Counts judged remakes only.
 * Unknown original trend doesn't block the flag; the reason says so.
 */
export function tiredCheck(
  remakes: Pick<ProvenRemake, "creator_id" | "date" | "judged" | "beat">[],
  originalWeeklyGain: number | null,
): TiredCheck {
  const judged = remakes.filter((r) => r.judged);
  const dates = judged.map((r) => r.date).sort();
  const base = {
    remakes: judged.length,
    creators: new Set(judged.map((r) => r.creator_id)).size,
    span_days: dates.length ? daysApart(dates[0], dates[dates.length - 1]) : 0,
    below_normal: judged.filter((r) => !r.beat).length,
    original_weekly_gain: originalWeeklyGain,
  };
  if (!remakesLookTired(remakes)) return { ...base, flagged: false, reason: "Remakes are still doing fine (or there aren't enough yet)." };
  if (originalWeeklyGain != null && originalWeeklyGain >= STILL_PULLING_WEEKLY_VIEWS) {
    return { ...base, flagged: false, reason: `The original is still pulling about ${fmtViews(originalWeeklyGain)} views a week.` };
  }
  const trend =
    originalWeeklyGain == null
      ? "We couldn't tell if the original is still getting views."
      : `The original only gained about ${fmtViews(originalWeeklyGain)} views in the last week.`;
  return {
    ...base,
    flagged: true,
    reason: `${base.below_normal} of ${base.remakes} remakes by ${base.creators} creators came in below their normal over ${base.span_days} days. ${trend}`,
  };
}
