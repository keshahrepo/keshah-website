/**
 * "I posted it" in the KESHAH Creators app: POST /api/creator/posts/check.
 *
 *   1. Rate limit: one check per creator per CHECK_COOLDOWN_S (each check
 *      costs 2 ScrapeCreators credits).
 *   2. Shallow sync for just this creator (page 1 per platform, the same as
 *      admin "Sync now"), which also merges today's links into posting_days.
 *   3. Slot attribution (when a slot is given): the newest TikTok and the
 *      newest Instagram post detected today that no OTHER slot has claimed
 *      become this slot's posts. Stored on daily_picks/{date}.slot_attribution
 *      (survives re-saves and swaps), and the slot's proven_id is stamped on
 *      the posting_days row holding those links when that row has none.
 *   4. day_complete: the Day complete numbers when THIS check made the day
 *      count (dayComplete before vs after the sync), claimed once per day via
 *      db.claimDayComplete so the web save and the check never both celebrate.
 *
 * Pure helpers + an injectable runner (tests: lib/creators/post-check.test.ts).
 */
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION, claimDayComplete, getCreator, hasStarted } from "./db";
import { completeVideoCount, dayComplete, isPostedDay, isWeekday, localDate, type DayComplete } from "./pay";
import { syncCreatorPosts } from "./post-sync";
import type { SlotAttribution } from "./proven";
import { postKey } from "./scrape";
import { msUntilLocalDeadline } from "./time";
import type { CreatorProfile, DayOff, Platform, PostedVideo, PostingDay, YyyyMmDd } from "./types";

export const CHECK_COOLDOWN_S = 30;
export const MAX_SLOT = 4;

// ================================================================ pure helpers

export type RateDecision = { ok: true } | { ok: false; retry_after_s: number };

/** One check per `cooldownS` seconds. `lastIso` = the previous check's start. */
export function rateDecision(lastIso: string | null | undefined, nowMs: number, cooldownS = CHECK_COOLDOWN_S): RateDecision {
  const last = lastIso ? Date.parse(lastIso) : NaN;
  if (!Number.isFinite(last)) return { ok: true };
  const wait = last + cooldownS * 1000 - nowMs;
  return wait > 0 ? { ok: false, retry_after_s: Math.max(1, Math.ceil(wait / 1000)) } : { ok: true };
}

export interface TodayPost {
  platform: Platform;
  url: string;
  posted_at: string;
  views: number;
  thumbnail_url: string | null;
}

/**
 * This slot's posts. Keeps what the slot already has; each missing platform
 * gets the newest post today that no other slot claimed. `changed` = the map
 * needs writing. `attribution` is null when nothing was found for the slot.
 */
export function attributeSlot(
  map: Record<string, SlotAttribution>,
  slot: number,
  provenId: string | null,
  posts: TodayPost[],
  nowIso: string,
): { map: Record<string, SlotAttribution>; attribution: SlotAttribution | null; changed: boolean } {
  const key = String(slot);
  const mine = map[key];
  const taken = new Set<string>();
  for (const [k, a] of Object.entries(map)) {
    if (k === key) continue;
    if (a.tiktok_url) taken.add(postKey(a.tiktok_url, "tiktok"));
    if (a.instagram_url) taken.add(postKey(a.instagram_url, "instagram"));
  }
  const newest = (platform: Platform) =>
    posts
      .filter((p) => p.platform === platform && !taken.has(postKey(p.url, platform)))
      .sort((a, b) => b.posted_at.localeCompare(a.posted_at))[0]?.url;
  const tiktok_url = mine?.tiktok_url || newest("tiktok");
  const instagram_url = mine?.instagram_url || newest("instagram");
  if (!tiktok_url && !instagram_url) return { map, attribution: null, changed: false };
  const proven_id = provenId ?? mine?.proven_id ?? null;
  const same = !!mine && mine.tiktok_url === tiktok_url && mine.instagram_url === instagram_url && mine.proven_id === proven_id;
  if (same) return { map, attribution: mine, changed: false };
  const attribution: SlotAttribution = {
    proven_id,
    ...(tiktok_url ? { tiktok_url } : {}),
    ...(instagram_url ? { instagram_url } : {}),
    at: nowIso,
  };
  return { map: { ...map, [key]: attribution }, attribution, changed: true };
}

/**
 * Stamps `provenId` on the row holding the slot's TikTok link (else its
 * Instagram link) when that row has no proven_id and no other row has this one.
 * Returns null when nothing changes.
 */
export function stampRow(rows: PostedVideo[], a: SlotAttribution): PostedVideo[] | null {
  if (!a.proven_id || rows.some((r) => r.proven_id === a.proven_id)) return null;
  const tt = a.tiktok_url ? postKey(a.tiktok_url, "tiktok") : "";
  const ig = a.instagram_url ? postKey(a.instagram_url, "instagram") : "";
  const idx = [
    rows.findIndex((r) => !!tt && !!r.tiktok_url && postKey(r.tiktok_url, "tiktok") === tt),
    rows.findIndex((r) => !!ig && !!r.instagram_url && postKey(r.instagram_url, "instagram") === ig),
  ].find((i) => i >= 0);
  if (idx === undefined || rows[idx].proven_id) return null;
  return rows.map((r, i) => (i === idx ? { ...r, proven_id: a.proven_id! } : r));
}

export interface TodayCounts {
  tiktok: number;
  instagram: number;
  /** Counts for pay (both links x5, on time). */
  counted: boolean;
  /** Complete TikTok + Instagram pairs. */
  posted_videos: number;
  deadline_iso: string;
}

/** Today's numbers from detected posts and the saved log (links unioned by post id). */
export function todayCounts(posts: TodayPost[], log: PostingDay | undefined, counted: boolean, deadlineIso: string): TodayCounts {
  const keys: Record<Platform, Set<string>> = { tiktok: new Set(), instagram: new Set() };
  for (const p of posts) keys[p.platform].add(postKey(p.url, p.platform));
  for (const v of log?.videos ?? []) {
    if (v.tiktok_url?.trim()) keys.tiktok.add(postKey(v.tiktok_url, "tiktok"));
    if (v.instagram_url?.trim()) keys.instagram.add(postKey(v.instagram_url, "instagram"));
  }
  const tiktok = keys.tiktok.size;
  const instagram = keys.instagram.size;
  return {
    tiktok,
    instagram,
    counted,
    posted_videos: Math.max(Math.min(tiktok, instagram), log ? completeVideoCount(log) : 0),
    deadline_iso: deadlineIso,
  };
}

// ================================================================ runner

export interface PostCheckInput {
  slot?: number;
  proven_id?: string;
}

export interface PostCheckBody {
  today: TodayCounts;
  found_for_slot: { tiktok_url?: string; instagram_url?: string; views?: number } | null;
  day_complete: DayComplete | null;
  posts: TodayPost[];
  /** Seconds until the next check is allowed. */
  next_check_in_s: number;
}

export type PostCheckResult = { status: 200; body: PostCheckBody } | { status: 429; retry_after_s: number } | { status: 400; error: string };

export interface PostCheckDeps {
  now?: Date;
  /** Atomically: allowed? (and if so, record this check). */
  claimRate(creatorId: string, now: Date): Promise<RateDecision>;
  sync(creator: CreatorProfile): Promise<void>;
  history(creatorId: string): Promise<{ postingDays: PostingDay[]; daysOff: DayOff[] }>;
  /** Today's non-pinned detected posts, newest first. */
  todayPosts(creatorId: string, date: YyyyMmDd): Promise<TodayPost[]>;
  attribute(creatorId: string, date: YyyyMmDd, slot: number, provenId: string | null, posts: TodayPost[], nowIso: string): Promise<SlotAttribution | null>;
  claimDayComplete(creatorId: string, date: YyyyMmDd): Promise<boolean>;
  reloadCreator(id: string): Promise<CreatorProfile | null>;
}

export function parseCheckInput(raw: unknown): PostCheckInput | { error: string } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: PostCheckInput = {};
  if (b.slot !== undefined && b.slot !== null) {
    const n = Number(b.slot);
    if (!Number.isInteger(n) || n < 0 || n > MAX_SLOT) return { error: "slot must be 0 to 4" };
    out.slot = n;
  }
  if (b.proven_id !== undefined && b.proven_id !== null && b.proven_id !== "") {
    if (typeof b.proven_id !== "string" || b.proven_id.length > 200 || !/^[\w.:-]+$/.test(b.proven_id)) return { error: "Invalid proven_id" };
    out.proven_id = b.proven_id;
  }
  if (out.proven_id && out.slot === undefined) return { error: "slot is needed with proven_id" };
  return out;
}

export async function runPostCheck(creator: CreatorProfile, input: PostCheckInput, deps: PostCheckDeps): Promise<PostCheckResult> {
  const now = deps.now ?? new Date();
  const nowIso = now.toISOString();
  const rate = await deps.claimRate(creator.id, now);
  if (!rate.ok) return { status: 429, retry_after_s: rate.retry_after_s };
  const date = localDate(nowIso, creator.timezone);

  const before = await deps.history(creator.id);
  await deps.sync(creator);
  const posts = await deps.todayPosts(creator.id, date);

  let found: PostCheckBody["found_for_slot"] = null;
  if (input.slot !== undefined) {
    const a = await deps.attribute(creator.id, date, input.slot, input.proven_id ?? null, posts, nowIso);
    if (a && (a.tiktok_url || a.instagram_url)) {
      const views = [a.tiktok_url, a.instagram_url]
        .map((u) => posts.find((p) => p.url === u)?.views)
        .filter((v): v is number => typeof v === "number");
      found = {
        ...(a.tiktok_url ? { tiktok_url: a.tiktok_url } : {}),
        ...(a.instagram_url ? { instagram_url: a.instagram_url } : {}),
        ...(views.length ? { views: views.reduce((s, v) => s + v, 0) } : {}),
      };
    }
  }

  const after = await deps.history(creator.id);
  let day_complete: DayComplete | null = null;
  const profile = hasStarted(creator) ? creator : await deps.reloadCreator(creator.id);
  if (profile && hasStarted(profile)) {
    day_complete = dayComplete(profile, date, before.postingDays, after.postingDays, after.daysOff);
    if (day_complete && !(await deps.claimDayComplete(creator.id, date))) day_complete = null;
  }
  const log = after.postingDays.find((d) => d.date === date);
  const counted = isWeekday(date) && isPostedDay(after.postingDays, date, profile ?? undefined);
  const deadlineIso = new Date(now.getTime() + msUntilLocalDeadline(now, creator.timezone)).toISOString();
  return {
    status: 200,
    body: {
      today: todayCounts(posts, log, counted, deadlineIso),
      found_for_slot: found,
      day_complete,
      posts,
      next_check_in_s: CHECK_COOLDOWN_S,
    },
  };
}

// ================================================================ Firestore deps

function toPostingDay(id: string, d: DocumentData): PostingDay {
  return {
    date: d.date || id,
    videos: Array.isArray(d.videos)
      ? d.videos.map((v: Partial<PostedVideo>) => ({
          tiktok_url: v?.tiktok_url ?? "",
          instagram_url: v?.instagram_url ?? "",
          ...(v?.proven_id ? { proven_id: String(v.proven_id) } : {}),
        }))
      : [],
    logged_at: typeof d.logged_at === "string" ? d.logged_at : "",
  };
}

export function firestoreCheckDeps(opts: { db?: Firestore } = {}): PostCheckDeps {
  const db = () => opts.db ?? getFirebaseAdmin().db;
  const cref = (id: string) => db().collection(CREATORS_COLLECTION).doc(id);
  return {
    claimRate: (id, now) =>
      db().runTransaction(async (tx) => {
        const ref = cref(id);
        const snap = await tx.get(ref);
        const d = rateDecision(snap.data()?.post_check_at, now.getTime());
        if (d.ok) tx.update(ref, { post_check_at: now.toISOString() });
        return d;
      }),
    sync: async (creator) => {
      await syncCreatorPosts(creator, { mode: "shallow", ...(opts.db ? { db: opts.db } : {}) });
    },
    history: async (id) => {
      const [pd, off] = await Promise.all([cref(id).collection("posting_days").get(), cref(id).collection("days_off").get()]);
      return {
        postingDays: pd.docs.map((x) => toPostingDay(x.id, x.data())),
        daysOff: off.docs.map((x) => ({ date: x.data().date || x.id, status: x.data().status ?? "requested" }) as DayOff),
      };
    },
    todayPosts: async (id, date) => {
      const snap = await cref(id).collection("posts").where("local_date", "==", date).get();
      return snap.docs
        .map((x) => x.data())
        .filter((p) => !p.pinned && (p.platform === "tiktok" || p.platform === "instagram"))
        .map((p) => ({
          platform: p.platform as Platform,
          url: String(p.url ?? ""),
          posted_at: String(p.posted_at ?? ""),
          views: Number(p.views ?? 0),
          thumbnail_url: typeof p.thumbnail_url === "string" && p.thumbnail_url ? p.thumbnail_url : null,
        }))
        .sort((a, b) => b.posted_at.localeCompare(a.posted_at));
    },
    attribute: async (id, date, slot, provenId, posts, nowIso) => {
      const ref = cref(id).collection("daily_picks").doc(date);
      const a = await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const map = (snap.exists ? snap.data()!.slot_attribution : null) ?? {};
        const r = attributeSlot(map, slot, provenId, posts, nowIso);
        if (r.changed) tx.set(ref, { date, slot_attribution: r.map }, { merge: true });
        return r.attribution;
      });
      if (a?.proven_id) {
        try {
          const dref = cref(id).collection("posting_days").doc(date);
          const day = await dref.get();
          const rows = day.exists && Array.isArray(day.data()!.videos) ? (day.data()!.videos as PostedVideo[]) : [];
          const stamped = stampRow(rows, a);
          if (stamped) await dref.update({ videos: stamped });
        } catch (e) {
          console.error("posts check: proven_id stamp failed:", e); // attribution itself is stored
        }
      }
      return a;
    },
    claimDayComplete: (id, date) => claimDayComplete(id, date, opts.db ? { db: opts.db } : {}),
    reloadCreator: (id) => getCreator(id),
  };
}

