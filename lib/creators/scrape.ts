/**
 * ScrapeCreators client + response parsers for creator post tracking.
 *
 *   GET https://api.scrapecreators.com/v3/tiktok/profile/videos?handle=<h>[&max_cursor=<c>]
 *   GET https://api.scrapecreators.com/v1/instagram/user/reels?handle=<h>[&max_id=<id>]
 *   header x-api-key: SCRAPECREATORS_API_KEY
 *
 * Each call costs one credit. Responses carry `credits_remaining`.
 * Parsers are pure (tested against trimmed fixtures in __fixtures__/).
 */
import type { Platform } from "./types";

export const SCRAPECREATORS_BASE = "https://api.scrapecreators.com";

/**
 * Local test override: SCRAPECREATORS_BASE_URL may point at a mock server, but
 * only on localhost, so a stray setting can never send the API key elsewhere.
 */
function apiBase(): string {
  const o = process.env.SCRAPECREATORS_BASE_URL ?? "";
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o) ? o : SCRAPECREATORS_BASE;
}

/** One post, normalised across platforms. */
export interface ScrapedPost {
  platform: Platform;
  /** TikTok aweme_id, Instagram shortcode. Both strings (IG numeric pks overflow JS numbers). */
  post_id: string;
  /** Canonical URL (no tracking query). */
  url: string;
  /** ISO instant (UTC). */
  posted_at: string;
  caption: string;
  views: number;
  pinned: boolean;
  /** Cover image (signed CDN URL, expires after a few days). Absent when the response has none. */
  thumbnail_url?: string;
}

export interface ScrapedPage {
  posts: ScrapedPost[];
  has_more: boolean;
  /** Pass back as max_cursor (TikTok) / max_id (Instagram). */
  cursor: string | null;
  credits_remaining: number | null;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};
const creditsOf = (d: Json): number | null =>
  typeof d.credits_remaining === "number" ? d.credits_remaining : null;

/** First http(s) URL in `{ url_list: [...] }`. */
function firstUrl(v: unknown): string {
  const list = obj(v).url_list;
  if (!Array.isArray(list)) return "";
  const u = list.find((x) => typeof x === "string" && /^https?:\/\//.test(x));
  return typeof u === "string" ? u : "";
}

/** TikTok cover: video.cover, then origin_cover, then dynamic_cover. */
export function tiktokThumb(aweme: unknown): string {
  const v = obj(obj(aweme).video);
  return firstUrl(v.cover) || firstUrl(v.origin_cover) || firstUrl(v.dynamic_cover);
}

/** Instagram cover: the first image_versions2 candidate. */
export function instagramThumb(media: unknown): string {
  const c = obj(obj(media).image_versions2).candidates;
  if (!Array.isArray(c)) return "";
  const u = c.map((x) => obj(x).url).find((x) => typeof x === "string" && /^https?:\/\//.test(x));
  return typeof u === "string" ? u : "";
}

export function cleanHandle(h: string): string {
  return String(h ?? "").trim().replace(/^@+/, "").replace(/\s+/g, "");
}

// ---------------------------------------------------------------- parsing

export function parseTikTokPage(raw: unknown, handle: string): ScrapedPage {
  const d = obj(raw);
  const list = Array.isArray(d.aweme_list) ? d.aweme_list : [];
  const h = cleanHandle(handle);
  const posts: ScrapedPost[] = [];
  for (const it of list) {
    const a = obj(it);
    const id = String(a.aweme_id ?? "").trim();
    const created = num(a.create_time);
    if (!/^\d+$/.test(id) || !created) continue;
    const share = typeof a.share_url === "string" ? a.share_url : "";
    const kind = /\/photo\//.test(share) ? "photo" : "video";
    const thumb = tiktokThumb(a);
    posts.push({
      platform: "tiktok",
      post_id: id,
      url: `https://www.tiktok.com/@${h}/${kind}/${id}`,
      posted_at: new Date(created * 1000).toISOString(),
      caption: typeof a.desc === "string" ? a.desc.slice(0, 500) : "",
      views: num(obj(a.statistics).play_count),
      pinned: num(a.is_top) === 1 || a.is_top === true,
      ...(thumb ? { thumbnail_url: thumb } : {}),
    });
  }
  const cursor = d.max_cursor != null && d.max_cursor !== "" ? String(d.max_cursor) : null;
  return { posts, has_more: num(d.has_more) === 1 || d.has_more === true, cursor, credits_remaining: creditsOf(d) };
}

export function parseInstagramPage(raw: unknown): ScrapedPage {
  const d = obj(raw);
  const items = Array.isArray(d.items) ? d.items : [];
  const posts: ScrapedPost[] = [];
  for (const it of items) {
    const m = obj(obj(it).media ?? it);
    const code = typeof m.code === "string" ? m.code.trim() : "";
    const taken = num(m.taken_at);
    if (!code || !taken) continue;
    const pinnedIds = [m.clips_tab_pinned_user_ids, m.timeline_pinned_user_ids];
    const thumb = instagramThumb(m);
    posts.push({
      platform: "instagram",
      post_id: code,
      url: `https://www.instagram.com/reel/${code}/`,
      posted_at: new Date(taken * 1000).toISOString(),
      caption: typeof obj(m.caption).text === "string" ? String(obj(m.caption).text).slice(0, 500) : "",
      views: Math.max(num(m.play_count), num(m.ig_play_count), num(m.view_count)),
      pinned: pinnedIds.some((p) => Array.isArray(p) && p.length > 0),
      ...(thumb ? { thumbnail_url: thumb } : {}),
    });
  }
  const p = obj(d.paging_info);
  const cursor = typeof p.max_id === "string" && p.max_id ? p.max_id : null;
  return { posts, has_more: p.more_available === true && !!cursor, cursor, credits_remaining: creditsOf(d) };
}

// ---------------------------------------------------------------- URL keys

/**
 * Stable identity for a post URL so manual links and auto links compare equal:
 * TikTok -> "tiktok:<numeric id>", Instagram -> "instagram:<shortcode>".
 * Falls back to the lower-cased URL without query/trailing slash (short links
 * like vm.tiktok.com can't be resolved offline).
 */
export function postKey(url: string, platform: Platform): string {
  const s = String(url ?? "").trim();
  if (!s) return "";
  if (platform === "tiktok") {
    const m = s.match(/\/(?:video|photo)\/(\d{8,})/);
    if (m) return `tiktok:${m[1]}`;
  } else {
    const m = s.match(/instagram\.com\/(?:[^/?#]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    if (m) return `instagram:${m[1]}`;
  }
  return `${platform}:${s.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase()}`;
}

// ---------------------------------------------------------------- fetching

export interface FetchPostsOptions {
  apiKey: string;
  /** Keep paging while the oldest non-pinned post on the page is newer than this. */
  sinceMs?: number;
  /**
   * Alternative stop rule (wins over sinceMs): stop once this returns true for
   * the page's oldest non-pinned post, e.g. "posted before <local date>".
   */
  isBeyond?: (oldestUnpinned: ScrapedPost) => boolean;
  maxPages?: number;
  /** TikTok only: "popular" pages most-viewed first (proven-list seed). Default latest. */
  sortBy?: "latest" | "popular";
  /** Extra stop rule checked after each page (all posts on that page), e.g. "nothing over 100K here". */
  stopAfterPage?: (page: ScrapedPost[]) => boolean;
  /** Stop paging (truncated) once Date.now() passes this, so callers stay inside a request time limit. */
  deadlineMs?: number;
  fetchImpl?: typeof fetch;
  /** Called with each response's credits_remaining (for logging). */
  onCredits?: (n: number) => void;
}

export interface FetchPostsResult {
  posts: ScrapedPost[];
  pages: number;
  /** Requests made, including retries (= credits charged on success). */
  calls: number;
  credits_remaining: number | null;
  /** Stopped at maxPages while the API still had more inside the window (oldest day may be incomplete). */
  truncated: boolean;
}

export class ScrapeError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ScrapeError";
  }
}

function pageUrl(platform: Platform, handle: string, cursor: string | null, sortBy?: "latest" | "popular"): string {
  const q = new URLSearchParams({ handle: cleanHandle(handle) });
  if (platform === "tiktok") {
    if (sortBy === "popular") q.set("sort_by", "popular");
    if (cursor) q.set("max_cursor", cursor);
    return `${apiBase()}/v3/tiktok/profile/videos?${q}`;
  }
  if (cursor) q.set("max_id", cursor);
  return `${apiBase()}/v1/instagram/user/reels?${q}`;
}

async function getJson(url: string, apiKey: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, { headers: { "x-api-key": apiKey }, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new ScrapeError(`HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ScrapeError(`Bad JSON: ${text.slice(0, 120)}`);
  }
  const b = obj(body);
  if (b.success === false) throw new ScrapeError(`API error: ${String(b.message ?? b.error ?? "success=false").slice(0, 200)}`);
  return body;
}

/**
 * Page 1, then more pages (max `maxPages`, default 3) only while has_more and
 * the page's oldest non-pinned post is still inside the window (`isBeyond`
 * false, or newer than `sinceMs`). Each page
 * is retried once; a second failure throws ScrapeError.
 */
export async function fetchRecentPosts(
  platform: Platform,
  handle: string,
  opts: FetchPostsOptions,
): Promise<FetchPostsResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxPages = opts.maxPages ?? 3;
  const seen = new Map<string, ScrapedPost>();
  let cursor: string | null = null;
  let pages = 0;
  let calls = 0;
  let credits: number | null = null;
  let truncated = false;
  while (pages < maxPages) {
    if (opts.deadlineMs && pages > 0 && Date.now() > opts.deadlineMs) {
      truncated = true;
      break;
    }
    const url = pageUrl(platform, handle, cursor, opts.sortBy);
    let raw: unknown;
    try {
      calls++;
      raw = await getJson(url, opts.apiKey, fetchImpl);
    } catch (e) {
      if (e instanceof ScrapeError && e.status && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
      calls++;
      raw = await getJson(url, opts.apiKey, fetchImpl);
    }
    pages++;
    const page = platform === "tiktok" ? parseTikTokPage(raw, handle) : parseInstagramPage(raw);
    if (page.credits_remaining != null) {
      credits = page.credits_remaining;
      opts.onCredits?.(credits);
    }
    for (const p of page.posts) seen.set(p.post_id, p);
    const unpinned = page.posts.filter((p) => !p.pinned);
    const oldest = unpinned.length ? unpinned.reduce((a, b) => (a.posted_at < b.posted_at ? a : b)) : null;
    const beyond = !oldest
      ? true
      : opts.stopAfterPage?.(page.posts)
        ? true
        : opts.isBeyond
          ? opts.isBeyond(oldest)
          : Date.parse(oldest.posted_at) < (opts.sinceMs ?? Infinity);
    if (!page.has_more || !page.cursor || page.cursor === cursor || beyond) break;
    if (pages >= maxPages) {
      truncated = true;
      break;
    }
    cursor = page.cursor;
  }
  return { posts: [...seen.values()], pages, calls, credits_remaining: credits, truncated };
}

/**
 * Does this TikTok / Instagram account exist? true / false, or null when we
 * can't tell (no key, network error, API trouble) so callers never block on
 * an outage. ScrapeCreators answers 404 for unknown accounts and charges
 * nothing for it; a found account costs 1 credit.
 */
export async function handleExists(
  platform: Platform,
  handle: string,
  opts: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<boolean | null> {
  const apiKey = opts.apiKey ?? process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey || !cleanHandle(handle)) return null;
  try {
    const res = await (opts.fetchImpl ?? fetch)(pageUrl(platform, handle, null), {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    if (res.status === 404) return false;
    if (!res.ok) return null;
    const b = obj(await res.json().catch(() => ({})));
    if (b.error === "not_found" || b.account_deactivated === true) return false;
    return true;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- transcripts + single videos

/** WebVTT (TikTok transcripts) to plain text: no header, cue numbers, timestamps or tags; repeated lines dropped. */
export function vttToText(vtt: string): string {
  const out: string[] = [];
  for (const raw of String(vtt ?? "").split(/\r?\n/)) {
    const line = raw.replace(/<[^>]+>/g, "").trim();
    if (!line || /^WEBVTT/i.test(line) || /^(NOTE|STYLE|REGION)\b/.test(line) || /^\d+$/.test(line) || /-->/.test(line)) continue;
    if (out[out.length - 1] === line) continue;
    out.push(line);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Plain transcript text from a transcript response (TikTok VTT string, or Instagram transcripts[].text). */
export function parseTranscript(platform: Platform, raw: unknown): string {
  const d = obj(raw);
  if (platform === "tiktok") return typeof d.transcript === "string" ? vttToText(d.transcript) : "";
  const list = Array.isArray(d.transcripts) ? d.transcripts : [];
  return list
    .map((t) => (typeof obj(t).text === "string" ? String(obj(t).text).trim() : ""))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Transcript for one video (1 credit). TikTok uses its native captions (no AI
 * fallback, which costs 10). Instagram is AI-made, takes 10-30s and only works
 * under 2 minutes. Returns "" when there's no speech / no transcript; throws
 * ScrapeError on API trouble.
 */
export async function fetchTranscript(
  platform: Platform,
  url: string,
  opts: { apiKey: string; fetchImpl?: typeof fetch },
): Promise<{ text: string; credits_remaining: number | null }> {
  const q = new URLSearchParams({ url });
  const path = platform === "tiktok" ? `/v1/tiktok/video/transcript?${q}&language=en` : `/v2/instagram/media/transcript?${q}`;
  const res = await (opts.fetchImpl ?? fetch)(`${apiBase()}${path}`, { headers: { "x-api-key": opts.apiKey }, cache: "no-store" });
  const text = await res.text();
  if (res.status === 404) return { text: "", credits_remaining: null };
  if (!res.ok) throw new ScrapeError(`HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
  let body: unknown = {};
  try {
    body = JSON.parse(text);
  } catch {
    throw new ScrapeError(`Bad JSON: ${text.slice(0, 120)}`);
  }
  return { text: parseTranscript(platform, body), credits_remaining: creditsOf(obj(body)) };
}

/** Largest view-ish count anywhere in a single-video response (shapes differ by platform and version). */
export function parseVideoViews(raw: unknown): number | null {
  let best: number | null = null;
  const keys = new Set(["play_count", "ig_play_count", "video_play_count", "video_view_count", "view_count", "playCount"]);
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || depth > 6) return;
    for (const [k, x] of Object.entries(v as Json)) {
      if (keys.has(k) && typeof x === "number" && Number.isFinite(x)) best = Math.max(best ?? 0, x);
      else if (x && typeof x === "object") walk(x, depth + 1);
    }
  };
  walk(raw, 0);
  return best;
}

/** Current views of one video by URL (1 credit). null when it can't be read. */
export async function fetchVideoViews(
  platform: Platform,
  url: string,
  opts: { apiKey: string; fetchImpl?: typeof fetch },
): Promise<number | null> {
  const q = new URLSearchParams({ url });
  const path = platform === "tiktok" ? `/v2/tiktok/video?${q}` : `/v1/instagram/post?${q}`;
  try {
    return parseVideoViews(await getJson(`${apiBase()}${path}`, opts.apiKey, opts.fetchImpl ?? fetch));
  } catch {
    return null;
  }
}
