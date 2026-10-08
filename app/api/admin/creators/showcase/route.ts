// Admin / cron-secret tool: a creator's top videos, copied to Firebase Storage
// (video + cover), for the app's landing montage and verify screen wall.
//   GET ?handle=jennifer.keshah&platform=tiktok|instagram&n=3
// One ScrapeCreators call per platform page. Returns permanent storage URLs.
import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { requireAdmin } from "@/lib/creators/admin";
import { SCRAPECREATORS_BASE, cleanHandle } from "@/lib/creators/scrape";
import { storeInFirebase } from "@/lib/creators/proven-media";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const urls = (v: unknown): string[] => arr(obj(v).url_list).filter((u): u is string => typeof u === "string" && u.startsWith("http"));

interface Top { id: string; views: number; video: string[]; cover: string[]; url: string }

function tiktokTop(raw: unknown, handle: string): Top[] {
  const items = arr(obj(raw).aweme_list ?? obj(obj(raw).data).aweme_list);
  return items.map((a) => {
    const x = obj(a);
    const v = obj(x.video);
    return {
      id: String(x.aweme_id ?? ""),
      views: Number(obj(x.statistics).play_count ?? 0),
      video: [...urls(v.play_addr), ...urls(v.download_addr)],
      cover: [...urls(v.origin_cover), ...urls(v.cover)],
      url: `https://www.tiktok.com/@${handle}/video/${String(x.aweme_id ?? "")}`,
    };
  });
}

function instagramTop(raw: unknown): Top[] {
  const items = arr(obj(raw).items ?? obj(obj(raw).data).items);
  return items.map((it) => {
    const m = obj(obj(it).media ?? it);
    const vids = arr(m.video_versions).map((x) => String(obj(x).url ?? "")).filter((u) => u.startsWith("http"));
    const covers = arr(obj(m.image_versions2).candidates).map((x) => String(obj(x).url ?? "")).filter((u) => u.startsWith("http"));
    const code = String(m.code ?? m.shortcode ?? "");
    return { id: code || String(m.pk ?? ""), views: Number(m.play_count ?? m.ig_play_count ?? m.view_count ?? 0), video: vids, cover: covers, url: `https://www.instagram.com/reel/${code}/` };
  });
}

async function firstOk(list: string[], maxBytes: number): Promise<{ buf: Buffer; type: string } | null> {
  for (const u of list) {
    try {
      const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0", referer: "https://www.tiktok.com/" } });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000 || buf.length > maxBytes) continue;
      return { buf, type: r.headers.get("content-type") || "application/octet-stream" };
    } catch {}
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (!requireCronSecret(req)) {
    const denied = await requireAdmin(req);
    if (denied) return denied;
  }
  const q = req.nextUrl.searchParams;
  const handle = cleanHandle(q.get("handle") || "");
  const platform = q.get("platform") === "instagram" ? "instagram" : "tiktok";
  const n = Math.min(Math.max(Number(q.get("n")) || 3, 1), 6);
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!handle || !apiKey) return NextResponse.json({ error: "handle and SCRAPECREATORS_API_KEY needed" }, { status: 400 });
  const url =
    platform === "tiktok"
      ? `${SCRAPECREATORS_BASE}/v3/tiktok/profile/videos?${new URLSearchParams({ handle, sort_by: "popular" })}`
      : `${SCRAPECREATORS_BASE}/v1/instagram/user/reels?${new URLSearchParams({ handle })}`;
  const res = await fetch(url, { headers: { "x-api-key": apiKey }, cache: "no-store" });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: `ScrapeCreators ${res.status}`, body: JSON.stringify(raw).slice(0, 300) }, { status: 502 });
  const all = (platform === "tiktok" ? tiktokTop(raw, handle) : instagramTop(raw)).filter((t) => t.id && t.video.length);
  const top = all.sort((a, b) => b.views - a.views).slice(0, n);
  const out: Json[] = [];
  for (const t of top) {
    const video = await firstOk(t.video, 60 * 1024 * 1024);
    const cover = await firstOk(t.cover, 8 * 1024 * 1024);
    const base = `showcase/${handle}/${t.id}`;
    out.push({
      id: t.id,
      views: t.views,
      source: t.url,
      video: video ? await storeInFirebase(`${base}.mp4`, video.buf, "video/mp4") : null,
      cover: cover ? await storeInFirebase(`${base}.jpg`, cover.buf, "image/jpeg") : null,
    });
  }
  return NextResponse.json({ ok: true, handle, platform, found: all.length, top: out });
}
