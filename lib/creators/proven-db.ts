/**
 * Proven list storage + jobs (rules are in proven.ts).
 *
 *   findProvenVideos      admin "Find proven videos": @aadi.keshah + Isai videos >= 100K -> "suggested"
 *   runProvenDaily        after the daily deep post sync: auto-suggest from creator posts,
 *                         attribute remakes, refresh stats + tired flags, fill missing transcripts
 *   getDailyPicks         a creator's picks for their local day (created once, then stable)
 *   swapPick              swap one pick for the next best active video
 *   addIdea / updateProven  admin actions
 */
import { randomBytes } from "node:crypto";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION, CreatorDataError, creatorToday, listCreators } from "./db";
import { isWeekday, localDate } from "./pay";
import {
  DAILY_GIVEN,
  DAILY_GIVEN_FORMAT,
  PROVEN_COLLECTION,
  PROVEN_MIN_VIEWS,
  REMAKE_JUDGE_AFTER_DAYS,
  addDaysTo,
  emptyStats,
  hookLineFrom,
  ideaInTest,
  normalViews,
  pickIdeaCreators,
  provenIdFor,
  remakeRatio,
  remakesLookTired,
  selectDailyPicks,
  stampProvenIds,
  statsFrom,
  suggestReason,
  swapCandidate,
  tiredCheck,
  topUpPicks,
  weeklyGain,
  type Audience,
  type DailyPick,
  type DailyPicks,
  type PickCandidate,
  type ProvenRemake,
  type ProvenStatus,
  type ProvenVideo,
  type SlotAttribution,
} from "./proven";
import { fetchRecentPosts, fetchTranscript, fetchVideoViews, postKey, type ScrapedPost } from "./scrape";
import type { CreatorPost, CreatorProfile, Platform, YyyyMmDd } from "./types";

/** Accounts the seed pulls from. */
export const SEED_SOURCES: { platform: Platform; handle: string; who: string }[] = [
  { platform: "tiktok", handle: "aadi.keshah", who: "Aadi" },
  { platform: "instagram", handle: "aadi.keshah", who: "Aadi" },
  { platform: "tiktok", handle: "isai.trujillo01", who: "Isai" },
  { platform: "instagram", handle: "isai.trujillo1", who: "Isai" },
];
/**
 * TikTok seed pages most-viewed first (10 a page), so it stops at the first
 * page with nothing over 100K. A local count found 87 of @aadi.keshah's top
 * 100 over 100K, so the cap leaves room for a few hundred.
 */
export const SEED_TIKTOK_MAX_PAGES = 40;
/** Instagram has no "popular" sort, so the seed walks the reels tab newest first (12 a page) up to this. */
export const SEED_INSTAGRAM_MAX_PAGES = 60;
/** Transcripts fetched in parallel (Instagram's take 10-30s each). */
export const TRANSCRIPT_CONCURRENCY = 8;
/** Most transcripts the daily job fills in per run (1 credit each). */
export const DAILY_TRANSCRIPT_CAP = 15;
/** How far back remakes are attributed and re-measured each day. */
export const REMAKE_LOOKBACK_DAYS = 45;
const SYNC_STATUSES = new Set(["onboarding", "trial", "active", "leaving"]);
const VIEWS_HISTORY_MAX = 60;

function fsdb(db?: Firestore): Firestore {
  return db ?? getFirebaseAdmin().db;
}

function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}

const AUDIENCES = new Set(["men", "women", "any"]);
function asAudience(v: unknown): Audience | undefined {
  return typeof v === "string" && AUDIENCES.has(v) ? (v as Audience) : undefined;
}

/** Stored doc -> ProvenVideo with defaults (older / partial docs never crash readers). */
export function toProven(d: DocumentData): ProvenVideo {
  return {
    source_url: d.source_url ?? null,
    platform: d.platform ?? null,
    handle: d.handle ?? null,
    posted_at: d.posted_at ?? null,
    views: Number(d.views ?? 0),
    caption: d.caption ?? "",
    transcript: d.transcript ?? "",
    hook_line: d.hook_line ?? "",
    status: d.status ?? "suggested",
    added_by: d.added_by ?? "seed",
    created_at: d.created_at ?? "",
    approved_at: d.approved_at ?? null,
    ...(asAudience(d.audience) ? { audience: asAudience(d.audience) } : {}),
    remake_count: Number(d.remake_count ?? 0),
    last_used_at: d.last_used_at ?? null,
    stats: { ...emptyStats(), ...(d.stats ?? {}) },
    ...(d.idea_text ? { idea_text: d.idea_text } : {}),
    ...(Array.isArray(d.talking_points) ? { talking_points: d.talking_points.map(String) } : {}),
    ...(d.talking_points_source === "auto" || d.talking_points_source === "admin" ? { talking_points_source: d.talking_points_source } : {}),
    ...(typeof d.cta_line === "string" && d.cta_line ? { cta_line: d.cta_line } : {}),
    ...(typeof d.short_title === "string" && d.short_title ? { short_title: d.short_title } : {}),
    ...(typeof d.hook_full === "string" && d.hook_full ? { hook_full: d.hook_full } : {}),
    ...(typeof d.hook_first_person === "boolean" ? { hook_first_person: d.hook_first_person } : {}),
    ...(d.reference_url ? { reference_url: d.reference_url } : {}),
    ...(Array.isArray(d.idea_assignments) ? { idea_assignments: d.idea_assignments } : {}),
    ...(d.source_creator_id ? { source_creator_id: d.source_creator_id } : {}),
    ...(d.suggest_reason ? { suggest_reason: d.suggest_reason } : {}),
    ...(d.transcript_pending ? { transcript_pending: true } : {}),
    ...(Array.isArray(d.views_history) ? { views_history: d.views_history } : {}),
    ...(d.tired ? { tired: d.tired } : {}),
    ...(d.hook_edited ? { hook_edited: true } : {}),
    ...(typeof d.thumbnail_url === "string" && d.thumbnail_url ? { thumbnail_url: d.thumbnail_url } : {}),
    ...(d.media && typeof d.media === "object" ? { media: d.media } : {}),
  };
}

export async function listProven(opts: { db?: Firestore } = {}): Promise<({ id: string } & ProvenVideo)[]> {
  const snap = await fsdb(opts.db).collection(PROVEN_COLLECTION).get();
  return snap.docs.map((d) => ({ id: d.id, ...toProven(d.data()) }));
}

function pushHistory(prev: unknown, nowIso: string, views: number): { at: string; views: number }[] {
  const h = Array.isArray(prev) ? [...(prev as { at: string; views: number }[])] : [];
  const last = h[h.length - 1];
  if (!last || Date.parse(nowIso) - Date.parse(last.at) >= 12 * 3600 * 1000 || last.views !== views) h.push({ at: nowIso, views });
  return h.slice(-VIEWS_HISTORY_MAX);
}

/** Run `fn` over items with at most `n` in flight. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => {
    for (let x = q.shift(); x !== undefined; x = q.shift()) await fn(x);
  }));
}

async function transcriptFor(platform: Platform, url: string, apiKey: string, fetchImpl?: typeof fetch) {
  try {
    const r = await fetchTranscript(platform, url, { apiKey, fetchImpl });
    return { text: r.text, ok: true };
  } catch {
    return { text: "", ok: false };
  }
}

// ================================================================ seed

export interface SeedSourceResult {
  platform: Platform;
  handle: string;
  ok: boolean;
  error?: string;
  pages: number;
  posts: number;
  over_100k: number;
  added: number;
  already_listed: number;
  truncated: boolean;
}

export interface SeedResult {
  dry_run: boolean;
  sources: SeedSourceResult[];
  added: number;
  transcripts_fetched: number;
  transcripts_pending: number;
  credits_used: number;
  credits_remaining: number | null;
}

/**
 * Pull every >= 100K video from the seed accounts and add the new ones as
 * "suggested" with a transcript (1 credit each). Videos already on the list
 * only get their views refreshed. dryRun: fetch + count, write nothing, no transcripts.
 * Transcripts stop when `deadlineMs` is near; those videos are saved with
 * transcript_pending and filled by the next run / the daily job.
 */
export async function findProvenVideos(opts: {
  db?: Firestore;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  dryRun?: boolean;
  now?: Date;
  deadlineMs?: number;
  sources?: typeof SEED_SOURCES;
  tiktokMaxPages?: number;
  instagramMaxPages?: number;
  log?: (m: string) => void;
}): Promise<SeedResult> {
  const apiKey = opts.apiKey ?? process.env.SCRAPECREATORS_API_KEY ?? "";
  if (!apiKey) throw new CreatorDataError("SCRAPECREATORS_API_KEY is not set", 500);
  const log = opts.log ?? (() => {});
  const nowIso = (opts.now ?? new Date()).toISOString();
  const deadline = opts.deadlineMs ?? Date.now() + 240_000;
  const out: SeedResult = {
    dry_run: !!opts.dryRun,
    sources: [],
    added: 0,
    transcripts_fetched: 0,
    transcripts_pending: 0,
    credits_used: 0,
    credits_remaining: null,
  };
  const winners: { post: ScrapedPost; handle: string }[] = [];
  // All accounts at once: walking Instagram's reels tab is the slow part.
  await Promise.all((opts.sources ?? SEED_SOURCES).map(async (src) => {
    const r: SeedSourceResult = { platform: src.platform, handle: src.handle, ok: true, pages: 0, posts: 0, over_100k: 0, added: 0, already_listed: 0, truncated: false };
    try {
      const f = await fetchRecentPosts(src.platform, src.handle, {
        apiKey,
        fetchImpl: opts.fetchImpl,
        sinceMs: 0, // no date stop: walk the whole profile up to the page cap
        // Leave time to save what we found and fetch some transcripts before
        // the request limit; the rest is picked up on the next press.
        deadlineMs: deadline - 110_000,
        ...(src.platform === "tiktok"
          ? { sortBy: "popular" as const, maxPages: opts.tiktokMaxPages ?? SEED_TIKTOK_MAX_PAGES, stopAfterPage: (page: ScrapedPost[]) => !page.some((p) => p.views >= PROVEN_MIN_VIEWS) }
          : { maxPages: opts.instagramMaxPages ?? SEED_INSTAGRAM_MAX_PAGES }),
      });
      r.pages = f.pages;
      r.posts = f.posts.length;
      r.truncated = f.truncated;
      out.credits_used += f.calls;
      if (f.credits_remaining != null) out.credits_remaining = f.credits_remaining;
      const big = f.posts.filter((p) => p.views >= PROVEN_MIN_VIEWS);
      r.over_100k = big.length;
      for (const p of big) winners.push({ post: p, handle: src.handle });
    } catch (e) {
      r.ok = false;
      r.error = errMsg(e);
    }
    log(`[proven seed] ${src.platform} @${src.handle}: ${r.ok ? `${r.posts} posts, ${r.over_100k} over 100K, ${r.pages} pages${r.truncated ? " (hit page cap)" : ""}` : `ERROR ${r.error}`}`);
    out.sources.push(r);
  }));
  const order = (opts.sources ?? SEED_SOURCES).map((x) => `${x.platform}:${x.handle}`);
  out.sources.sort((a, b) => order.indexOf(`${a.platform}:${a.handle}`) - order.indexOf(`${b.platform}:${b.handle}`));

  const db = opts.dryRun ? null : fsdb(opts.db);
  const col = db?.collection(PROVEN_COLLECTION);
  const existing = new Set<string>();
  if (col && winners.length) {
    const snaps = await db!.getAll(...winners.map((w) => col.doc(provenIdFor(w.post.platform, w.post.post_id))));
    const batch = db!.batch();
    snaps.forEach((s, i) => {
      if (!s.exists) return;
      existing.add(s.id);
      const thumb = winners[i].post.thumbnail_url;
      batch.update(s.ref, {
        views: winners[i].post.views,
        views_history: pushHistory(s.data()!.views_history, nowIso, winners[i].post.views),
        ...(thumb ? { thumbnail_url: thumb } : {}),
      });
    });
    if (existing.size) await batch.commit();
  } else if (opts.dryRun && winners.length) {
    try {
      const snaps = await fsdb(opts.db).getAll(...winners.map((w) => fsdb(opts.db).collection(PROVEN_COLLECTION).doc(provenIdFor(w.post.platform, w.post.post_id))));
      snaps.forEach((s) => s.exists && existing.add(s.id));
    } catch {
      /* dry run without Firestore: treat everything as new */
    }
  }
  const fresh = winners.filter((w) => !existing.has(provenIdFor(w.post.platform, w.post.post_id)));
  for (const s of out.sources) {
    const mine = winners.filter((w) => w.post.platform === s.platform && w.handle === s.handle);
    s.already_listed = mine.filter((w) => existing.has(provenIdFor(w.post.platform, w.post.post_id))).length;
    s.added = mine.length - s.already_listed;
  }
  out.added = fresh.length;
  if (opts.dryRun || !col) return out;

  await pool(fresh, TRANSCRIPT_CONCURRENCY, async ({ post, handle }) => {
    const id = provenIdFor(post.platform, post.post_id);
    let transcript = "";
    let pending = true;
    if (Date.now() < deadline - 35_000) {
      const t = await transcriptFor(post.platform, post.url, apiKey, opts.fetchImpl);
      out.credits_used++;
      transcript = t.text;
      pending = !t.ok;
      if (t.ok) out.transcripts_fetched++;
    }
    if (pending) out.transcripts_pending++;
    const doc: ProvenVideo = {
      source_url: post.url,
      platform: post.platform,
      handle,
      posted_at: post.posted_at,
      views: post.views,
      caption: post.caption,
      transcript,
      hook_line: hookLineFrom(transcript, post.caption),
      status: "suggested",
      added_by: "seed",
      created_at: nowIso,
      approved_at: null,
      remake_count: 0,
      last_used_at: null,
      stats: emptyStats(),
      views_history: [{ at: nowIso, views: post.views }],
      ...(pending ? { transcript_pending: true } : {}),
      ...(post.thumbnail_url ? { thumbnail_url: post.thumbnail_url } : {}),
    };
    try {
      await col.doc(id).create(doc);
    } catch (e) {
      if ((e as { code?: number }).code !== 6) throw e; // already exists (double press)
    }
  });

  // Pressing again also fills transcripts an earlier press ran out of time for.
  const pendingIds = [...existing];
  if (pendingIds.length && Date.now() < deadline - 35_000) {
    const snaps = await db!.getAll(...pendingIds.map((id) => col.doc(id)));
    const todo = snaps.filter((x) => x.exists && x.data()!.transcript_pending && x.data()!.source_url && x.data()!.platform);
    let filled = 0;
    await pool(todo, TRANSCRIPT_CONCURRENCY, async (x) => {
      if (Date.now() >= deadline - 35_000) return;
      const d = x.data()!;
      const t = await transcriptFor(d.platform, d.source_url, apiKey, opts.fetchImpl);
      out.credits_used++;
      if (!t.ok) return;
      await x.ref.update({ transcript: t.text, transcript_pending: false, ...(d.hook_edited ? {} : { hook_line: hookLineFrom(t.text, d.caption ?? "") }) });
      filled++;
    });
    out.transcripts_fetched += filled;
    out.transcripts_pending += todo.length - filled;
  }
  return out;
}

// ================================================================ admin actions

export type ProvenAction = "approve" | "dismiss" | "pause" | "retire" | "restore" | "keep" | "edit_hook" | "set_audience" | "edit_idea" | "edit_points";

export async function updateProven(
  id: string,
  action: ProvenAction,
  body: { hook_line?: string; audience?: string; talking_points?: unknown; reference_url?: string } = {},
  opts: { db?: Firestore; now?: Date } = {},
): Promise<{ id: string } & ProvenVideo> {
  const ref = fsdb(opts.db).collection(PROVEN_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new CreatorDataError("That video isn't on the list any more.", 404);
  const cur = toProven(snap.data()!);
  const nowIso = (opts.now ?? new Date()).toISOString();
  const patch: Record<string, unknown> = {};
  const status = (s: ProvenStatus) => {
    patch.status = s;
    patch.status_changed_at = nowIso;
  };
  switch (action) {
    case "approve":
    case "restore":
      status("active");
      if (!cur.approved_at) patch.approved_at = nowIso;
      break;
    case "dismiss":
      // Unticked suggestion: kept (retired) so the sync never suggests it again.
      status("retired");
      patch.dismissed = true;
      break;
    case "pause":
      status("paused");
      break;
    case "retire":
      status("retired");
      break;
    case "keep":
      if (cur.tired) patch.tired = { ...cur.tired, flagged: false, kept_at: nowIso };
      break;
    case "edit_hook": {
      const h = String(body.hook_line ?? "").replace(/\s+/g, " ").trim();
      if (!h) throw new CreatorDataError("The hook line can't be empty.");
      patch.hook_line = h.slice(0, 300);
      patch.hook_edited = true;
      break;
    }
    case "set_audience": {
      const a = asAudience(body.audience);
      if (!a) throw new CreatorDataError("Audience must be men, women or any.");
      patch.audience = a;
      break;
    }
    case "edit_idea": {
      if (cur.added_by !== "founder_idea") throw new CreatorDataError("Only ideas have talking points.");
      patch.talking_points = cleanPoints(body.talking_points);
      if (body.reference_url !== undefined) patch.reference_url = cleanUrl(body.reference_url);
      break;
    }
    case "edit_points": {
      // A proven video's beats (proven-beats.ts), edited by hand: never regenerated.
      if (cur.added_by === "founder_idea") throw new CreatorDataError("Edit an idea's talking points with edit_idea.");
      patch.talking_points = cleanPoints(body.talking_points);
      patch.talking_points_source = "admin";
      break;
    }
    default:
      throw new CreatorDataError("Unknown action");
  }
  await ref.update(patch);
  return { id, ...toProven({ ...snap.data(), ...patch }) };
}

function cleanPoints(v: unknown): string[] {
  const list = Array.isArray(v) ? v : String(v ?? "").split("\n");
  return list.map((s) => String(s).replace(/^[\s\-*•]+/, "").trim()).filter(Boolean).slice(0, 12).map((s) => s.slice(0, 300));
}

function cleanUrl(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (!/^https:\/\/[^\s]+$/i.test(s)) throw new CreatorDataError("The reference link must start with https://");
  return s.slice(0, 500);
}

/**
 * Founder idea: active straight away, assigned to up to 3 trial/active
 * creators for their next local posting day (as one of their given videos). Those
 * creators are the ones who got an idea least recently.
 */
export async function addIdea(
  input: { hook_line: string; talking_points?: unknown; reference_url?: string; idea_text?: string; audience?: string },
  opts: { db?: Firestore; now?: Date } = {},
): Promise<{ id: string } & ProvenVideo> {
  const db = fsdb(opts.db);
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const hook = String(input.hook_line ?? "").replace(/\s+/g, " ").trim();
  if (!hook) throw new CreatorDataError("Write the hook line first.");
  const points = cleanPoints(input.talking_points);
  const id = `idea_${randomBytes(6).toString("hex")}`;

  const [creators, all] = await Promise.all([listCreators(), listProven({ db })]);
  const lastIdea = new Map<string, string>();
  for (const v of all) {
    for (const a of v.idea_assignments ?? []) if ((lastIdea.get(a.creator_id) ?? "") < a.date) lastIdea.set(a.creator_id, a.date);
  }
  const chosen = pickIdeaCreators(
    creators.map((c) => ({ id: c.id, status: c.status, last_idea_on: lastIdea.get(c.id) ?? "" })),
    id,
  );
  const byId = new Map(creators.map((c) => [c.id, c]));
  // Their next posting day (tomorrow, or Monday from a Friday / weekend).
  const nextWeekday = (d: YyyyMmDd) => {
    let x = addDaysTo(d, 1);
    while (!isWeekday(x)) x = addDaysTo(x, 1);
    return x;
  };
  const assignments = chosen.map((cid) => ({ creator_id: cid, date: nextWeekday(creatorToday(byId.get(cid)!, now)) }));

  const doc: ProvenVideo = {
    source_url: null,
    platform: null,
    handle: null,
    posted_at: null,
    views: 0,
    caption: "",
    transcript: "",
    hook_line: hook.slice(0, 300),
    idea_text: String(input.idea_text ?? "").trim().slice(0, 2000),
    talking_points: points,
    reference_url: cleanUrl(input.reference_url),
    status: "active",
    added_by: "founder_idea",
    created_at: nowIso,
    approved_at: nowIso,
    ...(asAudience(input.audience) ? { audience: asAudience(input.audience) } : {}),
    remake_count: 0,
    last_used_at: null,
    stats: emptyStats(),
    idea_assignments: assignments,
  };
  await db.collection(PROVEN_COLLECTION).doc(id).set(doc);
  return { id, ...doc };
}

// ================================================================ daily picks

export interface PublicProven {
  id: string;
  kind: "video" | "idea";
  source_url: string | null;
  platform: Platform | null;
  handle: string | null;
  views: number;
  hook_line: string;
  transcript: string;
  talking_points: string[];
  /** The original's own pinned-video ending, cleaned up ("" = the app picks one from its library). */
  cta_line: string;
  reference_url: string | null;
  /** Cover of the original for list rows (small when we have one), null when we don't have one (the app shows a placeholder). */
  thumbnail_url: string | null;
  /** Full-size cover (Film this). */
  cover_url: string | null;
  /** 2-4 word name for the list row ("" = the app makes one from the hook). */
  short_title: string;
}

/** What "I posted it" found for a slot (null until something was attributed). */
export interface PickPosted {
  tiktok_url: string | null;
  instagram_url: string | null;
}

export interface PicksPayload {
  date: YyyyMmDd;
  given: number;
  picks: { slot: number; video: PublicProven; posted: PickPosted | null }[];
  /** Attributions for slots without a pick (a format creator's own concepts). */
  extra_posted: { slot: number; posted: PickPosted }[];
  /** No more active videos to swap in today. */
  can_swap: boolean;
}

function publicProven(id: string, v: ProvenVideo): PublicProven {
  return {
    id,
    kind: v.added_by === "founder_idea" ? "idea" : "video",
    source_url: v.source_url,
    platform: v.platform,
    handle: v.handle,
    views: v.views,
    // The generated full hook, unless the founder edited the hook by hand.
    hook_line: (!v.hook_edited && v.hook_full) || v.hook_line,
    transcript: v.transcript,
    talking_points: v.talking_points ?? [],
    cta_line: v.cta_line ?? "",
    reference_url: v.reference_url || null,
    // Lists get the small (~360px) cover; Film this shows cover_url.
    thumbnail_url: v.media?.thumb_small_url || v.media?.thumbnail_url || v.thumbnail_url || null,
    cover_url: v.media?.thumbnail_url || v.thumbnail_url || null,
    short_title: v.short_title ?? "",
  };
}

function pickPosted(a: SlotAttribution | undefined): PickPosted | null {
  if (!a || (!a.tiktok_url && !a.instagram_url)) return null;
  return { tiktok_url: a.tiktok_url || null, instagram_url: a.instagram_url || null };
}

export function givenCount(c: Pick<CreatorProfile, "format_creator">): number {
  return c.format_creator ? DAILY_GIVEN_FORMAT : DAILY_GIVEN;
}

interface PickContext {
  /** Ids of the active videos (the picks' full docs are loaded separately, see loadFull). */
  activeIds: Set<string>;
  candidates: PickCandidate[];
  forced: string[];
  history: Record<string, YyyyMmDd[]>;
  audience: Audience | undefined;
}

async function pickContext(db: Firestore, creator: CreatorProfile, date: YyyyMmDd, nowIso: string): Promise<PickContext> {
  const cref = db.collection(CREATORS_COLLECTION).doc(creator.id);
  const [activeSnap, histSnap, raw] = await Promise.all([
    // Only the fields picking needs: the full docs carry transcripts and view
    // histories (hundreds of KB for the whole list) and were read on every open.
    db
      .collection(PROVEN_COLLECTION)
      .where("status", "==", "active")
      .select("added_by", "created_at", "idea_assignments", "audience", "stats.recent_wins", "views", "hook_first_person")
      .get(),
    cref.collection("daily_picks").where("date", ">=", addDaysTo(date, -30)).get(),
    cref.get(),
  ]);
  const active = activeSnap.docs.map((d) => ({ id: d.id, ...toProven(d.data()) }));
  const forced = active
    .filter((v) => v.added_by === "founder_idea" && (v.idea_assignments ?? []).some((a) => a.creator_id === creator.id && a.date === date))
    .map((v) => v.id);
  const candidates = active
    // Hooks that claim the speaker's own results ("I fixed my hair loss") aren't given out.
    .filter((v) => !ideaInTest(v, nowIso) && !v.hook_first_person)
    .map((v) => ({ id: v.id, audience: v.audience, recent_wins: v.stats.recent_wins, views: v.views }));
  const history: Record<string, YyyyMmDd[]> = {};
  for (const d of histSnap.docs) {
    const p = d.data() as DailyPicks;
    if (p.date >= date) continue;
    for (const x of p.picks ?? []) (history[x.proven_id] ??= []).push(p.date);
  }
  return { activeIds: new Set(active.map((v) => v.id)), candidates, forced, history, audience: asAudience(raw.data()?.audience) };
}

/** Full docs for just these videos (the day's picks). */
async function loadFull(db: Firestore, ids: string[]): Promise<Map<string, ProvenVideo>> {
  const out = new Map<string, ProvenVideo>();
  const uniq = [...new Set(ids)];
  if (!uniq.length) return out;
  const snaps = await db.getAll(...uniq.map((id) => db.collection(PROVEN_COLLECTION).doc(id)));
  for (const s of snaps) if (s.exists) out.set(s.id, toProven(s.data()!));
  return out;
}

function payload(
  date: YyyyMmDd,
  given: number,
  picks: DailyPick[],
  byId: Map<string, ProvenVideo>,
  canSwap: boolean,
  attribution: Record<string, SlotAttribution> = {},
): PicksPayload {
  const shown = picks.filter((p) => byId.has(p.proven_id));
  const pickSlots = new Set(shown.map((p) => p.slot));
  return {
    date,
    given,
    picks: shown.map((p) => ({ slot: p.slot, video: publicProven(p.proven_id, byId.get(p.proven_id)!), posted: pickPosted(attribution[String(p.slot)]) })),
    extra_posted: Object.entries(attribution)
      .filter(([k]) => !pickSlots.has(Number(k)))
      .map(([k, a]) => ({ slot: Number(k), posted: pickPosted(a) }))
      .filter((x): x is { slot: number; posted: PickPosted } => Number.isInteger(x.slot) && !!x.posted)
      .sort((a, b) => a.slot - b.slot),
    can_swap: canSwap,
  };
}

/**
 * Thumbnails for picks whose original has none stored: the original is often
 * one of our own creators' posts (auto suggestions), whose post record keeps
 * the latest cover. Best effort; never fails the picks read.
 */
async function fillThumbnails(db: Firestore, ids: string[], byId: Map<string, ProvenVideo>): Promise<void> {
  const need = ids
    .map((id) => ({ id, v: byId.get(id) }))
    .filter((x): x is { id: string; v: ProvenVideo } => !!x.v && !x.v.media?.thumbnail_url && !x.v.thumbnail_url && !!x.v.source_creator_id && !!x.v.source_url && !!x.v.platform);
  if (!need.length) return;
  try {
    const refs = need.map(({ v }) => {
      const key = postKey(v.source_url!, v.platform!);
      const postId = key.slice(key.indexOf(":") + 1);
      return db.collection(CREATORS_COLLECTION).doc(v.source_creator_id!).collection("posts").doc(`${v.platform}_${postId}`);
    });
    const snaps = await db.getAll(...refs);
    snaps.forEach((s, i) => {
      const t = s.exists ? s.data()?.thumbnail_url : null;
      if (typeof t === "string" && t) byId.set(need[i].id, { ...need[i].v, thumbnail_url: t });
    });
  } catch {
    /* placeholder in the app */
  }
}

/**
 * The creator's picks for `date` (their local today by default). Created on
 * first read and stable for the day; empty slots (small list) are topped up
 * later as videos are approved. Weekends get none. Nothing is stored while
 * the active list is empty.
 */
export async function getDailyPicks(creator: CreatorProfile, opts: { db?: Firestore; now?: Date; date?: YyyyMmDd } = {}): Promise<PicksPayload> {
  const db = fsdb(opts.db);
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const date = opts.date ?? creatorToday(creator, now);
  const given = givenCount(creator);
  if (!isWeekday(date)) return { date, given, picks: [], extra_posted: [], can_swap: false };
  const ref = db.collection(CREATORS_COLLECTION).doc(creator.id).collection("daily_picks").doc(date);
  const [ctx, first] = await Promise.all([pickContext(db, creator, date, nowIso), ref.get()]);
  const firstDoc = first.exists ? (first.data() as DailyPicks) : null;

  // Usual case: the day's picks already exist and are full, so no transaction.
  const result = firstDoc && (firstDoc.picks ?? []).length >= given
    ? { picks: firstDoc.picks, swappedOut: firstDoc.swapped_out ?? [], added: [] as string[], attribution: firstDoc.slot_attribution ?? {} }
    : await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? (snap.data() as DailyPicks) : null;
    const existing = cur?.picks ?? [];
    const attribution = cur?.slot_attribution ?? {};
    if (existing.length >= given) return { picks: existing, swappedOut: cur?.swapped_out ?? [], added: [] as string[], attribution };
    const fresh = selectDailyPicks({
      candidates: ctx.candidates,
      history: ctx.history,
      date,
      count: given - existing.length,
      creatorId: creator.id,
      creatorAudience: ctx.audience,
      forced: ctx.forced,
      exclude: [...existing.map((p) => p.proven_id), ...(cur?.swapped_out ?? [])],
    });
    if (!fresh.length) return { picks: existing, swappedOut: cur?.swapped_out ?? [], added: [], attribution };
    const picks = topUpPicks(existing, given, fresh);
    const doc: DailyPicks = {
      date,
      given,
      picks,
      swapped_out: cur?.swapped_out ?? [],
      created_at: cur?.created_at ?? nowIso,
      updated_at: nowIso,
    };
    tx.set(ref, doc, { merge: true }); // merge keeps slot_attribution
    return { picks, swappedOut: doc.swapped_out, added: fresh, attribution };
  });
  if (result.added.length) {
    const batch = db.batch();
    for (const id of result.added) batch.update(db.collection(PROVEN_COLLECTION).doc(id), { last_used_at: nowIso });
    await batch.commit().catch(() => {});
  }
  // Full docs for the picks only (including any paused/retired since this morning: the day is stable).
  const ids = result.picks.map((p) => p.proven_id);
  const all = await loadFull(db, ids);
  await fillThumbnails(db, ids, all);
  const canSwap = !!swapCandidate({
    candidates: ctx.candidates,
    history: ctx.history,
    date,
    creatorId: creator.id,
    creatorAudience: ctx.audience,
    current: result.picks.map((p) => p.proven_id),
    swappedOut: result.swappedOut,
  });
  return payload(date, given, result.picks, all, canSwap, result.attribution);
}

/** Swap the pick in `slot` for the next best active video under the same rules. */
export async function swapPick(creator: CreatorProfile, slot: number, opts: { db?: Firestore; now?: Date } = {}): Promise<PicksPayload> {
  const db = fsdb(opts.db);
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const date = creatorToday(creator, now);
  const given = givenCount(creator);
  if (!Number.isInteger(slot) || slot < 0 || slot >= given) throw new CreatorDataError("That video can't be swapped.");
  const ref = db.collection(CREATORS_COLLECTION).doc(creator.id).collection("daily_picks").doc(date);
  const ctx = await pickContext(db, creator, date, nowIso);
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CreatorDataError("Today's videos aren't ready yet. Refresh and try again.", 409);
    const cur = snap.data() as DailyPicks;
    const at = cur.picks.find((p) => p.slot === slot);
    if (!at) throw new CreatorDataError("That video can't be swapped.");
    if (pickPosted(cur.slot_attribution?.[String(slot)])) throw new CreatorDataError("You already posted this one, so it can't be swapped.", 409);
    const swappedOut = [...new Set([...(cur.swapped_out ?? []), at.proven_id])];
    const next = swapCandidate({
      candidates: ctx.candidates,
      history: ctx.history,
      date,
      creatorId: creator.id,
      creatorAudience: ctx.audience,
      current: cur.picks.map((p) => p.proven_id),
      swappedOut,
    });
    if (!next) throw new CreatorDataError("There's no other video to swap in today. Go with this one.", 409);
    const picks = cur.picks.map((p) => (p.slot === slot ? { slot, proven_id: next, swapped_from: at.proven_id } : p));
    tx.update(ref, { picks, swapped_out: swappedOut, updated_at: nowIso });
    return { picks, swappedOut, next, attribution: cur.slot_attribution ?? {} };
  });
  await db.collection(PROVEN_COLLECTION).doc(res.next).update({ last_used_at: nowIso }).catch(() => {});
  const canSwap = !!swapCandidate({
    candidates: ctx.candidates,
    history: ctx.history,
    date,
    creatorId: creator.id,
    creatorAudience: ctx.audience,
    current: res.picks.map((p) => p.proven_id),
    swappedOut: res.swappedOut,
  });
  const full = await loadFull(db, res.picks.map((p) => p.proven_id));
  return payload(date, given, res.picks, full, canSwap, res.attribution);
}

// ================================================================ daily job (after the deep post sync)

export interface ProvenDailyResult {
  creators: number;
  suggested: string[];
  remakes_written: number;
  days_stamped: number;
  stats_updated: number;
  tired_flagged: string[];
  transcripts_filled: number;
  credits_used: number;
  errors: string[];
}

/**
 * 1. Auto-suggest: creator posts (last 30 days) at >= 100K or >= 3x their normal (>= 20K).
 * 2. Remakes: posting-day rows i < picks are linked to that day's pick i
 *    (proven_id stamped on the row), measured against the creator's normal.
 * 3. Stats + tired flag for every proven video with remakes.
 * 4. Missing transcripts (pending) filled, up to DAILY_TRANSCRIPT_CAP.
 * Firestore reads only, except transcripts of new suggestions and a views
 * check of an original that looks tired (1 credit each).
 */
export async function runProvenDaily(opts: {
  db?: Firestore;
  now?: Date;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  deadlineMs?: number;
  onlyIds?: string[];
  log?: (m: string) => void;
} = {}): Promise<ProvenDailyResult> {
  const db = fsdb(opts.db);
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const log = opts.log ?? ((m: string) => console.log(m));
  const apiKey = opts.apiKey ?? process.env.SCRAPECREATORS_API_KEY ?? "";
  const deadline = opts.deadlineMs ?? Date.now() + 120_000;
  const timeLeft = () => deadline - Date.now();
  const out: ProvenDailyResult = { creators: 0, suggested: [], remakes_written: 0, days_stamped: 0, stats_updated: 0, tired_flagged: [], transcripts_filled: 0, credits_used: 0, errors: [] };
  const provenCol = db.collection(PROVEN_COLLECTION);
  const creators = (await listCreators()).filter(
    (c) => SYNC_STATUSES.has(c.status) && (c.tiktok_handle?.trim() || c.instagram_handle?.trim()) && (!opts.onlyIds || opts.onlyIds.includes(c.id)),
  );
  out.creators = creators.length;
  const touched = new Set<string>();
  const newSuggestions: { id: string; platform: Platform; url: string }[] = [];

  for (const c of creators) {
    try {
      const cref = db.collection(CREATORS_COLLECTION).doc(c.id);
      const today = localDate(nowIso, c.timezone);
      const from = addDaysTo(today, -Math.max(REMAKE_LOOKBACK_DAYS, 31));
      const postsSnap = await cref.collection("posts").where("local_date", ">=", from).get();
      const posts = postsSnap.docs.map((d) => ({ docId: d.id, ...(d.data() as CreatorPost) }));
      const normal = { tiktok: normalViews(posts, nowIso, "tiktok"), instagram: normalViews(posts, nowIso, "instagram") };

      // 1. auto-suggest
      const cands = posts
        .map((p) => ({ p, reason: suggestReason(p, normal[p.platform], nowIso) }))
        .filter((x): x is { p: (typeof posts)[number]; reason: string } => !!x.reason);
      if (cands.length) {
        const refs = cands.map((x) => provenCol.doc(provenIdFor(x.p.platform, x.p.post_id)));
        const snaps = await db.getAll(...refs);
        for (let i = 0; i < cands.length; i++) {
          const { p, reason } = cands[i];
          if (snaps[i].exists) {
            const d = snaps[i].data()!;
            // Keep the original's views fresh (free: the post sync already has them).
            if (d.source_creator_id === c.id) {
              await refs[i].update({
                views: p.views,
                views_history: pushHistory(d.views_history, nowIso, p.views),
                ...(p.thumbnail_url ? { thumbnail_url: p.thumbnail_url } : {}),
              });
            }
            continue;
          }
          const doc: ProvenVideo = {
            source_url: p.url,
            platform: p.platform,
            handle: p.handle,
            posted_at: p.posted_at,
            views: p.views,
            caption: p.caption ?? "",
            transcript: "",
            hook_line: hookLineFrom("", p.caption ?? ""),
            status: "suggested",
            added_by: "auto",
            created_at: nowIso,
            approved_at: null,
            remake_count: 0,
            last_used_at: null,
            stats: emptyStats(),
            source_creator_id: c.id,
            suggest_reason: `${c.name}: ${reason}`,
            transcript_pending: true,
            views_history: [{ at: nowIso, views: p.views }],
            ...(p.thumbnail_url ? { thumbnail_url: p.thumbnail_url } : {}),
          };
          try {
            await refs[i].create(doc);
            out.suggested.push(refs[i].id);
            newSuggestions.push({ id: refs[i].id, platform: p.platform, url: p.url });
          } catch (e) {
            if ((e as { code?: number }).code !== 6) throw e;
          }
        }
      }

      // 2. remakes
      const [picksSnap, daysSnap] = await Promise.all([
        cref.collection("daily_picks").where("date", ">=", from).get(),
        cref.collection("posting_days").where("date", ">=", from).get(),
      ]);
      const picksByDate = new Map(picksSnap.docs.map((d) => [(d.data() as DailyPicks).date, d.data() as DailyPicks]));
      const byKey = new Map(posts.map((p) => [postKey(p.url, p.platform), p]));
      for (const dd of daysSnap.docs) {
        const day = dd.data();
        const picks = picksByDate.get(day.date);
        if (!picks?.picks?.length || !Array.isArray(day.videos)) continue;
        const ids: (string | undefined)[] = [];
        for (const p of picks.picks) ids[p.slot] = p.proven_id;
        const rows = day.videos as { tiktok_url?: string; instagram_url?: string; proven_id?: string }[];
        // Rows the creator saved already carry proven_id (savePostingDay); auto rows get it here.
        const stamped = stampProvenIds(rows, rows.map((r, i) => r.proven_id ?? ids[i]));
        if (JSON.stringify(stamped) !== JSON.stringify(rows)) {
          await dd.ref.update({ videos: stamped });
          out.days_stamped++;
        }
        const batch = db.batch();
        let n = 0;
        stamped.forEach((r, slot) => {
          if (!r.proven_id) return;
          const tt = r.tiktok_url ? byKey.get(postKey(r.tiktok_url, "tiktok")) : undefined;
          const ig = r.instagram_url ? byKey.get(postKey(r.instagram_url, "instagram")) : undefined;
          if (!tt && !ig) return;
          const views = { tiktok: tt ? tt.views : null, instagram: ig ? ig.views : null };
          const ratio = remakeRatio(views, normal);
          const postedAt = [tt?.posted_at, ig?.posted_at].filter(Boolean).sort()[0] as string;
          const judged = ratio != null && Date.parse(nowIso) - Date.parse(postedAt) >= REMAKE_JUDGE_AFTER_DAYS * 86400000;
          const rec: ProvenRemake = {
            creator_id: c.id,
            creator_name: c.name,
            date: day.date,
            slot,
            tiktok_url: r.tiktok_url ?? "",
            instagram_url: r.instagram_url ?? "",
            views,
            normal,
            ratio,
            judged,
            beat: judged && (ratio ?? 0) >= 1,
            updated_at: nowIso,
          };
          batch.set(provenCol.doc(r.proven_id).collection("remakes").doc(`${c.id}_${day.date}_${slot}`), rec);
          touched.add(r.proven_id);
          n++;
        });
        if (n) {
          await batch.commit();
          out.remakes_written += n;
        }
      }
    } catch (e) {
      out.errors.push(`${c.name} (${c.id}): ${errMsg(e)}`);
    }
  }

  // 3. stats + tired flags
  const all = await listProven({ db });
  const byId = new Map(all.map((v) => [v.id, v]));
  for (const id of touched) {
    try {
      const v = byId.get(id);
      if (!v) continue;
      const rs = (await provenCol.doc(id).collection("remakes").get()).docs.map((d) => d.data() as ProvenRemake);
      const stats = statsFrom(rs, localDate(nowIso, "America/New_York"));
      const patch: Record<string, unknown> = { stats, remake_count: stats.remakes };
      if (v.status === "active" && !v.tired?.kept_at && remakesLookTired(rs)) {
        let history = v.views_history ?? [];
        if (apiKey && v.source_url && v.platform && weeklyGain(history) == null && timeLeft() > 20_000) {
          const views = await fetchVideoViews(v.platform, v.source_url, { apiKey, fetchImpl: opts.fetchImpl });
          out.credits_used++;
          if (views != null) {
            history = pushHistory(history, nowIso, views);
            patch.views_history = history;
            patch.views = views;
          }
        }
        const t = tiredCheck(rs, weeklyGain(history));
        patch.tired = { ...t, checked_at: nowIso };
        if (t.flagged) out.tired_flagged.push(id);
      } else if (v.tired?.flagged && !remakesLookTired(rs)) {
        patch.tired = { ...v.tired, flagged: false, checked_at: nowIso };
      }
      await provenCol.doc(id).update(patch);
      out.stats_updated++;
    } catch (e) {
      out.errors.push(`stats ${id}: ${errMsg(e)}`);
    }
  }

  // 4. transcripts: new suggestions first, then anything still pending
  if (apiKey) {
    const pending = [
      ...newSuggestions,
      ...all.filter((v) => v.transcript_pending && v.source_url && v.platform && v.status !== "retired").map((v) => ({ id: v.id, platform: v.platform!, url: v.source_url! })),
    ]
      .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
      .slice(0, DAILY_TRANSCRIPT_CAP);
    await pool(pending, TRANSCRIPT_CONCURRENCY, async (x) => {
      if (timeLeft() < 35_000) return;
      const t = await transcriptFor(x.platform, x.url, apiKey, opts.fetchImpl);
      out.credits_used++;
      if (!t.ok) return;
      const ref = provenCol.doc(x.id);
      const snap = await ref.get();
      const d = snap.data() ?? {};
      await ref.update({
        transcript: t.text,
        transcript_pending: false,
        ...(d.hook_edited ? {} : { hook_line: hookLineFrom(t.text, d.caption ?? "") }),
      });
      out.transcripts_filled++;
    });
  }
  log(
    `[proven] daily: ${out.creators} creators, ${out.suggested.length} suggested, ${out.remakes_written} remakes, ` +
      `${out.stats_updated} stats, ${out.tired_flagged.length} tired, ${out.transcripts_filled} transcripts, ${out.credits_used} credits` +
      (out.errors.length ? `, ${out.errors.length} errors` : ""),
  );
  return out;
}
