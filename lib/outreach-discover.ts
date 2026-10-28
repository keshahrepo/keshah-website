/**
 * The daily creator search that keeps outreach_queue full (sent from 11 AM ET
 * by outreach-db.ts sendQueuedOutreach). No founder review: the checks below
 * stand in for it. Runs in small steps from cron (app/api/cron/outreach-discover),
 * each step bounded so a run fits in a few minutes:
 *
 *   keywords  Settings/outreach_keywords { todo[], used[] }: Claude writes fresh
 *             ones when todo runs out, never repeating a used one
 *   search    TikTok keyword search (2 pages), US, 100 to 30,000 followers;
 *             new handles become outreach_candidates/{handle} status "found"
 *   check     their last ~30 videos: 4+ posts in 14 days, 60%+ with their own
 *             speech, median 500+ views, 2 or fewer sponsored, email in bio
 *             -> "fit" (else "no", with why)
 *   look      Claude looks at 3 talking-video covers: a real person talking to
 *             camera, not faceless / slideshow / product / brand -> "looked" or "no"
 *   line      their best recent talking video + transcript -> the personal line
 *             (sensitive topics or nothing clear -> "no") -> outreach_queue, "queued"
 *
 * Does nothing while the queue already holds a day and a half of emails.
 * Pure helpers here are tested in outreach-discover.test.ts.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { SCRAPECREATORS_BASE, fetchTranscript } from "@/lib/creators/scrape";
import { BEATS_MODEL } from "@/lib/creators/proven-beats";
import { QUEUE, QUEUE_DEFAULT_CAP } from "./outreach-db";

export const CANDIDATES = "outreach_candidates";
export const MIN_FOLLOWERS = 100;
export const MAX_FOLLOWERS = 30_000;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

// ---------------------------------------------------------------- pure

export interface CheckResult {
  ok: boolean;
  why: string;
  email: string;
  name: string;
  bio: string;
  followers: number;
  covers: string[];
}

/** The data check on a profile-videos response (the same rules as the hand-run batches). */
export function checkCreator(raw: unknown, nowMs = Date.now()): CheckResult {
  const list: any[] = Array.isArray((raw as any)?.aweme_list) ? (raw as any).aweme_list : [];
  const au = list[0]?.author ?? {};
  const bio = str(au.signature);
  const email = (bio.match(EMAIL_RE) ?? [""])[0];
  const videos = list.filter((a) => !a?.image_post_info);
  const speech = videos.filter((a) => a?.video?.cla_info?.caption_infos && a?.video?.cla_info?.has_original_audio === 1);
  const recent14 = list.filter((a) => nowMs / 1000 - num(a?.create_time) < 14 * 86400);
  const older = list.filter((a) => nowMs / 1000 - num(a?.create_time) > 86400).map((a) => num(a?.statistics?.play_count));
  const plays = (older.length ? older : list.map((a) => num(a?.statistics?.play_count))).sort((x, y) => x - y);
  const median = plays.length ? plays[Math.floor(plays.length / 2)] : 0;
  const branded = list.filter((a) => a?.commerce_info?.branded_content_type).length;
  const why = [
    !list.length && "no videos",
    list.length && recent14.length < 4 && "infrequent",
    list.length && speech.length < Math.max(5, Math.floor(0.6 * list.length)) && "not talking",
    list.length && median < 500 && "low views",
    branded > 2 && "lots of ads",
    !email && "no email",
  ].filter(Boolean) as string[];
  // TikTok lists each cover as HEIC first; the JPEG copy is the one Claude can read.
  const jpeg = (urls: unknown): string => {
    const list = Array.isArray(urls) ? urls.map(str) : [];
    return list.find((u) => /\.jpe?g(\?|$)/i.test(u)) ?? "";
  };
  const covers = speech.slice(0, 3).map((a) => jpeg(a?.video?.cover?.url_list) || jpeg(a?.video?.origin_cover?.url_list)).filter(Boolean);
  return { ok: why.length === 0, why: why.join(","), email: email.toLowerCase(), name: str(au.nickname), bio: bio.slice(0, 300), followers: num(au.follower_count), covers };
}

/** New handles from a keyword search response that fit the follower range (US only). */
export function searchHits(raw: unknown): { handle: string; followers: number; name: string }[] {
  const items: any[] = Array.isArray((raw as any)?.search_item_list) ? (raw as any).search_item_list : [];
  const out = new Map<string, { handle: string; followers: number; name: string }>();
  for (const it of items) {
    const a = it?.aweme_info ?? {};
    const au = a.author ?? {};
    const handle = str(au.unique_id).toLowerCase();
    const f = num(au.follower_count);
    if (!handle || a.region !== "US" || f < MIN_FOLLOWERS || f > MAX_FOLLOWERS) continue;
    out.set(handle, { handle, followers: f, name: str(au.nickname) });
  }
  return [...out.values()];
}

export const SKILLS: Record<string, string> = {
  explain: "explaining things simply",
  story: "telling a story",
  hook: "hooking people in the first few seconds",
  point: "getting your point across fast",
};

/** The personal line from Claude's parts (null when unusable). */
export function personalLine(parts: { video?: unknown; skill?: unknown; first_name?: unknown; ok?: unknown }): { greet: string; line: string; first_name: string } | null {
  const video = str(parts.video).replace(/\s*[—–]\s*/g, ", ").replace(/#\w+/g, "").replace(/\s+/g, " ").trim().replace(/^(your|my|the)\s+/i, "").replace(/[.!]+$/, "");
  const skill = SKILLS[str(parts.skill)];
  if (parts.ok !== true || !video || !skill || video.length > 70) return null;
  const first = str(parts.first_name).trim().split(/\s+/)[0] ?? "";
  const clean = /^[A-Za-z][A-Za-z'-]{1,20}$/.test(first) ? first : "";
  return { first_name: clean, greet: clean ? `Hey ${clean},` : "Hey,", line: `I came across your ${video} on TikTok, and you're really good at ${skill}. That's exactly what we look for.` };
}

// ---------------------------------------------------------------- io

async function sc(path: string, apiKey: string): Promise<any> {
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(`${SCRAPECREATORS_BASE}${path}`, { headers: { "x-api-key": apiKey }, cache: "no-store" });
      if (res.ok) return await res.json();
    } catch {
      // retry once
    }
  }
  return {};
}

const claude = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

async function toolCall(system: string, content: Anthropic.MessageParam["content"], tool: Anthropic.Tool, maxTokens = 500): Promise<Record<string, unknown> | null> {
  const r = await claude().messages.create({ model: BEATS_MODEL, max_tokens: maxTokens, system, tools: [tool], tool_choice: { type: "auto" }, messages: [{ role: "user", content }] });
  const call = r.content.find((b) => b.type === "tool_use");
  return call && call.type === "tool_use" ? (call.input as Record<string, unknown>) : null;
}

const KEYWORD_SYSTEM = `You help find TikTok creators to hire for short talking-to-camera videos for a hair care app. Write TikTok search keywords that surface US creators, mostly students and young professionals, who talk straight to camera: explainers, tutorials, storytimes, advice, opinions, rankings, career and school content, day-in-the-life with talking. 2 to 4 words each, the way people search TikTok. Never repeat or closely rephrase a keyword from the used list. Answer only by calling save_keywords.`;

async function moreKeywords(used: string[]): Promise<string[]> {
  const r = await toolCall(
    KEYWORD_SYSTEM,
    `Used already (${used.length}): ${used.slice(-400).join(", ")}\n\nWrite 40 new keywords. Answer by calling save_keywords.`,
    { name: "save_keywords", description: "Save the keywords.", input_schema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" } } }, required: ["keywords"] } },
    1500,
  );
  const seen = new Set(used.map((k) => k.toLowerCase().trim()));
  return (Array.isArray(r?.keywords) ? r!.keywords : [])
    .map((k) => str(k).toLowerCase().replace(/[^a-z0-9 '&-]/g, "").trim())
    .filter((k) => k && k.split(" ").length <= 5 && !seen.has(k) && (seen.add(k), true));
}

const LOOK_SYSTEM = `You check if a TikTok creator could film short videos of themselves talking to camera for a brand. You see covers of 3 of their videos. Answer ok=true only if a real person's face is clearly on camera, talking or presenting, in most of them. ok=false for faceless accounts, sports or game clips, slideshows, text-only covers, products or food without a person, brand or business accounts, or anyone who looks under 18. Answer only by calling save_look.`;

async function lookOk(covers: string[]): Promise<{ ok: boolean; why: string }> {
  if (!covers.length) return { ok: false, why: "no covers" };
  // Downloaded here (TikTok's cover links are signed and short-lived), sent as image data.
  const images = (
    await Promise.all(
      covers.slice(0, 3).map(async (url) => {
        try {
          const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
          const type = (res.headers.get("content-type") ?? "").split(";")[0];
          if (!res.ok || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) return null;
          return { type: "image" as const, source: { type: "base64" as const, media_type: type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: Buffer.from(await res.arrayBuffer()).toString("base64") } };
        } catch {
          return null;
        }
      }),
    )
  ).filter((x): x is NonNullable<typeof x> => !!x);
  if (!images.length) return { ok: false, why: "covers wouldn't load" };
  const content: Anthropic.ContentBlockParam[] = [...images, { type: "text", text: "Answer by calling save_look." }];
  try {
    const r = await toolCall(LOOK_SYSTEM, content, { name: "save_look", description: "Save the check.", input_schema: { type: "object", properties: { ok: { type: "boolean" }, why: { type: "string" } }, required: ["ok", "why"] } }, 300);
    return { ok: r?.ok === true, why: str(r?.why).slice(0, 120) };
  } catch (e) {
    return { ok: false, why: `look failed: ${e instanceof Error ? e.message.slice(0, 80) : "error"}` };
  }
}

const LINE_SYSTEM = `You write one line of a cold outreach email from the founder of KESHAH to a TikTok creator:
"I came across your {video} on TikTok, and you're really good at {skill}. That's exactly what we look for."
From the video's caption and transcript, return:
- video: a short natural phrase naming THIS video, 2 to 7 words, ending in "video", "tutorial", "storytime" or similar (e.g. "GoodNotes tutorial", "video ranking college majors"). Plain words, lowercase except proper nouns, no hashtags, no quotes, no em dashes. Only things actually in the caption or transcript.
- skill: explain | story | hook | point (explain = tutorials and explainers, story = storytimes, hook = rankings, hot takes, strong openers, point = advice or opinions said fast).
- first_name: the creator's first name only if clearly stated in the nickname, bio or transcript, else "".
- ok: false if the video is about something sensitive or personal to bring up (grief, health conditions, bodies, sex, dating counts, money troubles, religion, politics), if it's a product or brand video, or if the transcript doesn't support a clear phrase; true otherwise.
Answer only by calling save_line.`;

async function writeLine(prompt: string): Promise<ReturnType<typeof personalLine>> {
  const r = await toolCall(LINE_SYSTEM, `${prompt}\n\nAnswer by calling save_line.`, {
    name: "save_line",
    description: "Save the line parts.",
    input_schema: { type: "object", properties: { video: { type: "string" }, skill: { type: "string", enum: Object.keys(SKILLS) }, first_name: { type: "string" }, ok: { type: "boolean" } }, required: ["video", "skill", "first_name", "ok"] },
  });
  return r ? personalLine(r) : null;
}

// ---------------------------------------------------------------- the step

export interface DiscoverResult {
  backlog: number;
  target: number;
  keywords?: number;
  searched?: string[];
  found?: number;
  checked?: number;
  fits?: number;
  looked?: number;
  queued?: string[];
  off?: string;
}

/**
 * One bounded step: top up keywords, search a few, check a batch, look at the
 * fits, write lines and queue. Stops early once the queue is full or the
 * deadline passes.
 */
export async function discoverStep(opts: { deadlineMs: number; store?: Firestore; now?: number } = { deadlineMs: Date.now() + 200_000 }): Promise<DiscoverResult> {
  const db = opts.store ?? getFirebaseAdmin().db;
  const apiKey = process.env.SCRAPECREATORS_API_KEY ?? "";
  const daily = (await db.collection("Settings").doc("outreach_daily").get()).data() ?? {};
  const cap = typeof daily.cap === "number" ? daily.cap : QUEUE_DEFAULT_CAP;
  const target = Math.ceil(cap * 1.5);
  const backlog = (await db.collection(QUEUE).where("status", "==", "queued").get()).size;
  const out: DiscoverResult = { backlog, target };
  if (daily.paused === true) return { ...out, off: "paused" };
  if (!apiKey || !process.env.ANTHROPIC_API_KEY) return { ...out, off: "keys missing" };
  if (backlog >= target) return { ...out, off: "queue full" };
  const left = () => opts.deadlineMs - Date.now();
  const cands = db.collection(CANDIDATES);

  // 1. Line + queue for looked-at creators (closest to sending first).
  const queued: string[] = [];
  const looked = (await cands.where("status", "==", "looked").limit(12).get()).docs;
  for (const d of looked) {
    if (left() < 25_000 || backlog + queued.length >= target) break;
    const h = d.id;
    const raw = await sc(`/v3/tiktok/profile/videos?handle=${encodeURIComponent(h)}`, apiKey);
    const list: any[] = raw?.aweme_list ?? [];
    const nowS = (opts.now ?? Date.now()) / 1000;
    const talk = list.filter((a) => !a?.image_post_info && a?.video?.cla_info?.caption_infos);
    const pool = talk.filter((a) => nowS - num(a?.create_time) < 60 * 86400);
    const a = (pool.length ? pool : talk).sort((x, y) => num(y?.statistics?.play_count) - num(x?.statistics?.play_count))[0];
    if (!a) {
      await d.ref.set({ status: "no", why: "no talking video" }, { merge: true });
      continue;
    }
    const url = `https://www.tiktok.com/@${h}/video/${str(a.aweme_id)}`;
    let transcript = "";
    try {
      transcript = (await fetchTranscript("tiktok", url, { apiKey })).text;
    } catch {
      // no transcript: the caption alone may still do
    }
    const x = d.data();
    let line: ReturnType<typeof personalLine> = null;
    try {
      line = await writeLine(`Nickname: ${str(x.name)}\nBio: ${str(x.bio)}\nCaption: ${str(a.desc).slice(0, 300)}\nViews: ${num(a?.statistics?.play_count)}\nTranscript: ${transcript.slice(0, 2500) || "(none)"}`);
    } catch {
      line = null;
    }
    if (!line) {
      await d.ref.set({ status: "no", why: "no safe line" }, { merge: true });
      continue;
    }
    const email = str(x.email);
    const already = !(await db.collection("careers_applications").where("email", "==", email).limit(1).get()).empty || !(await db.collection(QUEUE).where("email", "==", email).limit(1).get()).empty;
    if (already) {
      await d.ref.set({ status: "no", why: "already contacted" }, { merge: true });
      continue;
    }
    await db.collection(QUEUE).add({ email, full_name: line.first_name || `@${h}`, greet: line.greet, line: line.line, social_handle: `@${h}`, followers: num(x.followers) || null, status: "queued", queued_at: new Date().toISOString(), batch: "daily", video_url: url });
    await d.ref.set({ status: "queued", queued_at: new Date().toISOString() }, { merge: true });
    queued.push(`@${h}`);
  }
  out.queued = queued;

  // 2. Look at fits (vision check).
  let lookedN = 0;
  const fits = (await cands.where("status", "==", "fit").limit(15).get()).docs;
  for (const d of fits) {
    if (left() < 40_000) break;
    const r = await lookOk((d.get("covers") as string[]) ?? []);
    await d.ref.set(r.ok ? { status: "looked" } : { status: "no", why: `look: ${r.why}` }, { merge: true });
    lookedN++;
  }
  out.looked = lookedN;

  // 3. Data check on found handles (6 at a time).
  let checked = 0;
  let fitN = 0;
  const found = (await cands.where("status", "==", "found").limit(36).get()).docs;
  for (let i = 0; i < found.length && left() > 60_000; i += 6) {
    const chunk = found.slice(i, i + 6);
    const rs = await Promise.all(chunk.map((d) => sc(`/v3/tiktok/profile/videos?handle=${encodeURIComponent(d.id)}`, apiKey).then((raw) => checkCreator(raw, opts.now))));
    await Promise.all(
      chunk.map((d, k) => {
        const r = rs[k];
        checked++;
        if (r.ok) fitN++;
        return d.ref.set(r.ok ? { status: "fit", email: r.email, name: r.name, bio: r.bio, followers: r.followers || d.get("followers"), covers: r.covers, checked_at: new Date().toISOString() } : { status: "no", why: r.why, checked_at: new Date().toISOString() }, { merge: true });
      }),
    );
  }
  out.checked = checked;
  out.fits = fitN;

  // 4. Search more keywords when few are waiting to be checked.
  const waiting = (await cands.where("status", "in", ["found", "fit", "looked"]).count().get()).data().count;
  if (waiting < 60 && left() > 70_000) {
    const kwRef = db.collection("Settings").doc("outreach_keywords");
    const kw = (await kwRef.get()).data() ?? {};
    let todo: string[] = Array.isArray(kw.todo) ? kw.todo : [];
    const used: string[] = Array.isArray(kw.used) ? kw.used : [];
    if (todo.length < 6) {
      try {
        todo = [...todo, ...(await moreKeywords([...used, ...todo]))];
      } catch {
        // try again next run
      }
      out.keywords = todo.length;
    }
    const take = todo.slice(0, 6);
    let foundN = 0;
    for (const q of take) {
      if (left() < 40_000) break;
      let cursor: string | undefined;
      for (let page = 0; page < 2; page++) {
        const raw = await sc(`/v1/tiktok/search/keyword?${new URLSearchParams({ query: q, region: "US", ...(cursor ? { cursor } : {}) })}`, apiKey);
        for (const hit of searchHits(raw)) {
          const ref = cands.doc(hit.handle);
          const created = await db.runTransaction(async (tx) => {
            if ((await tx.get(ref)).exists) return false;
            tx.set(ref, { status: "found", followers: hit.followers, name: hit.name, keyword: q, found_at: new Date().toISOString() });
            return true;
          });
          if (created) foundN++;
        }
        cursor = raw?.cursor ? String(raw.cursor) : undefined;
        if (!raw?.has_more) break;
      }
      used.push(q);
      todo = todo.filter((k) => k !== q);
    }
    await kwRef.set({ todo, used }, { merge: true });
    out.searched = take;
    out.found = foundN;
  }
  return out;
}
