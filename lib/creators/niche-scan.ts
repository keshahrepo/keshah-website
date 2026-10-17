/**
 * Weekly niche scan: the strongest recent short videos in niches next to ours
 * (hair loss, posture, face yoga, jawline, at-home body tests, men's health),
 * so new creator scripts can start from formats already going viral.
 *
 *   GET /v1/tiktok/search/keyword?query=&date_posted=last-3-months&sort_by=most-liked   (search_item_list[].aweme_info)
 *   GET /v1/tiktok/search/top?query=&publish_time=last-3-months&sort_by=relevance       (items[], ISO create_time)
 *   GET /v2/instagram/reels/search?query=&date_posted=last-month                         (reels[], ISO taken_at, likes only)
 *   GET /v3/tiktok/profile/videos?handle=  /  /v1/instagram/user/reels?handle=          (followed accounts, 1 page)
 *   GET /v1/tiktok/video/transcript?url=&language=en  /  /v2/instagram/media/transcript?url=  (top items)
 *   header x-api-key: SCRAPECREATORS_API_KEY (1 credit per call; transcripts never opt into paid long/AI modes)
 *
 * Stored as NicheScans/{yyyy-mm-dd}:
 *   videos    keyword hits (TikTok keyword + top, Instagram reels), noise-filtered, deduped, top NICHE_SCAN_KEEP
 *   accounts  followed-account outliers (last 14 days, >= 3x the page median or >= 1M views)
 *   hair      top hair/scalp videos from either source, regardless of the overall ranking
 *   the top NICHE_ENRICH_TOP items across the lists carry `transcript` and `cover_mirror` (Firebase Storage copy)
 *   requests, max_requests, credits_remaining, errors, status, phase, next (resume point)
 *
 * Runs from /api/cron/niche-scan (hourly): Saturdays from 20:00 UTC (through
 * Sunday as a catch-up), or when Settings/creator_portal.niche_scan_requested
 * is true. A run is split into chunks that each stop at a deadline; progress
 * lives in the NicheScans doc and Settings/creator_portal.niche_scan_active
 * points at it, so the next cron call resumes. Request cap:
 * Settings/creator_portal.niche_scan_max_requests (default 400). Read-only use
 * of the API.
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { SCRAPECREATORS_BASE, fetchRecentPosts, fetchTranscript, postKey, type ScrapedPost } from "./scrape";

export const NICHE_SCAN_DEFAULT_MAX_REQUESTS = 400;
export const NICHE_SCAN_KEEP = 250;
export const NICHE_HAIR_KEEP = 60;
/** Items that get a transcript + mirrored cover. */
export const NICHE_ENRICH_TOP = 40;
/** Of those, at least this many come from the hair list. */
export const NICHE_ENRICH_HAIR_MIN = 10;
export const NICHE_ACCOUNT_WINDOW_DAYS = 14;
export const NICHE_OUTLIER_MULTIPLE = 3;
export const NICHE_OUTLIER_VIEWS = 1_000_000;
const CONCURRENCY = 6;
const CAPTION_MAX = 400;
const TRANSCRIPT_MAX = 2500;
const MAX_ERRORS = 100;
/** A run still unfinished after this long is closed with what it has. */
const STALE_RUN_MS = 20 * 3600_000;
/** Instagram search gives likes only; rank those reels as if views were likes x this. */
const IG_LIKES_TO_VIEWS = 20;

export type NichePlatform = "tiktok" | "instagram";
export type NicheSource = "keyword" | "top" | "reels" | "account";

export interface NicheQuery {
  platform: NichePlatform;
  /** keyword: TikTok keyword search, top: TikTok top search, reels: Instagram reel search. */
  source: Exclude<NicheSource, "account">;
  niche: string;
  query: string;
}

export interface NicheAccount {
  platform: NichePlatform;
  handle: string;
  niche: string;
}

const kw = (niche: string, ...qs: string[]): NicheQuery[] => qs.map((query) => ({ platform: "tiktok", source: "keyword", niche, query }));
const top = (niche: string, ...qs: string[]): NicheQuery[] => qs.map((query) => ({ platform: "tiktok", source: "top", niche, query }));
const ig = (niche: string, ...qs: string[]): NicheQuery[] => qs.map((query) => ({ platform: "instagram", source: "reels", niche, query }));

/**
 * 80 searches. Dropped after the first scan for noise: "pinch test" (piercings,
 * climbing), "try this test" / "face asymmetry test" (CapCut filters),
 * "if you can't do this" (Fortnite, couples), "skin test", "health test at
 * home", "flexibility test", "jaw test", "balding test". "scalp pinch test"
 * stays (it's our own format); the caption filter drops its picking/ASMR/tick hits.
 */
export const NICHE_QUERIES: NicheQuery[] = [
  ...kw("hair", "scalp pinch test", "hair loss men", "receding hairline fix", "hairline test", "scalp massage for hair growth", "minoxidil results", "finasteride", "hair loss tips men", "thinning hair men", "norwood", "scalp tension hair loss", "stop hair loss"),
  ...top("hair", "hair loss", "receding hairline", "scalp massage", "minoxidil", "finasteride side effects", "balding", "hair regrowth", "hairline"),
  ...kw("posture", "forward head posture fix", "neck hump fix", "tech neck", "posture correction", "rounded shoulders fix", "neck pain relief", "physical therapist posture", "chiropractor neck"),
  ...top("posture", "posture", "neck hump", "forward head posture", "physiotherapy", "posture test"),
  ...kw("face", "face yoga", "jawline exercise", "mewing tutorial", "double chin exercise", "lymphatic drainage face", "facial massage"),
  ...top("face", "face yoga", "jawline", "mewing", "face massage"),
  ...kw("tests", "test that shows", "if you can't do this your posture", "check if you have", "this test shows", "wall test posture", "sit rise test", "body test at home", "hair density test"),
  ...top("tests", "test that shows", "check if you have", "if you cant do this test", "self test body"),
  ...kw("men", "mens health tips", "looksmaxxing tips", "glow up men", "testosterone naturally", "mens grooming tips"),
  ...top("men", "mens health", "looksmaxxing", "glow up tips men"),
  ...ig("hair", "hair loss", "receding hairline", "scalp massage", "minoxidil", "finasteride"),
  ...ig("posture", "forward head posture", "neck hump", "posture correction", "physiotherapy"),
  ...ig("face", "face yoga", "jawline exercise", "mewing"),
  ...ig("tests", "test that shows", "check if you have", "sit rise test"),
  ...ig("men", "mens health", "looksmaxxing"),
];

const tta = (niche: string, ...hs: string[]): NicheAccount[] => hs.map((handle) => ({ platform: "tiktok", handle, niche }));

/**
 * Used when Settings/creator_portal.niche_accounts is empty. Picked from the
 * first scan: on-niche creators with high-view hits (most with several).
 * Our own accounts (aadi.keshah, isai.trujillo01) are left out.
 */
export const DEFAULT_NICHE_ACCOUNTS: NicheAccount[] = [
  ...tta("posture", "drrodpt", "dr.nick.md", "jack.bear65", "nikita_harivansh", "drminahilriaz", "physicaltherapysession", "conor_harris_", "kivenro", "zariguldd", "drjoshpt", "drjoedamiani", "youngeryoudoc", "squatuniversity", "jaydenberrey", "alinacarballo_", "desmoineschiro", "venus_gabby"),
  ...tta("hair", "tomgillbanks", "sofiahairhealth", "abbeyyung", "ava.roxana", "kierslynnwright", "cherujackson", "brandon.blendz", "_dakarae_", "viorinecare", "weemotd", "bebameee", "yaofacial", "drdavidkim", "dermatologysurgeon", "fiftiesmama", "atrakt.labs", "monkeyexplainshow"),
  ...tta("face", "julfacer", "ledidiana_", "qovesstudio", "nt.timon"),
  ...tta("tests", "misterbrainboost"),
  { platform: "instagram", handle: "menopause.dna.coach", niche: "tests" },
];

/** Settings value -> accounts (invalid rows dropped, handles cleaned, deduped). Empty -> the default list. */
export function parseNicheAccounts(raw: unknown): NicheAccount[] {
  const out: NicheAccount[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(raw) ? raw : []) {
    const o = obj(r);
    const platform = o.platform === "instagram" ? "instagram" : o.platform === "tiktok" ? "tiktok" : null;
    const handle = str(o.handle).trim().replace(/^@+/, "").toLowerCase();
    if (!platform || !/^[a-z0-9._]{1,40}$/.test(handle)) continue;
    const k = `${platform}:${handle}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ platform, handle, niche: str(o.niche).trim() || "other" });
  }
  return out.length ? out : DEFAULT_NICHE_ACCOUNTS;
}

export interface NicheVideo {
  platform: NichePlatform;
  source: NicheSource;
  niche: string;
  /** The search query, or "@handle" for followed accounts. */
  query: string;
  url: string;
  handle: string;
  /** 0 when the API gives none (Instagram search lists likes only). */
  views: number;
  likes: number;
  comments: number;
  shares: number;
  caption: string;
  posted_at: string | null;
  cover?: string;
  /** Followed accounts: median views of the account's page, and views / median. */
  median_views?: number;
  ratio?: number;
  /** Enriched items: transcript text ("" = none / no speech) and our own copy of the cover. */
  transcript?: string;
  cover_mirror?: string;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");
/** Unix seconds or an ISO string (top search and Instagram search use ISO). */
export const toIso = (v: unknown): string | null => {
  if (typeof v === "string" && v && !/^\d+$/.test(v)) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  return num(v) > 0 ? new Date(num(v) * 1000).toISOString() : null;
};
const firstUrl = (v: unknown): string | undefined => {
  const list = obj(v).url_list;
  if (!Array.isArray(list)) return undefined;
  const http = list.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));
  return http.find((u) => !/\.heic(\?|$)/.test(u)) ?? http[0];
};
const ttCover = (a: Json): string | undefined => firstUrl(obj(a.video).cover) || firstUrl(obj(a.video).origin_cover) || firstUrl(a.cover);

/** One TikTok aweme (keyword search aweme_info or a top-search item). */
function tiktokVideo(a: Json, q: NicheQuery): NicheVideo | null {
  const id = str(a.aweme_id) || str(a.id);
  const handle = str(obj(a.author).unique_id);
  if (!id) return null;
  const s = obj(a.statistics);
  const link = str(a.share_url) || str(a.url);
  const cover = ttCover(a);
  return {
    platform: "tiktok",
    source: q.source,
    niche: q.niche,
    query: q.query,
    url: link.split("?")[0] || `https://www.tiktok.com/@${handle}/video/${id}`,
    handle,
    views: num(s.play_count),
    likes: num(s.digg_count),
    comments: num(s.comment_count),
    shares: num(s.share_count),
    caption: str(a.desc).slice(0, CAPTION_MAX),
    posted_at: toIso(a.create_time),
    ...(cover ? { cover } : {}),
  };
}

/** TikTok keyword search: search_item_list[].aweme_info. */
export function parseTiktokSearch(d: unknown, q: NicheQuery): NicheVideo[] {
  const list = obj(d).search_item_list;
  if (!Array.isArray(list)) return [];
  return list.map((it) => tiktokVideo(obj(obj(it).aweme_info), q)).filter((v): v is NicheVideo => !!v);
}

/** TikTok top search: items[] (videos and photo carousels; id, url, ISO create_time). */
export function parseTiktokTop(d: unknown, q: NicheQuery): NicheVideo[] {
  const list = obj(d).items;
  if (!Array.isArray(list)) return [];
  return list.map((it) => tiktokVideo(obj(it), q)).filter((v): v is NicheVideo => !!v);
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
    const cover = str(r.thumbnail_src) || str(r.display_url);
    out.push({
      platform: "instagram",
      source: q.source,
      niche: q.niche,
      query: q.query,
      url,
      handle: str(owner.username),
      views: num(r.video_play_count ?? r.play_count ?? r.video_view_count ?? r.view_count),
      likes: num(r.like_count ?? obj(r.edge_liked_by).count),
      comments: num(r.comment_count ?? obj(r.edge_media_to_comment).count),
      shares: 0,
      caption: caption.slice(0, CAPTION_MAX),
      posted_at: toIso(r.taken_at ?? r.taken_at_timestamp),
      ...(cover ? { cover } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------- noise filter

/**
 * Caption must mention one of these for its niche. Strings match at a word
 * start (so "hair" also hits "#hairloss"); regexes are for short words that
 * need a whole-word match.
 */
export const NICHE_TERMS: Record<string, (string | RegExp)[]> = {
  hair: ["hair", "scalp", "bald", "minoxidil", "finasteride", "dutasteride", "alopecia", "receding", "thinning", "shedding", "regrow", "follicle", "dht", "norwood", "crown", "rosemary oil", "dermaroll", "derma roll", "microneedl", "transplant"],
  posture: ["postur", "neck", "techneck", "neckhump", "hump", "forward head", "shoulder", "spine", "spinal", "thoracic", "slouch", "hunch", "chiropract", "physio", "physical therap", "back pain", "upper back", "cervical", "mobility", "stretch"],
  face: ["face yoga", "faceyoga", "face", "facial", "jaw", "mewing", "mew", "chin", "cheek", "lymphatic", "forehead", "wrinkle", "puffy", "looksmax"],
  men: [/\bmen\b/, /\bmen'?s\b/, "menshealth", "mens health", "guys", "testosterone", "looksmax", "glow up", "glowup", "grooming", "jawline", "posture", "hairline", "hair", "skincare", "beard", "physique"],
};
/** "tests" needs a test word AND a body word. */
const TEST_WORDS: (string | RegExp)[] = ["test", "check if", "can you", "if you can't", "if you cant", "try this", "self-check", "do you have"];
const BODY_WORDS: (string | RegExp)[] = ["posture", "neck", "spine", /\bback\b/, "shoulder", "hip", "knee", "balance", "longevity", "health", "blood", "circulation", "mobility", "hydrat", "dehydrat", "skin", "scalp", "hair", "grip", "jaw", "face", "breath", "lung", "heart", "body", "muscle", "joint", "flexib"];
/** Noise seen in the first scan; any match drops the video whatever the niche. */
const BLOCK = [/\basmr\b/, /\bpicking?\s?scalp\b/, /\bpickingscalp\b/, /\bscalp ?picking\b/, /\bticks?\b/, /\bpsoriasis\b/, /\bpimple/, /\bcapcut/, /\bfilter\b/, /\bfortnite\b/, /\bpokemon\b/, /\bpiercing/, /\bgender ?reveal\b/, /\bpregnan/, /\bclavicular\b/, /\bcharged\b/, /\baccused\b/];

const hasTerm = (text: string, terms: (string | RegExp)[]) =>
  terms.some((t) => (t instanceof RegExp ? t : new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)).test(text));

/**
 * Keep a video only when its caption names something from its niche (and no
 * blocked noise). Empty captions are dropped unless `allowEmpty` (followed
 * accounts, which are on-niche already).
 */
export function isRelevant(caption: string, niche: string, opts: { allowEmpty?: boolean } = {}): boolean {
  const c = String(caption ?? "").toLowerCase().replace(/[’`]/g, "'");
  if (!c.trim()) return opts.allowEmpty === true;
  if (BLOCK.some((re) => re.test(c))) return false;
  if (niche === "tests") return hasTerm(c, TEST_WORDS) && hasTerm(c, BODY_WORDS);
  const terms = NICHE_TERMS[niche];
  return terms ? hasTerm(c, terms) : true;
}

/** For the hair list: a hair caption, or an uncaptioned outlier from a followed hair account. */
const isHair = (v: NicheVideo) => isRelevant(v.caption, "hair", { allowEmpty: v.source === "account" && v.niche === "hair" });

// ---------------------------------------------------------------- followed accounts

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * One page of an account's videos -> its outliers: posted in the last 14 days
 * and >= 3x the page's median views (pinned posts excluded) or >= 1M views.
 */
export function accountOutliers(posts: ScrapedPost[], acct: NicheAccount, now: Date): NicheVideo[] {
  const unpinned = posts.filter((p) => !p.pinned);
  const med = median(unpinned.map((p) => p.views));
  const since = now.getTime() - NICHE_ACCOUNT_WINDOW_DAYS * 86400_000;
  return unpinned
    .filter((p) => Date.parse(p.posted_at) >= since)
    .filter((p) => p.views >= NICHE_OUTLIER_VIEWS || (med > 0 && p.views >= NICHE_OUTLIER_MULTIPLE * med))
    .map((p) => ({
      platform: acct.platform,
      source: "account" as const,
      niche: acct.niche,
      query: `@${acct.handle}`,
      url: p.url,
      handle: acct.handle,
      views: p.views,
      likes: 0,
      comments: 0,
      shares: 0,
      caption: p.caption.slice(0, CAPTION_MAX),
      posted_at: p.posted_at,
      ...(p.thumbnail_url ? { cover: p.thumbnail_url } : {}),
      median_views: med,
      ratio: med > 0 ? Math.round((p.views / med) * 10) / 10 : 0,
    }));
}

// ---------------------------------------------------------------- ranking

/** Views, or for like-only Instagram reels an estimate from likes. */
export const rankScore = (v: Pick<NicheVideo, "views" | "likes">): number => v.views || v.likes * IG_LIKES_TO_VIEWS;

/** Dedupe by URL (keeping enrichment), then the strongest first, capped. */
export function rankNicheVideos(all: NicheVideo[], keep = NICHE_SCAN_KEEP): NicheVideo[] {
  const byUrl = new Map<string, NicheVideo>();
  for (const v of all) {
    const prev = byUrl.get(v.url);
    if (!prev) byUrl.set(v.url, v);
    else {
      const best = rankScore(v) > rankScore(prev) ? v : prev;
      const other = best === v ? prev : v;
      byUrl.set(v.url, {
        ...best,
        ...(best.transcript === undefined && other.transcript !== undefined ? { transcript: other.transcript } : {}),
        ...(!best.cover_mirror && other.cover_mirror ? { cover_mirror: other.cover_mirror } : {}),
      });
    }
  }
  return [...byUrl.values()].sort((a, b) => rankScore(b) - rankScore(a) || b.likes - a.likes).slice(0, keep);
}

/**
 * URLs to enrich: at least `hairMin` from the hair list, then the strongest
 * of everything (followed-account outliers first: they're the clearest signal).
 */
export function pickForEnrichment(lists: { videos: NicheVideo[]; accounts: NicheVideo[]; hair: NicheVideo[] }, n = NICHE_ENRICH_TOP, hairMin = NICHE_ENRICH_HAIR_MIN): string[] {
  const out: string[] = [];
  const add = (v: NicheVideo) => {
    if (out.length < n && !out.includes(v.url)) out.push(v.url);
  };
  lists.hair.slice(0, hairMin).forEach(add);
  rankNicheVideos(lists.accounts, n).forEach(add);
  rankNicheVideos(lists.videos, n).forEach(add);
  return out;
}

// ---------------------------------------------------------------- schedule

/** Scan id for a run starting now: the UTC date. */
export const nicheScanId = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * Saturday from 20:00 UTC (scripts are drafted after it, before the Sunday
 * 00:30 UTC push), with Sunday as a catch-up, once per weekend; or a manual
 * request. `last` is the id of the last scan.
 */
export function nicheScanDue(p: { now: Date; requested: boolean; last: string | null }): boolean {
  if (p.requested) return true;
  const d = p.now;
  const day = d.getUTCDay();
  const sat = day === 6 && d.getUTCHours() >= 20 ? d : day === 0 ? new Date(d.getTime() - 86400_000) : null;
  if (!sat) return false;
  const satId = nicheScanId(sat);
  return !p.last || p.last < satId;
}

// ---------------------------------------------------------------- run

function searchUrl(q: NicheQuery): string {
  const p = new URLSearchParams({ query: q.query });
  if (q.source === "keyword") {
    p.set("date_posted", "last-3-months");
    p.set("sort_by", "most-liked");
    return `${SCRAPECREATORS_BASE}/v1/tiktok/search/keyword?${p}`;
  }
  if (q.source === "top") {
    p.set("publish_time", "last-3-months");
    p.set("sort_by", "relevance");
    return `${SCRAPECREATORS_BASE}/v1/tiktok/search/top?${p}`;
  }
  p.set("date_posted", "last-month");
  return `${SCRAPECREATORS_BASE}/v2/instagram/reels/search?${p}`;
}

/** What's persisted in NicheScans/{id} between chunks. */
export interface NicheScanState {
  status: "running" | "done";
  phase: "search" | "enrich" | "done";
  /** Next job index in the search phase (queries, then accounts). */
  next: number;
  started_ms: number;
  queries: NicheQuery[];
  follow: NicheAccount[];
  requests: number;
  max_requests: number;
  credits_remaining: number | null;
  found: number;
  chunks: number;
  errors: { job: string; error: string }[];
  videos: NicheVideo[];
  accounts: NicheVideo[];
  hair: NicheVideo[];
}

export interface NicheScanResult {
  id: string;
  status: "running" | "done";
  phase: NicheScanState["phase"];
  requests: number;
  videos: number;
  accounts: number;
  hair: number;
  errors: number;
  credits_remaining: number | null;
}

export interface NicheScanDeps {
  now?: Date;
  /** Stop starting new work after this (ms epoch). */
  deadlineMs?: number;
  fetchImpl?: typeof fetch;
  /** Copy a cover into storage; returns its permanent URL or null. Default: Firebase Storage. */
  mirrorCover?: (path: string, v: NicheVideo, fetchImpl: typeof fetch) => Promise<string | null>;
  /** Settings/creator_portal data, when the caller already read it. */
  settings?: Json;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** Default cover mirror: stored CDN URL, then (TikTok) free oEmbed; into Firebase Storage. No credits. */
async function mirrorToStorage(path: string, v: NicheVideo, fetchImpl: typeof fetch): Promise<string | null> {
  const media = await import("./proven-media");
  let img = v.cover ? await media.downloadImage([v.cover], fetchImpl) : null;
  if (!img && v.platform === "tiktok") {
    const o = await media.tiktokOembedCover(v.url, fetchImpl);
    img = o.length ? await media.downloadImage(o, fetchImpl) : null;
  }
  if (!img) return null;
  const ext = img.contentType === "image/png" ? "png" : img.contentType === "image/webp" ? "webp" : "jpg";
  return media.storeInFirebase(`${path}.${ext}`, img.buf, img.contentType);
}

export function newScanState(now: Date, settings: Json): NicheScanState {
  const cap = num(settings.niche_scan_max_requests);
  return {
    status: "running",
    phase: "search",
    next: 0,
    started_ms: now.getTime(),
    queries: NICHE_QUERIES,
    follow: parseNicheAccounts(settings.niche_accounts),
    requests: 0,
    max_requests: cap > 0 ? Math.floor(cap) : NICHE_SCAN_DEFAULT_MAX_REQUESTS,
    credits_remaining: null,
    found: 0,
    chunks: 0,
    errors: [],
    videos: [],
    accounts: [],
    hair: [],
  };
}

/**
 * Advance a scan as far as the deadline and request cap allow. Pure apart
 * from the network (no Firestore): the caller persists the returned state.
 */
export async function advanceNicheScan(state: NicheScanState, deps: { apiKey: string; now: Date; deadlineMs: number; fetchImpl: typeof fetch; mirrorCover: NonNullable<NicheScanDeps["mirrorCover"]>; scanId: string }): Promise<NicheScanState> {
  const s: NicheScanState = { ...state, errors: [...state.errors], chunks: state.chunks + 1 };
  const base = deps.fetchImpl;
  // Every ScrapeCreators call (retries included) counts toward the cap; CDN image downloads don't.
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith(SCRAPECREATORS_BASE)) s.requests++;
    return base(input, init);
  }) as typeof fetch;
  const credit = (n: number | null | undefined) => {
    if (typeof n === "number") s.credits_remaining = n;
  };
  const fail = (job: string, e: unknown) => {
    if (s.errors.length < MAX_ERRORS) s.errors.push({ job, error: errMsg(e) });
  };
  const timeLeft = () => Date.now() < deps.deadlineMs;

  if (s.phase === "search") {
    const jobs = s.queries.length + s.follow.length;
    // Leave room for the transcripts.
    const searchCap = Math.max(0, s.max_requests - NICHE_ENRICH_TOP);
    while (s.next < jobs && timeLeft() && s.requests < searchCap) {
      const batch: number[] = [];
      for (let i = s.next; i < jobs && batch.length < Math.min(CONCURRENCY, searchCap - s.requests); i++) batch.push(i);
      const found: NicheVideo[][] = await Promise.all(
        batch.map(async (i) => {
          if (i < s.queries.length) {
            const q = s.queries[i];
            try {
              const res = await f(searchUrl(q), { headers: { "x-api-key": deps.apiKey }, signal: AbortSignal.timeout(45_000) });
              const d = (await res.json().catch(() => ({}))) as Json;
              if (!res.ok || d.success === false) throw new Error(str(d.message) || `HTTP ${res.status}`);
              credit(typeof d.credits_remaining === "number" ? d.credits_remaining : null);
              const raw = q.source === "keyword" ? parseTiktokSearch(d, q) : q.source === "top" ? parseTiktokTop(d, q) : parseInstagramSearch(d, q);
              s.found += raw.length;
              return raw.filter((v) => isRelevant(v.caption, q.niche));
            } catch (e) {
              fail(`${q.source}: ${q.query}`, e);
              return [];
            }
          }
          const a = s.follow[i - s.queries.length];
          try {
            const r = await fetchRecentPosts(a.platform, a.handle, { apiKey: deps.apiKey, maxPages: 1, fetchImpl: f });
            credit(r.credits_remaining);
            s.found += r.posts.length;
            return accountOutliers(r.posts, a, deps.now).filter((v) => isRelevant(v.caption, a.niche, { allowEmpty: true }));
          } catch (e) {
            fail(`@${a.handle} (${a.platform})`, e);
            return [];
          }
        }),
      );
      s.next = batch[batch.length - 1] + 1;
      const flat = found.flat();
      s.videos = rankNicheVideos([...s.videos, ...flat.filter((v) => v.source !== "account")]);
      s.accounts = rankNicheVideos([...s.accounts, ...flat.filter((v) => v.source === "account")], NICHE_SCAN_KEEP);
      s.hair = rankNicheVideos([...s.hair, ...flat.filter(isHair)], NICHE_HAIR_KEEP);
    }
    if (s.next >= jobs || s.requests >= searchCap) s.phase = "enrich";
  }

  if (s.phase === "enrich") {
    const picks = pickForEnrichment(s);
    const lists = [s.videos, s.accounts, s.hair];
    const find = (url: string) => lists.flatMap((l) => l.filter((v) => v.url === url));
    const todo = picks.filter((u) => find(u).some((v) => v.transcript === undefined));
    let i = 0;
    while (i < todo.length && timeLeft() && s.requests < s.max_requests) {
      const batch = todo.slice(i, i + Math.min(4, s.max_requests - s.requests));
      i += batch.length;
      await Promise.all(
        batch.map(async (url) => {
          const v = find(url)[0];
          let transcript = "";
          try {
            const r = await fetchTranscript(v.platform, v.url, { apiKey: deps.apiKey, fetchImpl: f });
            credit(r.credits_remaining);
            transcript = r.text.slice(0, TRANSCRIPT_MAX);
          } catch (e) {
            fail(`transcript ${v.url}`, e);
          }
          let mirror: string | null = null;
          if (!v.cover_mirror) {
            try {
              const key = postKey(v.url, v.platform).replace(/[^A-Za-z0-9_-]/g, "_");
              mirror = await deps.mirrorCover(`niche_covers/${deps.scanId}/${key}`, v, base);
            } catch (e) {
              fail(`cover ${v.url}`, e);
            }
          }
          for (const x of find(url)) {
            x.transcript = transcript;
            if (mirror) x.cover_mirror = mirror;
          }
        }),
      );
    }
    const left = pickForEnrichment(s).some((u) => find(u).some((v) => v.transcript === undefined));
    if (!left || s.requests >= s.max_requests) s.phase = "done";
  }

  if (s.phase === "done" || deps.now.getTime() - s.started_ms > STALE_RUN_MS) {
    s.phase = "done";
    s.status = "done";
  }
  return s;
}

/**
 * One cron chunk: resume the active scan (Settings/creator_portal.niche_scan_active)
 * or start a new one, advance it until the deadline, and save progress.
 */
export async function runNicheScanChunk(db: Firestore, deps: NicheScanDeps = {}): Promise<NicheScanResult> {
  const apiKey = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!apiKey) throw new Error("SCRAPECREATORS_API_KEY is not set");
  const now = deps.now ?? new Date();
  const settingsRef = db.collection("Settings").doc("creator_portal");
  const settings = deps.settings ?? (await settingsRef.get()).data() ?? {};
  const active = typeof settings.niche_scan_active === "string" ? settings.niche_scan_active : null;
  let id = active ?? nicheScanId(now);
  let state: NicheScanState | null = null;
  if (active) {
    const d = (await db.collection("NicheScans").doc(active).get()).data();
    if (d && d.status === "running") state = d as NicheScanState;
  }
  if (!state) {
    id = nicheScanId(now);
    state = newScanState(now, settings);
    await settingsRef.set({ niche_scan_active: id, niche_scan_requested: false }, { merge: true });
    await db.collection("NicheScans").doc(id).set({ ...state, ran_at: FieldValue.serverTimestamp() });
  }
  const s = await advanceNicheScan(state, {
    apiKey,
    now,
    deadlineMs: deps.deadlineMs ?? Date.now() + 230_000,
    fetchImpl: deps.fetchImpl ?? fetch,
    mirrorCover: deps.mirrorCover ?? mirrorToStorage,
    scanId: id,
  });
  await db
    .collection("NicheScans")
    .doc(id)
    .set({ ...s, updated_at: FieldValue.serverTimestamp(), ...(s.status === "done" ? { finished_at: FieldValue.serverTimestamp() } : {}) });
  if (s.status === "done") await settingsRef.set({ niche_scan_active: FieldValue.delete(), niche_scan_last: id }, { merge: true });
  return { id, status: s.status, phase: s.phase, requests: s.requests, videos: s.videos.length, accounts: s.accounts.length, hair: s.hair.length, errors: s.errors.length, credits_remaining: s.credits_remaining };
}
