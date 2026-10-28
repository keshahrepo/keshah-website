/**
 * Research notes on an outreach creator, written when they reply, so the
 * founder can decide whether to send the calendar and has things to bring up
 * on the call. Their TikTok profile, recent videos and one transcript
 * (ScrapeCreators, about 3 credits) go to Claude, which saves:
 *   fit       "Strong" | "Good" | "Unsure"
 *   summary   one or two sentences on who they are
 *   mention   specific videos / facts to bring up (shows you did your research)
 *   watch     watch-outs
 *   ask       questions for the call
 * Stored on the careers_applications doc as research_notes.
 */
import Anthropic from "@anthropic-ai/sdk";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { SCRAPECREATORS_BASE, cleanHandle, fetchTranscript } from "@/lib/creators/scrape";
import { BEATS_MODEL } from "@/lib/creators/proven-beats";
import { OUTREACH_SOURCE } from "./outreach";

export const FITS = ["Strong", "Good", "Unsure"] as const;
export type Fit = (typeof FITS)[number];

export interface ResearchNotes {
  fit: Fit;
  summary: string;
  mention: string[];
  watch: string[];
  ask: string[];
}

export interface CreatorVideo {
  desc: string;
  plays: number;
  days_ago: number;
  url: string;
}

export interface CreatorResearch {
  handle: string;
  nickname: string;
  bio: string;
  followers: number | null;
  likes: number | null;
  video_count: number | null;
  videos: CreatorVideo[];
  transcript: { desc: string; plays: number; text: string } | null;
}

/** Stages that get notes: anyone who replied and isn't decided yet. */
const NOTE_STATUSES = ["replied", "invited", "booked"];

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Profile + videos responses → the bits the notes need. */
export function parseResearch(handle: string, profile: unknown, videos: unknown, now = Date.now()): CreatorResearch {
  const p = (profile ?? {}) as Record<string, any>;
  const user = p.user ?? {};
  const stats = p.stats ?? p.statsV2 ?? {};
  const list: any[] = Array.isArray((videos as any)?.aweme_list) ? (videos as any).aweme_list : [];
  return {
    handle,
    nickname: str(user.nickname),
    bio: str(user.signature).replace(/\s+/g, " ").slice(0, 300),
    followers: num(Number(stats.followerCount)),
    likes: num(Number(stats.heartCount)),
    video_count: num(Number(stats.videoCount)),
    videos: list.slice(0, 30).map((a) => ({
      desc: str(a?.desc).replace(/\s+/g, " ").slice(0, 160),
      plays: num(a?.statistics?.play_count) ?? 0,
      days_ago: Math.max(0, Math.floor((now - (num(a?.create_time) ?? 0) * 1000) / 86_400_000)),
      url: `https://www.tiktok.com/@${handle}/video/${str(a?.aweme_id)}`,
    })),
    transcript: null,
  };
}

/** The video worth a transcript: their best of the last 30 days, else their best overall. */
export function transcriptPick(r: CreatorResearch): CreatorVideo | null {
  const recent = r.videos.filter((v) => v.days_ago <= 30);
  const pool = recent.length ? recent : r.videos;
  return pool.reduce<CreatorVideo | null>((best, v) => (!best || v.plays > best.plays ? v : best), null);
}

/** What Claude reads. */
export function researchPrompt(name: string, ourLine: string, reply: string, r: CreatorResearch): string {
  const top = [...r.videos].sort((a, b) => b.plays - a.plays).slice(0, 5);
  const recent = r.videos.slice(0, 12);
  const line = (v: CreatorVideo) => `- ${v.plays.toLocaleString("en-US")} plays, ${v.days_ago}d ago: ${v.desc || "(no caption)"}`;
  return [
    `Creator: ${name} (@${r.handle}${r.nickname ? `, shown as "${r.nickname}"` : ""})`,
    `Followers: ${r.followers ?? "?"}. Likes: ${r.likes ?? "?"}. Videos: ${r.video_count ?? "?"}.`,
    `Bio: ${r.bio || "(none)"}`,
    ourLine ? `Our outreach email said: ${ourLine}` : "",
    reply ? `Their reply: ${reply}` : "",
    `Top videos:\n${top.map(line).join("\n")}`,
    `Most recent videos:\n${recent.map(line).join("\n")}`,
    r.transcript?.text ? `Transcript of "${r.transcript.desc.slice(0, 80)}" (${r.transcript.plays.toLocaleString("en-US")} plays):\n${r.transcript.text.slice(0, 2500)}` : "No transcript (their recent best video has no speech).",
  ].filter(Boolean).join("\n\n");
}

const SYSTEM = `You help the founder of KESHAH (a scalp massage app for hair loss) hire TikTok creators. KESHAH pays creators to film short scripted talking-to-camera videos (3 a weekday) on new TikTok and Instagram accounts. A creator who replied to our outreach email is about to get a call. Write the founder's research notes from their profile.

fit: "Strong" if they talk straight to camera, post consistently, and have videos with real views; "Good" if two of those; "Unsure" if they mostly don't talk to camera, rarely post, or something is off.
summary: one or two sentences: follower and like counts, what their videos are about, how they come across on camera.
mention: 2 or 3 specific things the founder can bring up so it is clear the founder watched their videos: name the exact video (what it's about) and its views when big, or a fact from their videos.
watch: 0 to 2 honest watch-outs (low recent views, swearing, little talking to camera, hasn't booked, etc).
ask: 1 or 2 short questions for the call that fit this creator.

Rules: plain spoken words, short lines, no em dashes, never use he/she/his/her/him for the creator (use their name or "they"/rephrase), don't invent anything not in the data. Answer only by calling save_notes.`;

const TOOL = {
  name: "save_notes",
  description: "Save the research notes.",
  input_schema: {
    type: "object" as const,
    properties: {
      fit: { type: "string", enum: [...FITS] },
      summary: { type: "string" },
      mention: { type: "array", items: { type: "string" } },
      watch: { type: "array", items: { type: "string" } },
      ask: { type: "array", items: { type: "string" } },
    },
    required: ["fit", "summary", "mention", "watch", "ask"],
  },
};

/** Claude's answer → clean notes (null when unusable). */
export function cleanNotes(raw: unknown): ResearchNotes | null {
  const x = (raw ?? {}) as Record<string, unknown>;
  const fit = FITS.find((f) => f.toLowerCase() === str(x.fit).toLowerCase());
  const tidy = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map((s) => tidy(str(s))).filter(Boolean).slice(0, max) : []);
  const summary = tidy(str(x.summary));
  if (!fit || !summary) return null;
  return { fit, summary, mention: list(x.mention, 3), watch: list(x.watch, 2), ask: list(x.ask, 2) };
}

async function scrape(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${SCRAPECREATORS_BASE}${path}`, { headers: { "x-api-key": apiKey }, cache: "no-store" });
  if (!res.ok) throw new Error(`ScrapeCreators ${res.status}`);
  return res.json();
}

/** Pulls their TikTok (about 3 credits). */
export async function researchCreator(handleRaw: string, apiKey: string): Promise<CreatorResearch> {
  const handle = cleanHandle(handleRaw);
  const q = `handle=${encodeURIComponent(handle)}`;
  const [profile, videos] = await Promise.all([scrape(`/v1/tiktok/profile?${q}`, apiKey), scrape(`/v3/tiktok/profile/videos?${q}`, apiKey)]);
  const r = parseResearch(handle, profile, videos);
  const pick = transcriptPick(r);
  if (pick) {
    try {
      const t = await fetchTranscript("tiktok", pick.url, { apiKey });
      if (t.text) r.transcript = { desc: pick.desc, plays: pick.plays, text: t.text };
    } catch {
      // No transcript is fine.
    }
  }
  return r;
}

export async function writeNotes(prompt: string, apiKey = process.env.ANTHROPIC_API_KEY ?? ""): Promise<ResearchNotes | null> {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: BEATS_MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: `${prompt}\n\nAnswer by calling save_notes.` }],
  });
  const call = r.content.find((b) => b.type === "tool_use");
  return call && call.type === "tool_use" ? cleanNotes(call.input) : null;
}

/**
 * Writes notes for outreach creators who replied and have none yet (a few per
 * run, so the 15-minute cron stays short). A failure is saved as
 * research_notes_error so it isn't retried every run.
 */
export async function writeMissingNotes(opts: { limit?: number; deadlineMs?: number; store?: Firestore } = {}): Promise<{ written: string[]; failed: string[] }> {
  const db = opts.store ?? getFirebaseAdmin().db;
  const apiKey = process.env.SCRAPECREATORS_API_KEY ?? "";
  const written: string[] = [];
  const failed: string[] = [];
  if (!apiKey || !process.env.ANTHROPIC_API_KEY) return { written, failed };
  const snap = await db.collection("careers_applications").where("status", "in", NOTE_STATUSES).get();
  const todo = snap.docs.filter((d) => d.get("source") === OUTREACH_SOURCE && !d.get("research_notes") && !d.get("research_notes_error") && str(d.get("social_handle")));
  for (const d of todo.slice(0, opts.limit ?? 3)) {
    if (opts.deadlineMs && Date.now() > opts.deadlineMs) break;
    const name = str(d.get("full_name")) || str(d.get("social_handle"));
    try {
      const r = await researchCreator(str(d.get("social_handle")), apiKey);
      const notes = await writeNotes(researchPrompt(name, str(d.get("outreach_video_line")), str(d.get("reply_snippet")), r));
      if (!notes) throw new Error("no usable notes");
      await d.ref.set(
        { research_notes: { ...notes, written_at: new Date().toISOString() }, ...(r.followers != null && d.get("followers") == null ? { followers: r.followers } : {}), last_updated_at: FieldValue.serverTimestamp() },
        { merge: true },
      );
      written.push(name);
    } catch (e) {
      await d.ref.set({ research_notes_error: e instanceof Error ? e.message : String(e) }, { merge: true });
      failed.push(name);
    }
  }
  return { written, failed };
}
