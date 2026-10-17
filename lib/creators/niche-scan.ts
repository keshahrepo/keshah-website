/**
 * Weekly niche scan: the most-liked recent short videos in niches next to
 * ours (hair loss, posture, face yoga, jawline, skin and body tests, men's
 * health), so new creator scripts can start from formats already going viral.
 *
 *   GET /v1/tiktok/search/keyword?query=&date_posted=last-6-months&sort_by=most-liked
 *   GET /v2/instagram/reels/search?query=&date_posted=last-year
 *   header x-api-key: SCRAPECREATORS_API_KEY (1 credit per call)
 *
 * Stored as NicheScans/{yyyy-mm-dd}: the top videos (deduped, by views, then
 * likes), plus requests used. Runs from /api/cron/niche-scan: Mondays, or when
 * Settings/creator_portal.niche_scan_requested is true. Hard cap of
 * NICHE_SCAN_MAX_REQUESTS calls per run. Read-only use of the API.
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { SCRAPECREATORS_BASE } from "./scrape";

export const NICHE_SCAN_MAX_REQUESTS = 40;
export const NICHE_SCAN_KEEP = 250;

export interface NicheQuery {
  platform: "tiktok" | "instagram";
  niche: string;
  query: string;
}

const tt = (niche: string, ...qs: string[]): NicheQuery[] => qs.map((query) => ({ platform: "tiktok", niche, query }));
const ig = (niche: string, ...qs: string[]): NicheQuery[] => qs.map((query) => ({ platform: "instagram", niche, query }));

/** 36 searches: 30 TikTok, 6 Instagram. */
export const NICHE_QUERIES: NicheQuery[] = [
  ...tt("hair", "scalp pinch test", "hair loss test", "receding hairline", "scalp massage hair growth", "balding test", "thinning hair test"),
  ...tt("posture", "forward head posture", "neck pain test", "posture test", "tech neck", "neck hump"),
  ...tt("face", "face yoga", "jawline exercise", "mewing", "jaw test", "face asymmetry test"),
  ...tt("tests", "pinch test", "if you can't do this", "try this test", "flexibility test", "health test at home"),
  ...tt("men", "looksmaxxing", "mens health test", "skin test"),
  ...tt("hair", "hair growth tips men", "stop hair loss naturally", "minoxidil"),
  ...ig("hair", "hair loss test", "scalp massage"),
  ...ig("posture", "forward head posture"),
  ...ig("face", "face yoga"),
  ...ig("men", "looksmaxxing"),
  ...ig("tests", "try this test"),
];

export interface NicheVideo {
  platform: "tiktok" | "instagram";
  niche: string;
  query: string;
  url: string;
  handle: string;
  /** 0 when the API gives none (Instagram search often lists likes only). */
  views: number;
  likes: number;
  comments: number;
  shares: number;
  caption: string;
  posted_at: string | null;
  cover?: string;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const iso = (secs: unknown): string | null => (num(secs) > 0 ? new Date(num(secs) * 1000).toISOString() : null);
const firstUrl = (v: unknown): string | undefined => {
  const list = obj(v).url_list;
  return Array.isArray(list) ? list.find((u): u is string => typeof u === "string" && /^https?:\/\//.test(u)) : undefined;
};

/** TikTok keyword search: search_item_list[].aweme_info. */
export function parseTiktokSearch(d: unknown, q: NicheQuery): NicheVideo[] {
  const list = obj(d).search_item_list;
  if (!Array.isArray(list)) return [];
  const out: NicheVideo[] = [];
  for (const it of list) {
    const a = obj(obj(it).aweme_info);
    const id = str(a.aweme_id);
    const handle = str(obj(a.author).unique_id);
    if (!id) continue;
    const s = obj(a.statistics);
    out.push({
      platform: "tiktok",
      niche: q.niche,
      query: q.query,
      url: str(a.share_url).split("?")[0] || `https://www.tiktok.com/@${handle}/video/${id}`,
      handle,
      views: num(s.play_count),
      likes: num(s.digg_count),
      comments: num(s.comment_count),
      shares: num(s.share_count),
      caption: str(a.desc).slice(0, 500),
      posted_at: iso(a.create_time),
      cover: firstUrl(obj(a.video).cover),
    });
  }
  return out;
}

/** Instagram reel search: an array of reels under a few possible keys; fields vary, so read defensively. */
export function parseInstagramSearch(d: unknown, q: NicheQuery): NicheVideo[] {
  const root = obj(d);
  const list = [root.reels, root.items, root.data, obj(root.data).items].find(Array.isArray) as unknown[] | undefined;
  if (!list) return [];
  const out: NicheVideo[] = [];
  for (const raw of list) {
    const r = obj(obj(raw).media ?? raw);
    const code = str(r.shortcode) || str(r.code);
    const url = str(r.url) || (code ? `https://www.instagram.com/reel/${code}/` : "");
    if (!url) continue;
    const owner = obj(r.owner ?? r.user);
    const caption = typeof r.caption === "string" ? r.caption : str(obj(r.caption).text);
    out.push({
      platform: "instagram",
      niche: q.niche,
      query: q.query,
      url,
      handle: str(owner.username),
      views: num(r.video_play_count ?? r.play_count ?? r.video_view_count ?? r.view_count),
      likes: num(r.like_count ?? obj(r.edge_liked_by).count),
      comments: num(r.comment_count ?? obj(r.edge_media_to_comment).count),
      shares: 0,
      caption: caption.slice(0, 500),
      posted_at: iso(r.taken_at ?? r.taken_at_timestamp),
      cover: str(r.thumbnail_src) || str(r.display_url) || undefined,
    });
  }
  return out;
}

/** Dedupe by URL, then the strongest first (views, then likes), capped. */
export function rankNicheVideos(all: NicheVideo[], keep = NICHE_SCAN_KEEP): NicheVideo[] {
  const byUrl = new Map<string, NicheVideo>();
  for (const v of all) {
    const prev = byUrl.get(v.url);
    if (!prev || v.views + v.likes > prev.views + prev.likes) byUrl.set(v.url, v);
  }
  return [...byUrl.values()].sort((a, b) => b.views - a.views || b.likes - a.likes).slice(0, keep);
}

function urlFor(q: NicheQuery): string {
  const p = new URLSearchParams({ query: q.query });
  if (q.platform === "tiktok") {
    p.set("date_posted", "last-6-months");
    p.set("sort_by", "most-liked");
    return `${SCRAPECREATORS_BASE}/v1/tiktok/search/keyword?${p}`;
  }
  p.set("date_posted", "last-year");
  return `${SCRAPECREATORS_BASE}/v2/instagram/reels/search?${p}`;
}

export interface NicheScanResult {
  id: string;
  requests: number;
  videos: number;
  errors: { query: string; error: string }[];
  credits_remaining: number | null;
}

/** Runs every query (never more than the cap) and stores NicheScans/{date}. */
export async function runNicheScan(db: Firestore, opts: { now?: Date; deadlineMs?: number; fetchImpl?: typeof fetch } = {}): Promise<NicheScanResult> {
  const key = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!key) throw new Error("SCRAPECREATORS_API_KEY is not set");
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const id = now.toISOString().slice(0, 10);
  const all: NicheVideo[] = [];
  const errors: { query: string; error: string }[] = [];
  let requests = 0;
  let credits: number | null = null;
  for (const q of NICHE_QUERIES) {
    if (requests >= NICHE_SCAN_MAX_REQUESTS) break;
    if (opts.deadlineMs && Date.now() > opts.deadlineMs) break;
    requests++;
    try {
      const res = await f(urlFor(q), { headers: { "x-api-key": key }, signal: AbortSignal.timeout(30_000) });
      const d = (await res.json().catch(() => ({}))) as Json;
      if (!res.ok || d.success === false) throw new Error(str(d.message) || `HTTP ${res.status}`);
      if (typeof d.credits_remaining === "number") credits = d.credits_remaining;
      all.push(...(q.platform === "tiktok" ? parseTiktokSearch(d, q) : parseInstagramSearch(d, q)));
    } catch (e) {
      errors.push({ query: `${q.platform}: ${q.query}`, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const videos = rankNicheVideos(all);
  await db.collection("NicheScans").doc(id).set({
    ran_at: FieldValue.serverTimestamp(),
    requests,
    found: all.length,
    credits_remaining: credits,
    errors,
    videos,
  });
  await db.collection("Settings").doc("creator_portal").set({ niche_scan_requested: false, niche_scan_last: id }, { merge: true });
  return { id, requests, videos: videos.length, errors, credits_remaining: credits };
}

/** Monday from 13:00 UTC with no scan yet this week, or a manual request. */
export function nicheScanDue(p: { now: Date; requested: boolean; last: string | null }): boolean {
  if (p.requested) return true;
  const d = p.now;
  if (d.getUTCDay() !== 1 || d.getUTCHours() < 13) return false;
  return p.last !== d.toISOString().slice(0, 10);
}
