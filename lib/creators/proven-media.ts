/**
 * Our own copy of each proven video's cover image.
 *
 * TikTok / Instagram cover URLs are signed and expire after a few days, and
 * many originals were never stored with one, so the creators app showed
 * placeholders. This copies the cover into Firebase Storage once and keeps a
 * permanent download-token URL on the doc:
 *
 *   ProvenVideos/{id}.media = { thumbnail_url, mirrored_at }
 *   (failures: media.attempts / media.last_error / media.last_attempt_at)
 *
 * Source order per video, cheapest first: the stored (maybe stale)
 * thumbnail_url, then (TikTok) the public oEmbed endpoint (no key, free), then
 * one ScrapeCreators single-video call (1 credit) for a fresh cover. Every cover
 * URL found is signed and short-lived, so it's downloaded straight away.
 * Runs on approve (route `after()`), from the daily cron (capped) and from the
 * admin backfill route. Idempotent: videos with media.thumbnail_url are skipped,
 * and a video stops being retried after MEDIA_MAX_ATTEMPTS failures.
 */
import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { STORAGE_BUCKET } from "./db";
import { PROVEN_COLLECTION, type ProvenMedia, type ProvenVideo } from "./proven";

export type { ProvenMedia };
import { SCRAPECREATORS_BASE, ScrapeError } from "./scrape";
import type { Platform } from "./types";

/** Most covers the daily cron mirrors per run (at most 1 credit each). */
export const MEDIA_CRON_CAP = 25;
/** Most covers one backfill call mirrors (the admin route can be re-run for the rest). */
export const MEDIA_BACKFILL_CAP = 200;
/** A video stops being retried after this many failed attempts (deleted / private originals). */
export const MEDIA_MAX_ATTEMPTS = 3;
export const MEDIA_CONCURRENCY = 6;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const COVER_PREFIX = "proven_covers";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const isHttp = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//.test(v);

function apiBase(): string {
  const o = process.env.SCRAPECREATORS_BASE_URL ?? "";
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o) ? o : SCRAPECREATORS_BASE;
}

/** Does this video still need a mirrored cover (and is it worth trying again)? */
export function needsCover(v: Pick<ProvenVideo, "status" | "source_url" | "platform" | "added_by" | "media">): boolean {
  if (v.status !== "active" || v.added_by === "founder_idea") return false;
  if (!v.source_url || !v.platform) return false;
  if (v.media?.thumbnail_url) return false;
  return (v.media?.attempts ?? 0) < MEDIA_MAX_ATTEMPTS;
}

/** HEIC last (Flutter can't decode it everywhere), animated covers after stills. */
function rankImageUrls(urls: string[]): string[] {
  const score = (u: string) => (/\.heic(\?|$)|heic/i.test(u) ? 2 : 0);
  return [...new Set(urls.filter(isHttp))].sort((a, b) => score(a) - score(b));
}

/**
 * Cover image candidates from a single-video response, best first.
 *   TikTok  GET /v2/tiktok/video  -> aweme_detail.video.{cover, origin_cover, dynamic_cover}.url_list
 *   Instagram GET /v1/instagram/post -> data.xdt_shortcode_media.{display_url, thumbnail_src}
 *     (older / v1 shapes: items[0].image_versions2.candidates[].url)
 */
export function parseCoverUrls(platform: Platform, raw: unknown): string[] {
  const d = obj(raw);
  if (platform === "tiktok") {
    const v = obj(obj(d.aweme_detail ?? obj(d.data).aweme_detail).video);
    const list = (k: string) => {
      const l = obj(v[k]).url_list;
      return Array.isArray(l) ? (l.filter(isHttp) as string[]) : [];
    };
    return [...rankImageUrls([...list("cover"), ...list("origin_cover")]), ...rankImageUrls(list("dynamic_cover"))];
  }
  const m = obj(obj(d.data).xdt_shortcode_media);
  const out: string[] = [];
  if (isHttp(m.display_url)) out.push(m.display_url);
  if (isHttp(m.thumbnail_src)) out.push(m.thumbnail_src);
  const items = Array.isArray(d.items) ? d.items : [];
  for (const it of items.slice(0, 1)) {
    const c = obj(obj(obj(it).image_versions2)).candidates;
    if (Array.isArray(c)) for (const x of c) if (isHttp(obj(x).url)) out.push(obj(x).url as string);
  }
  if (!out.length) out.push(...findImageFields(d));
  return rankImageUrls(out);
}

const IMAGE_KEYS = new Set(["display_url", "thumbnail_src", "thumbnail_url", "cover_url", "image_url"]);

/** Fallback for response shapes we don't know: any image-ish field, anywhere (skips profile pics). */
function findImageFields(root: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 8 || out.length >= 6 || v == null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v.slice(0, 3)) walk(x, depth + 1);
      return;
    }
    for (const [k, x] of Object.entries(v as Json)) {
      if (k === "owner" || k.includes("profile_pic") || k.includes("comment")) continue;
      if (IMAGE_KEYS.has(k) && isHttp(x)) out.push(x as string);
      else if (k === "candidates" && Array.isArray(x)) {
        for (const c of x) if (isHttp(obj(c).url)) out.push(obj(c).url as string);
      } else walk(x, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

/** Top-level shape of a response, for error messages when no cover was found. */
export function describeShape(raw: unknown): string {
  const d = obj(raw);
  return Object.keys(d)
    .slice(0, 8)
    .map((k) => {
      const v = d[k];
      return v && typeof v === "object" && !Array.isArray(v) ? `${k}{${Object.keys(v as Json).slice(0, 6).join(",")}}` : k;
    })
    .join(" ");
}

/** Fresh cover URLs for one video (1 credit). Throws ScrapeError on API trouble. */
export async function fetchCoverUrls(
  platform: Platform,
  url: string,
  opts: { apiKey: string; fetchImpl?: typeof fetch },
): Promise<{ urls: string[]; shape: string; credits_remaining: number | null }> {
  const q = new URLSearchParams(platform === "tiktok" ? { url, trim: "true" } : { url });
  const path = platform === "tiktok" ? `/v2/tiktok/video?${q}` : `/v1/instagram/post?${q}`;
  const res = await (opts.fetchImpl ?? fetch)(`${apiBase()}${path}`, { headers: { "x-api-key": opts.apiKey }, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new ScrapeError(`HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
  let body: Json;
  try {
    body = obj(JSON.parse(text));
  } catch {
    throw new ScrapeError(`Bad JSON: ${text.slice(0, 120)}`);
  }
  if (body.success === false) throw new ScrapeError(`API error: ${String(body.message ?? body.error ?? "success=false").slice(0, 200)}`);
  return {
    urls: parseCoverUrls(platform, body),
    shape: describeShape(body),
    credits_remaining: typeof body.credits_remaining === "number" ? body.credits_remaining : null,
  };
}

/**
 * TikTok's public oEmbed: thumbnail_url with no key and no credits. Geo-blocked
 * from India (redirects), fine from Vercel. Returns [] on any trouble.
 */
export async function tiktokOembedCover(url: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  try {
    const res = await fetchImpl(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const t = obj(await res.json().catch(() => ({}))).thumbnail_url;
    return isHttp(t) ? [t] : [];
  } catch {
    return [];
  }
}

const IMAGE_HEADERS = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  accept: "image/jpeg,image/webp,image/png,image/*;q=0.8",
};

/** First candidate that downloads as a (non-HEIC) image. null when none do. */
export async function downloadImage(
  urls: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ buf: Buffer; contentType: string; from: string } | null> {
  for (const u of urls) {
    try {
      const res = await fetchImpl(u, { headers: IMAGE_HEADERS, cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!/^image\/(jpeg|jpg|png|webp)$/.test(contentType)) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500 || buf.length > MAX_IMAGE_BYTES) continue;
      return { buf, contentType: contentType === "image/jpg" ? "image/jpeg" : contentType, from: u };
    } catch {
      /* next candidate */
    }
  }
  return null;
}

export type StoreFn = (path: string, buf: Buffer, contentType: string) => Promise<string>;

/** Upload to the keshah-app bucket; returns a permanent download-token URL (no expiry, works with any rules). */
export const storeInFirebase: StoreFn = async (path, buf, contentType) => {
  const token = randomUUID();
  await getStorage(getFirebaseAdmin().app)
    .bucket(STORAGE_BUCKET)
    .file(path)
    .save(buf, {
      contentType,
      resumable: false,
      metadata: { cacheControl: "public, max-age=31536000, immutable", metadata: { firebaseStorageDownloadTokens: token } },
    });
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
};

function coverPath(id: string, contentType: string): string {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${COVER_PREFIX}/${id.replace(/[^A-Za-z0-9_-]/g, "_")}.${ext}`;
}

export interface MirrorOneResult {
  ok: boolean;
  thumbnail_url?: string;
  /** "stored" (old CDN URL still worked) and "oembed" (TikTok) cost 0 credits; "api" costs 1. */
  source?: "stored" | "oembed" | "api";
  credits_used: number;
  credits_remaining?: number | null;
  error?: string;
}

/** Find and store one cover. No Firestore writes (the caller saves the result). */
export async function mirrorCover(
  id: string,
  v: Pick<ProvenVideo, "source_url" | "platform" | "thumbnail_url">,
  deps: { apiKey: string; fetchImpl?: typeof fetch; store?: StoreFn },
): Promise<MirrorOneResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const store = deps.store ?? storeInFirebase;
  let credits = 0;
  let creditsRemaining: number | null | undefined;
  try {
    let img = v.thumbnail_url ? await downloadImage([v.thumbnail_url], fetchImpl) : null;
    let source: MirrorOneResult["source"] = "stored";
    if (!img && v.platform === "tiktok" && v.source_url) {
      const o = await tiktokOembedCover(v.source_url, fetchImpl);
      img = o.length ? await downloadImage(o, fetchImpl) : null;
      source = "oembed";
    }
    if (!img) {
      if (!deps.apiKey) return { ok: false, credits_used: 0, error: "SCRAPECREATORS_API_KEY not set" };
      if (!v.source_url || !v.platform) return { ok: false, credits_used: 0, error: "no source_url" };
      credits = 1;
      const r = await fetchCoverUrls(v.platform, v.source_url, { apiKey: deps.apiKey, fetchImpl });
      creditsRemaining = r.credits_remaining;
      if (!r.urls.length) return { ok: false, credits_used: credits, credits_remaining: creditsRemaining, error: `no cover in response (${r.shape})` };
      img = await downloadImage(r.urls, fetchImpl);
      source = "api";
      if (!img) return { ok: false, credits_used: credits, credits_remaining: creditsRemaining, error: "cover download failed" };
    }
    const url = await store(coverPath(id, img.contentType), img.buf, img.contentType);
    return { ok: true, thumbnail_url: url, source, credits_used: credits, credits_remaining: creditsRemaining };
  } catch (e) {
    return { ok: false, credits_used: credits, credits_remaining: creditsRemaining, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}

export interface MirrorRunResult {
  dry: boolean;
  /** Active videos still missing a cover (before this run). */
  needing: number;
  /** Of those, Instagram ones with no stored thumbnail_url: certainly 1 credit each (TikTok tries oEmbed first). */
  needing_api: number;
  /** Upper bound on credits for this run's batch (every free route failing). */
  max_credits: number;
  attempted: number;
  mirrored: number;
  from_stored: number;
  from_oembed: number;
  failed: { id: string; error: string }[];
  credits_used: number;
  credits_remaining: number | null;
  /** Still missing after this run (cap / deadline); run again for the rest. */
  remaining: number;
  ids?: string[];
}

/**
 * Mirror covers for active videos that lack one, up to `limit`. `dry` only
 * counts. `ids` limits the run to those docs (e.g. the one just approved).
 */
export async function mirrorProvenCovers(opts: {
  db?: Firestore;
  limit?: number;
  dry?: boolean;
  ids?: string[];
  deadlineMs?: number;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  store?: StoreFn;
  now?: () => Date;
  log?: (m: string) => void;
} = {}): Promise<MirrorRunResult> {
  const db = opts.db ?? getFirebaseAdmin().db;
  const col = db.collection(PROVEN_COLLECTION);
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? ((m: string) => console.log(m));
  const apiKey = opts.apiKey ?? process.env.SCRAPECREATORS_API_KEY ?? "";
  const limit = Math.max(0, opts.limit ?? MEDIA_CRON_CAP);
  const docs = opts.ids?.length
    ? (await db.getAll(...opts.ids.map((id) => col.doc(id)))).filter((s) => s.exists)
    : (await col.where("status", "==", "active").get()).docs;
  const need = docs
    .map((s) => ({ id: s.id, d: s.data() as ProvenVideo }))
    .filter((x) => needsCover(x.d));
  const out: MirrorRunResult = {
    dry: !!opts.dry,
    needing: need.length,
    needing_api: need.filter((x) => !x.d.thumbnail_url && x.d.platform === "instagram").length,
    max_credits: Math.min(need.length, limit),
    attempted: 0,
    mirrored: 0,
    from_stored: 0,
    from_oembed: 0,
    failed: [],
    credits_used: 0,
    credits_remaining: null,
    remaining: need.length,
  };
  const batch = need.slice(0, limit);
  if (opts.dry) return { ...out, ids: batch.map((x) => x.id) };

  const queue = [...batch];
  await Promise.all(
    Array.from({ length: Math.min(MEDIA_CONCURRENCY, queue.length) }, async () => {
      for (let x = queue.shift(); x; x = queue.shift()) {
        if (opts.deadlineMs && Date.now() > opts.deadlineMs) return;
        out.attempted++;
        const r = await mirrorCover(x.id, x.d, { apiKey, fetchImpl: opts.fetchImpl, store: opts.store });
        out.credits_used += r.credits_used;
        if (r.credits_remaining != null) out.credits_remaining = r.credits_remaining;
        const at = now().toISOString();
        try {
          if (r.ok) {
            await col.doc(x.id).update({ media: { thumbnail_url: r.thumbnail_url, mirrored_at: at } });
            out.mirrored++;
            if (r.source === "stored") out.from_stored++;
            if (r.source === "oembed") out.from_oembed++;
          } else {
            const prev = x.d.media ?? {};
            await col.doc(x.id).update({
              media: { ...prev, attempts: (prev.attempts ?? 0) + 1, last_error: r.error ?? "unknown", last_attempt_at: at },
            });
            out.failed.push({ id: x.id, error: r.error ?? "unknown" });
          }
        } catch (e) {
          out.failed.push({ id: x.id, error: `save failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}` });
        }
      }
    }),
  );
  out.remaining = need.length - out.mirrored;
  log(`proven covers: ${out.mirrored}/${out.attempted} mirrored (${out.from_stored} stored URL, ${out.from_oembed} oEmbed), ${out.failed.length} failed, ${out.credits_used} credits`);
  return out;
}
