/**
 * Automatic creator post tracking (ScrapeCreators -> Firestore).
 *
 * Every sync (cron every 3h, or admin "Sync now"), per creator:
 *   1. Fetch recent TikToks + Instagram Reels (lib/creators/scrape.ts).
 *   2. Upsert ContentCreators/{id}/posts/{platform}_{post_id} (views, views_history,
 *      crossed_100k_at / crossed_1m_at).
 *   3. Bonuses: a post that is observed >= 100K / 1M views within 30 days of
 *      posting gets an approved BonusClaim (source "auto", doc id
 *      auto_{platform}_{post_id}; upgraded in place when 1M is crossed).
 *   4. Posting days: non-pinned posts are bucketed by creator-local date
 *      (deadline judged by post timestamp). A weekday is POSTED when it has
 *      >= 5 TikToks AND >= 5 Reels. Auto links are merged into
 *      posting_days/{date}.videos (union by URL; never removes or rewrites a
 *      creator's links; fills empty slots first, then new rows paired by time).
 *      The first posted weekday sets start_date when it's unset, but only for
 *      creators whose onboarding is complete.
 *   5. post_sync health on the creator doc; founder alert email (max 1/day)
 *      when a creator fails 3 syncs in a row or credits run low.
 *
 * Pure helpers are exported for tests (lib/creators/post-sync.test.ts).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { emailConfigured, sendEmail } from "@/lib/email";
import { getCreator, getOnboarding, isOnboarded, isYyyyMmDd, listCreators } from "./db";
import { BONUS_WINDOW_DAYS, VIDEOS_PER_WEEKDAY, isWeekday, localDate } from "./pay";
import { fetchRecentPosts, postKey, type FetchPostsResult, type ScrapedPost } from "./scrape";
import type {
  BonusClaim,
  CreatorPost,
  CreatorProfile,
  Platform,
  PostSyncState,
  PostedVideo,
  YyyyMmDd,
} from "./types";

export const POST_WINDOW_DAYS = 35;
export const MAX_PAGES = 3;
export const VIEWS_HISTORY_MAX = 60;
export const VIEWS_100K = 100_000;
export const VIEWS_1M = 1_000_000;
export const ALERT_CONSECUTIVE_FAILURES = 3;
export const ALERT_CREDITS_BELOW = 500;
export const ALERT_MIN_INTERVAL_MS = 24 * 3600 * 1000;
/** Same cap as db.savePostingDay's MAX_VIDEO_ROWS, so a creator can still re-save the day. */
export const MAX_DAY_ROWS = 20;
const SYNC_STATUSES = new Set(["onboarding", "trial", "active", "leaving"]);
const DAY_MS = 86400000;
const CREATORS = "ContentCreators";

// ================================================================ pure helpers

function dayNum(d: YyyyMmDd): number {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd) / DAY_MS;
}

export function daysBetween(a: YyyyMmDd, b: YyyyMmDd): number {
  return Math.round(dayNum(b) - dayNum(a));
}

export function addDays(d: YyyyMmDd, n: number): YyyyMmDd {
  return new Date((dayNum(d) + n) * DAY_MS).toISOString().slice(0, 10);
}

export interface DayBucket {
  tiktok: ScrapedPost[];
  instagram: ScrapedPost[];
}

/** Non-pinned posts grouped by creator-local posting date, each list oldest first. */
export function bucketByLocalDate(posts: ScrapedPost[], timezone: string): Map<YyyyMmDd, DayBucket> {
  const out = new Map<YyyyMmDd, DayBucket>();
  const sorted = [...posts].filter((p) => !p.pinned).sort((a, b) => a.posted_at.localeCompare(b.posted_at));
  for (const p of sorted) {
    const d = localDate(p.posted_at, timezone);
    const b = out.get(d) ?? { tiktok: [], instagram: [] };
    b[p.platform].push(p);
    out.set(d, b);
  }
  return out;
}

export interface DayDetection {
  tiktok: number;
  instagram: number;
  /** >= 5 non-pinned on BOTH platforms (weekday-ness is checked separately). */
  posted: boolean;
}

export function detectDay(b: DayBucket | undefined): DayDetection {
  const tiktok = b?.tiktok.length ?? 0;
  const instagram = b?.instagram.length ?? 0;
  return { tiktok, instagram, posted: tiktok >= VIDEOS_PER_WEEKDAY && instagram >= VIDEOS_PER_WEEKDAY };
}

/**
 * Union the day's auto-detected links (oldest first) into a creator's saved
 * rows without touching any existing link: auto links already present (same
 * post id) are skipped, the rest first fill empty TikTok / Instagram slots in
 * existing rows, then become new rows paired by time order. Never exceeds
 * MAX_DAY_ROWS rows. `added` = the auto links actually placed.
 */
export function mergeAutoVideos(
  existing: PostedVideo[],
  tiktokUrls: string[],
  instagramUrls: string[],
  cap = MAX_DAY_ROWS,
): { videos: PostedVideo[]; added: string[] } {
  const rows: PostedVideo[] = existing.map((v) => ({ ...v, tiktok_url: v.tiktok_url ?? "", instagram_url: v.instagram_url ?? "" }));
  const have = new Set<string>();
  for (const r of rows) {
    if (r.tiktok_url) have.add(postKey(r.tiktok_url, "tiktok"));
    if (r.instagram_url) have.add(postKey(r.instagram_url, "instagram"));
  }
  const fresh = (urls: string[], platform: Platform) => {
    const out: string[] = [];
    for (const u of urls) {
      const k = postKey(u, platform);
      if (!k || have.has(k)) continue;
      have.add(k);
      out.push(u);
    }
    return out;
  };
  const tt = fresh(tiktokUrls, "tiktok");
  const ig = fresh(instagramUrls, "instagram");
  const added: string[] = [];
  for (const r of rows) {
    if (!r.tiktok_url && tt.length) added.push((r.tiktok_url = tt.shift()!));
    if (!r.instagram_url && ig.length) added.push((r.instagram_url = ig.shift()!));
  }
  while ((tt.length || ig.length) && rows.length < cap) {
    const row: PostedVideo = { tiktok_url: tt.shift() ?? "", instagram_url: ig.shift() ?? "" };
    if (row.tiktok_url) added.push(row.tiktok_url);
    if (row.instagram_url) added.push(row.instagram_url);
    rows.push(row);
  }
  return { videos: rows, added };
}

/** New/updated post record for one observation. `prev` is the stored record (if any). */
export function applyObservation(
  prev: Partial<CreatorPost> | null,
  p: ScrapedPost,
  ctx: { nowIso: string; timezone: string; handle: string },
): CreatorPost {
  const history = Array.isArray(prev?.views_history) ? [...prev!.views_history] : [];
  const last = history[history.length - 1];
  const stale = !last || Date.parse(ctx.nowIso) - Date.parse(last.at) >= DAY_MS;
  if (!last || last.views !== p.views || stale) {
    if (!last || last.at !== ctx.nowIso) history.push({ at: ctx.nowIso, views: p.views });
  }
  // Views can briefly dip (platform recounts); thresholds are "first observed >=".
  return {
    platform: p.platform,
    post_id: p.post_id,
    url: p.url,
    handle: ctx.handle,
    posted_at: p.posted_at,
    local_date: localDate(p.posted_at, ctx.timezone),
    caption: p.caption,
    views: p.views,
    views_history: history.slice(-VIEWS_HISTORY_MAX),
    pinned: p.pinned,
    first_seen_at: prev?.first_seen_at || ctx.nowIso,
    last_synced_at: ctx.nowIso,
    crossed_100k_at: prev?.crossed_100k_at || (p.views >= VIEWS_100K ? ctx.nowIso : null),
    crossed_1m_at: prev?.crossed_1m_at || (p.views >= VIEWS_1M ? ctx.nowIso : null),
  };
}

export function postDocId(platform: Platform, postId: string): string {
  return `${platform}_${postId}`;
}

export function autoClaimId(platform: Platform, postId: string): string {
  return `auto_${platform}_${postId}`;
}

export type BonusAction =
  | { op: "none"; reason: string }
  | { op: "create"; id: string; claim: BonusClaim }
  | { op: "upgrade"; id: string; patch: Partial<BonusClaim> };

/**
 * What to do with bonus claims for one post. Thresholds count only when FIRST
 * OBSERVED (crossed_*_at, as a creator-local date) within 30 days of the local
 * posting date. Posts from before start_date (or before pay started) never
 * qualify. Idempotent: one auto claim per post; a 1M crossing upgrades it.
 * When the creator already claimed the same video manually, the auto claim
 * reuses that claim's exact video_url so bonusLinesForMonth merges the two
 * (pays once). A video an admin rejected is left alone.
 */
export function bonusAction(
  post: CreatorPost,
  claims: ({ id: string } & BonusClaim)[],
  ctx: { startDate: YyyyMmDd; timezone: string; nowIso: string },
): BonusAction {
  if (!isYyyyMmDd(ctx.startDate)) return { op: "none", reason: "not started" };
  if (post.local_date < ctx.startDate) return { op: "none", reason: "posted before start_date" };
  if (!post.crossed_100k_at) return { op: "none", reason: "under 100K" };
  const within = (iso: string | null) => {
    if (!iso) return null;
    const d = localDate(iso, ctx.timezone);
    const n = daysBetween(post.local_date, d);
    return n >= 0 && n <= BONUS_WINDOW_DAYS ? d : null;
  };
  const c100 = within(post.crossed_100k_at);
  const c1m = within(post.crossed_1m_at);
  const id = autoClaimId(post.platform, post.post_id);
  const key = postKey(post.url, post.platform);
  const same = claims.filter((c) => c.platform === post.platform && postKey(c.video_url, c.platform) === key);
  const auto = same.find((c) => c.id === id);
  if (auto) {
    if (auto.status === "approved" && !auto.crossed_1m_on && c1m) {
      return { op: "upgrade", id, patch: { crossed_1m_on: c1m, views_claimed: post.views, reviewed_at: ctx.nowIso } };
    }
    return { op: "none", reason: "claim up to date" };
  }
  if (!c100 && !c1m) return { op: "none", reason: "crossed outside the 30-day window" };
  if (same.some((c) => c.status === "rejected")) return { op: "none", reason: "admin rejected a claim for this video" };
  const claim: BonusClaim = {
    video_url: same[0]?.video_url ?? post.url,
    platform: post.platform,
    posted_on: post.local_date,
    ...(c100 ? { crossed_100k_on: c100 } : {}),
    ...(c1m ? { crossed_1m_on: c1m } : {}),
    views_claimed: post.views,
    status: "approved",
    source: "auto",
    admin_note: "Auto-detected by the post sync",
    claimed_at: ctx.nowIso,
    reviewed_at: ctx.nowIso,
  };
  return { op: "create", id, claim };
}

// ================================================================ Firestore

export interface SyncDeps {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
  db?: Firestore;
  log?: (msg: string) => void;
  /** Email sender for alerts (defaults to lib/email.sendEmail). */
  sendAlert?: (subject: string, text: string) => Promise<void>;
}

export interface PlatformSyncResult {
  ok: boolean;
  handle: string;
  posts: number;
  calls: number;
  error?: string;
}

export interface CreatorSyncResult {
  creator_id: string;
  name: string;
  ok: boolean;
  skipped?: string;
  platforms: Partial<Record<Platform, PlatformSyncResult>>;
  credits_remaining: number | null;
  /** Weekdays with >= 5 + 5 in this fetch (creator-local dates). */
  posted_days_detected: YyyyMmDd[];
  /** posting_days docs created/updated. */
  days_written: YyyyMmDd[];
  start_date_set?: YyyyMmDd;
  claims_created: string[];
  claims_upgraded: string[];
  consecutive_failures: number;
}

function firestore(deps: SyncDeps): Firestore {
  return deps.db ?? getFirebaseAdmin().db;
}

function toIsoLoose(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  const t = v as { toDate?: () => Date };
  return typeof t.toDate === "function" ? t.toDate().toISOString() : undefined;
}

function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}

/** Sync one creator. Never throws for fetch errors (they're recorded on the creator doc). */
export async function syncCreatorPosts(creatorOrId: string | CreatorProfile, deps: SyncDeps = {}): Promise<CreatorSyncResult> {
  const db = firestore(deps);
  const log = deps.log ?? ((m: string) => console.log(m));
  const creator = typeof creatorOrId === "string" ? await getCreator(creatorOrId) : creatorOrId;
  if (!creator) throw new Error("Creator not found");
  const now = deps.now ?? new Date();
  const nowIso = now.toISOString();
  const tz = creator.timezone;
  const ref = db.collection(CREATORS).doc(creator.id);
  const result: CreatorSyncResult = {
    creator_id: creator.id,
    name: creator.name,
    ok: true,
    platforms: {},
    credits_remaining: null,
    posted_days_detected: [],
    days_written: [],
    claims_created: [],
    claims_upgraded: [],
    consecutive_failures: 0,
  };
  const handles: Partial<Record<Platform, string>> = {};
  const clean = (h: string) => String(h ?? "").trim().replace(/^@+/, "").replace(/\s+/g, "");
  if (clean(creator.tiktok_handle)) handles.tiktok = clean(creator.tiktok_handle);
  if (clean(creator.instagram_handle)) handles.instagram = clean(creator.instagram_handle);
  if (!handles.tiktok && !handles.instagram) return { ...result, ok: false, skipped: "no handles" };

  const apiKey = deps.apiKey ?? process.env.SCRAPECREATORS_API_KEY ?? "";
  if (!apiKey) throw new Error("SCRAPECREATORS_API_KEY is not set");

  // 1. fetch
  const sinceMs = now.getTime() - POST_WINDOW_DAYS * DAY_MS;
  const fetched: Partial<Record<Platform, FetchPostsResult>> = {};
  await Promise.all(
    (Object.keys(handles) as Platform[]).map(async (platform) => {
      const handle = handles[platform]!;
      try {
        const r = await fetchRecentPosts(platform, handle, { apiKey, sinceMs, maxPages: MAX_PAGES, fetchImpl: deps.fetchImpl });
        fetched[platform] = r;
        result.platforms[platform] = { ok: true, handle, posts: r.posts.length, calls: r.calls };
        if (r.credits_remaining != null) {
          result.credits_remaining =
            result.credits_remaining == null ? r.credits_remaining : Math.min(result.credits_remaining, r.credits_remaining);
        }
      } catch (e) {
        result.ok = false;
        result.platforms[platform] = { ok: false, handle, posts: 0, calls: 0, error: errMsg(e) };
      }
    }),
  );
  log(
    `[creator-posts] ${creator.name} (${creator.id}): ` +
      (Object.entries(result.platforms) as [Platform, PlatformSyncResult][])
        .map(([p, r]) => `${p}=${r.ok ? `${r.posts} posts/${r.calls} calls` : `ERROR ${r.error}`}`)
        .join(" ") +
      ` credits_remaining=${result.credits_remaining ?? "?"}`,
  );

  const allPosts: ScrapedPost[] = [...(fetched.tiktok?.posts ?? []), ...(fetched.instagram?.posts ?? [])];

  // 2. upsert posts
  const postsCol = ref.collection("posts");
  const records: CreatorPost[] = [];
  if (allPosts.length) {
    const refs = allPosts.map((p) => postsCol.doc(postDocId(p.platform, p.post_id)));
    const snaps = await db.getAll(...refs);
    const batch = db.batch();
    allPosts.forEach((p, i) => {
      const prev = snaps[i].exists ? (snaps[i].data() as Partial<CreatorPost>) : null;
      const rec = applyObservation(prev, p, { nowIso, timezone: tz, handle: handles[p.platform]! });
      records.push(rec);
      batch.set(refs[i], rec);
    });
    await batch.commit();
  }

  // 3. bonuses
  const creatorRaw = (await ref.get()).data() ?? {};
  let startDate: YyyyMmDd = creator.start_date;
  const bonusCandidates = () => records.filter((r) => !!r.crossed_100k_at);
  const runBonuses = async () => {
    const cands = bonusCandidates();
    if (!cands.length || !isYyyyMmDd(startDate)) return;
    const claimsSnap = await ref.collection("bonus_claims").get();
    const claims = claimsSnap.docs.map((d) => ({ ...(d.data() as BonusClaim), id: d.id }));
    for (const rec of cands) {
      const a = bonusAction(rec, claims, { startDate, timezone: tz, nowIso });
      if (a.op === "create") {
        // create() fails if the doc appeared meanwhile (concurrent sync): idempotent.
        try {
          await ref.collection("bonus_claims").doc(a.id).create(a.claim);
          claims.push({ ...a.claim, id: a.id });
          result.claims_created.push(a.id);
        } catch (e) {
          if ((e as { code?: number }).code !== 6) throw e; // 6 = ALREADY_EXISTS
        }
      } else if (a.op === "upgrade") {
        await ref.collection("bonus_claims").doc(a.id).update(a.patch);
        result.claims_upgraded.push(a.id);
      }
    }
  };

  // 4. posting days (needs both platforms fetched OK)
  if (fetched.tiktok && fetched.instagram) {
    const buckets = bucketByLocalDate(allPosts, tz);
    const today = localDate(nowIso, tz);
    // A fetch that stopped at MAX_PAGES with more to go may have cut its oldest day short.
    let coverageFrom: YyyyMmDd = "0000-00-00";
    for (const p of ["tiktok", "instagram"] as Platform[]) {
      const r = fetched[p]!;
      const unpinned = r.posts.filter((x) => !x.pinned);
      if (r.truncated && unpinned.length) {
        const oldest = unpinned.reduce((a, b) => (a.posted_at < b.posted_at ? a : b));
        const d = addDays(localDate(oldest.posted_at, tz), 1);
        if (d > coverageFrom) coverageFrom = d;
      }
    }
    const days = [...buckets.keys()]
      .filter((d) => isWeekday(d) && d <= today && d >= coverageFrom && (!creator.ended_on || d <= creator.ended_on))
      .sort();
    result.posted_days_detected = days.filter((d) => detectDay(buckets.get(d)).posted);

    if (!isYyyyMmDd(startDate)) {
      const onb = await getOnboarding(creator.id);
      if (isOnboarded(onb, { contractSigned: creator.contract.status === "signed" })) {
        const doneIso = toIsoLoose(onb.completed_at) ?? toIsoLoose(onb.ready_at);
        const doneDate = doneIso ? localDate(doneIso, tz) : "0000-00-00";
        const first = result.posted_days_detected.find((d) => d >= doneDate);
        if (first) {
          const set = await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const cur = snap.data()?.start_date;
            if (isYyyyMmDd(cur)) return cur as YyyyMmDd;
            tx.update(ref, { start_date: first, start_date_source: "auto_post", start_date_set_at: nowIso });
            return null;
          });
          if (set) startDate = set;
          else {
            startDate = first;
            result.start_date_set = first;
          }
        }
      }
    }

    if (isYyyyMmDd(startDate)) {
      const dayCol = ref.collection("posting_days");
      for (const d of days.filter((x) => x >= startDate)) {
        const b = buckets.get(d)!;
        const dref = dayCol.doc(d);
        const snap = await dref.get();
        const cur = snap.exists ? snap.data()! : null;
        const existing: PostedVideo[] = Array.isArray(cur?.videos) ? cur!.videos : [];
        const { videos, added } = mergeAutoVideos(
          existing,
          b.tiktok.map((p) => p.url),
          b.instagram.map((p) => p.url),
        );
        if (!added.length) continue;
        const autoUrls = [...new Set([...(Array.isArray(cur?.auto_urls) ? cur!.auto_urls : []), ...added])];
        if (cur) {
          const hadManual = existing.length > 0 && cur.source !== "auto";
          await dref.update({ videos, auto_urls: autoUrls, auto_synced_at: nowIso, source: hadManual || cur.source === "manual+auto" ? "manual+auto" : "auto" });
        } else {
          await dref.set({ date: d, videos, logged_at: nowIso, first_logged_at: nowIso, on_time: true, source: "auto", auto_urls: autoUrls, auto_synced_at: nowIso });
        }
        result.days_written.push(d);
      }
    }
  }

  await runBonuses();

  // 5. health
  const prev = (creatorRaw.post_sync ?? {}) as Partial<PostSyncState>;
  const failures = result.ok ? 0 : (Number(prev.consecutive_failures) || 0) + 1;
  result.consecutive_failures = failures;
  const errorText = Object.entries(result.platforms)
    .filter(([, r]) => r && !r.ok)
    .map(([p, r]) => `${p}: ${r!.error}`)
    .join("; ");
  const state: PostSyncState = {
    last_run_at: nowIso,
    consecutive_failures: failures,
    credits_remaining: result.credits_remaining ?? prev.credits_remaining ?? null,
    ...(result.ok
      ? { last_ok_at: nowIso, last_error: prev.last_error ?? null, last_error_at: prev.last_error_at ?? null }
      : { last_ok_at: prev.last_ok_at, last_error: errorText, last_error_at: nowIso }),
  };
  if (state.last_ok_at === undefined) delete state.last_ok_at;
  await ref.update({ post_sync: state });
  return result;
}

export interface SyncAllResult {
  ran_at: string;
  results: CreatorSyncResult[];
  credits_remaining: number | null;
  alert_sent: boolean;
  alert_reason?: string;
}

/** Cron entry point: every onboarding/trial/active/leaving creator with a handle. */
export async function syncAllCreatorPosts(deps: SyncDeps & { onlyIds?: string[]; concurrency?: number } = {}): Promise<SyncAllResult> {
  const db = firestore(deps);
  const log = deps.log ?? ((m: string) => console.log(m));
  const now = deps.now ?? new Date();
  const creators = (await listCreators()).filter(
    (c) =>
      SYNC_STATUSES.has(c.status) &&
      (c.tiktok_handle?.trim() || c.instagram_handle?.trim()) &&
      (!deps.onlyIds || deps.onlyIds.includes(c.id)),
  );
  const results: CreatorSyncResult[] = [];
  const queue = [...creators];
  const workers = Array.from({ length: Math.max(1, deps.concurrency ?? 3) }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        results.push(await syncCreatorPosts(c, { ...deps, db, now }));
      } catch (e) {
        log(`[creator-posts] ${c.name} (${c.id}) crashed: ${errMsg(e)}`);
        results.push({
          creator_id: c.id, name: c.name, ok: false, skipped: `crashed: ${errMsg(e)}`, platforms: {},
          credits_remaining: null, posted_days_detected: [], days_written: [], claims_created: [], claims_upgraded: [], consecutive_failures: 0,
        });
      }
    }
  });
  await Promise.all(workers);
  const credits = results.reduce<number | null>(
    (m, r) => (r.credits_remaining == null ? m : m == null ? r.credits_remaining : Math.min(m, r.credits_remaining)),
    null,
  );
  log(`[creator-posts] synced ${results.length} creators, credits_remaining=${credits ?? "?"}`);

  const failing = results.filter((r) => r.consecutive_failures >= ALERT_CONSECUTIVE_FAILURES);
  const lowCredits = credits != null && credits < ALERT_CREDITS_BELOW;
  let alert_sent = false;
  let alert_reason: string | undefined;
  if (failing.length || lowCredits) {
    alert_reason = [
      lowCredits ? `ScrapeCreators credits low: ${credits} left (alert under ${ALERT_CREDITS_BELOW}).` : "",
      ...failing.map((r) => {
        const errs = Object.entries(r.platforms).filter(([, p]) => p && !p.ok).map(([p, x]) => `${p} @${x!.handle}: ${x!.error}`);
        return `${r.name} (${r.creator_id}): ${r.consecutive_failures} failed syncs in a row. ${errs.join("; ")}`;
      }),
    ].filter(Boolean).join("\n");
    alert_sent = await maybeAlert(db, now, alert_reason, deps, log);
  }
  return { ran_at: now.toISOString(), results, credits_remaining: credits, alert_sent, ...(alert_reason ? { alert_reason } : {}) };
}

async function maybeAlert(db: Firestore, now: Date, reason: string, deps: SyncDeps, log: (m: string) => void): Promise<boolean> {
  const sref = db.collection("Settings").doc("creator_portal");
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(sref);
    const last = toIsoLoose(snap.data()?.post_sync_alert_at);
    if (last && now.getTime() - Date.parse(last) < ALERT_MIN_INTERVAL_MS) return false;
    tx.set(sref, { post_sync_alert_at: now.toISOString(), post_sync_alert_reason: reason.slice(0, 2000) }, { merge: true });
    return true;
  });
  if (!claimed) return false;
  const subject = "Creator post sync needs a look";
  const text = `${reason}\n\nAdmin: https://keshah.com/dashboard/creators-pay\n\n(Sent at most once a day by /api/cron/creator-posts.)`;
  try {
    if (deps.sendAlert) await deps.sendAlert(subject, text);
    else if (emailConfigured() && process.env.KESHAH_GMAIL_USER) await sendEmail({ to: process.env.KESHAH_GMAIL_USER, subject, text });
    else log(`[creator-posts] ALERT (email not configured): ${reason}`);
    return true;
  } catch (e) {
    log(`[creator-posts] alert email failed: ${errMsg(e)}`);
    return false;
  }
}

// ================================================================ readers (APIs)

export interface PostView {
  id: string;
  platform: Platform;
  post_id: string;
  url: string;
  posted_at: string;
  local_date: YyyyMmDd;
  caption: string;
  views: number;
  pinned: boolean;
  last_synced_at: string;
  crossed_100k_at: string | null;
  crossed_1m_at: string | null;
  views_history?: { at: string; views: number }[];
}

export interface DetectedDay {
  date: YyyyMmDd;
  weekday: boolean;
  tiktok: number;
  instagram: number;
  /** Weekday with >= 5 non-pinned on both platforms. */
  posted: boolean;
  views: number;
  /** Auto links paired by time (what the sync merges into posting_days). */
  videos: PostedVideo[];
}

/** Posts whose creator-local posting date is in [from, to], newest first. */
export async function listPosts(
  creatorId: string,
  from: YyyyMmDd,
  to: YyyyMmDd,
  opts: { db?: Firestore; withHistory?: boolean } = {},
): Promise<PostView[]> {
  const db = opts.db ?? getFirebaseAdmin().db;
  const snap = await db
    .collection(CREATORS).doc(creatorId).collection("posts")
    .where("local_date", ">=", from)
    .where("local_date", "<=", to)
    .get();
  return snap.docs
    .map((d) => {
      const r = d.data() as CreatorPost;
      return {
        id: d.id,
        platform: r.platform,
        post_id: r.post_id,
        url: r.url,
        posted_at: r.posted_at,
        local_date: r.local_date,
        caption: r.caption ?? "",
        views: Number(r.views ?? 0),
        pinned: !!r.pinned,
        last_synced_at: r.last_synced_at,
        crossed_100k_at: r.crossed_100k_at ?? null,
        crossed_1m_at: r.crossed_1m_at ?? null,
        ...(opts.withHistory ? { views_history: r.views_history ?? [] } : {}),
      };
    })
    .sort((a, b) => b.posted_at.localeCompare(a.posted_at));
}

/** Per-date detection from stored posts (pinned posts excluded from counts). */
export function detectedDays(posts: Pick<PostView, "platform" | "url" | "posted_at" | "local_date" | "views" | "pinned">[]): DetectedDay[] {
  const map = new Map<YyyyMmDd, { tt: typeof posts; ig: typeof posts }>();
  for (const p of posts) {
    if (p.pinned) continue;
    const e = map.get(p.local_date) ?? { tt: [], ig: [] };
    (p.platform === "tiktok" ? e.tt : e.ig).push(p);
    map.set(p.local_date, e);
  }
  return [...map.entries()]
    .map(([date, e]) => {
      const tt = [...e.tt].sort((a, b) => a.posted_at.localeCompare(b.posted_at));
      const ig = [...e.ig].sort((a, b) => a.posted_at.localeCompare(b.posted_at));
      const weekday = isWeekday(date);
      return {
        date,
        weekday,
        tiktok: tt.length,
        instagram: ig.length,
        posted: weekday && tt.length >= VIDEOS_PER_WEEKDAY && ig.length >= VIDEOS_PER_WEEKDAY,
        views: [...tt, ...ig].reduce((s, p) => s + p.views, 0),
        videos: mergeAutoVideos([], tt.map((p) => p.url), ig.map((p) => p.url)).videos,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getPostSyncState(creatorId: string, opts: { db?: Firestore } = {}): Promise<PostSyncState | null> {
  const db = opts.db ?? getFirebaseAdmin().db;
  const snap = await db.collection(CREATORS).doc(creatorId).get();
  const s = snap.data()?.post_sync;
  return s ? (s as PostSyncState) : null;
}
