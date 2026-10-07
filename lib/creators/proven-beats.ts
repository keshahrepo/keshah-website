/**
 * Talking points ("beats") for proven videos, so creators make the points in
 * their own words instead of reading someone else's transcript out loud.
 *
 * The creators app shows, per proven video:
 *   1. the hook (hook_line), said word for word,
 *   2. these 3-4 beats, made in the creator's own words,
 *   3. a pinned-video ending (cta_line when the original ended with one,
 *      otherwise a line from the app's own library),
 *   4. the original transcript, collapsed.
 *
 * Generated from the transcript with Claude and stored on the doc:
 *
 *   ProvenVideos/{id}.talking_points        string[] (3-4)
 *   ProvenVideos/{id}.talking_points_source "auto" (generated) | "admin" (edited, never overwritten)
 *   ProvenVideos/{id}.cta_line              cleaned-up pinned-video ending of the original, or ""
 *   ProvenVideos/{id}.short_title           2-4 word name for the app's list row ("Pinch test")
 *   ProvenVideos/{id}.beats                 { generated_at, model } or failures { attempts, last_error, last_attempt_at }
 *
 * Runs on approve (route `after()`), from the daily cron (capped) and from the
 * admin backfill route. Talking points are only written where there are none,
 * so a founder edit is never replaced; a missing short_title is filled on its own.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { PROVEN_COLLECTION, formatGroups, type ProvenVideo } from "./proven";

export const BEATS_MODEL = "claude-sonnet-5-5";
/** Most videos the daily cron fills per run. */
export const BEATS_CRON_CAP = 40;
/** Most videos one backfill call fills (re-run for the rest). */
export const BEATS_BACKFILL_CAP = 200;
/** A video stops being retried after this many failed attempts. */
export const BEATS_MAX_ATTEMPTS = 3;
/** Failures from before the forced tool call don't count against a video. */
const LEGACY_ERRORS = ["no JSON in model output", "400 "];
const isLegacy = (e?: string) => !!e && LEGACY_ERRORS.some((x) => e.startsWith(x));
export const BEATS_CONCURRENCY = 6;
/** Shorter transcripts (music-only, "watch until the end") have nothing to make points from. */
export const BEATS_MIN_TRANSCRIPT = 80;

export interface ProvenBeatsMeta {
  generated_at?: string;
  model?: string;
  attempts?: number;
  last_error?: string;
  last_attempt_at?: string;
}

type BeatsFields = Pick<ProvenVideo, "status" | "added_by" | "transcript" | "talking_points" | "short_title"> & {
  talking_points_source?: string;
  hook_full?: string;
  hook_first_person?: boolean;
  beats?: ProvenBeatsMeta;
};

/** Does this video still need beats (and is it worth trying again)? */
export function needsBeats(v: BeatsFields): boolean {
  if (v.status !== "active" || v.added_by === "founder_idea") return false;
  if ((v.transcript ?? "").trim().length < BEATS_MIN_TRANSCRIPT) return false;
  if (v.talking_points?.length && v.short_title && v.hook_full && typeof v.hook_first_person === "boolean") return false;
  if (isLegacy(v.beats?.last_error)) return true;
  return (v.beats?.attempts ?? 0) < BEATS_MAX_ATTEMPTS;
}

export const BEATS_SYSTEM = `You write speaking notes for short hair loss videos. A creator will film their own version of a video that did well. They say the hook word for word, then make a few points in their own words, then point viewers to the pinned video on their profile.

Return one JSON object, no prose, no code fence:
{"hook": "...", "hook_first_person": false, "title": "...", "beats": ["...", "...", "..."], "cta": "..."}

"hook": the full hook, copied word for word from the start of the transcript. Keep going until the hook's thought is complete and the viewer wants to keep watching, usually 1 to 3 sentences (the first 5 to 12 seconds). Never stop after a fragment like "All right." or "If you're losing hair." if the next sentence finishes the thought. You may drop filler ("uh", "um", a word said twice) and fix punctuation, nothing else. Under 45 words.

"hook_first_person": true if the hook makes a claim about the speaker's own hair, results or story ("I fixed my own hair loss", "I stopped my hair fall", "Four years ago I was losing my hair", "my hair used to look like this"). False for neutral first person like "let me show you", "I'll tell you", "do this test with me".

"title": a 2 to 4 word name for the video, shown in a list next to its cover. Names the angle, not the claim. Examples: "Pinch test", "Minoxidil truth", "Crown vs sides", "Massage mistake", "Neck tension", "Tight scalp check". Sentence case, no punctuation, no first person, never "routine".

"beats": 3 or 4 points that come after the hook.
- Follow this chain, in this order, using the parts the original covers: the scalp on top is tight (often tighter than the sides); a tight scalp squeezes the blood vessels; so blood can't reach the hair well; so the hair gets weak and falls out; the fix is daily scalp exercises that loosen the scalp. The last beat is always the fix.
- Keep the original's angle where it fits (a pinch test, minoxidil stopping working, crown versus sides, and so on).
- Plain general information. Never first person: no I, me, my, we, our, us. Never a story about anyone: no friend, cousin, barber, client, "a guy I follow", "people I know". If the original relies on a personal story or a result ("this worked for me", "my friend regrew his hair"), turn it into a general, hedged statement.
- Hedge every claim: "usually", "for most people", "often", "can". Never promise regrowth, a cure or a timeline.
- Words a 5-year-old knows. One full spoken sentence each, under 18 words. No slogans, no fragments, no labels.
- No em dashes or en dashes. No emojis, no hashtags, no quotes.
- Never use the word "routine". Say "scalp exercises".
- No product, brand or app names (not KESHAH either), no links, no "comment", no "follow", no "link in bio".
- Don't repeat the hook.

Example beats in the right style:
- For most people losing hair, the scalp on top is tighter than the sides.
- A tight scalp squeezes the blood vessels, so blood can't reach the hair.
- Without enough blood, the hair usually gets thinner and falls out.
- Scalp exercises every day can loosen it up.

"cta": only if the original ends by sending viewers to the pinned video on the profile. Then write that ending, cleaned up, as one or two short spoken sentences that point to the pinned video on the creator's profile. Confident and generous, never needy. Keep "how to find it" and "don't DM me saying you can't find it" style lines if the original has them. Drop any result claim ("it fixed my hair"), any link in bio, comment or follow request, any "you'll thank me later", and any em dash. If the original ends any other way, "cta" is "".`;

const DASHES = /\s*[—–]\s*/g;
const FIRST_PERSON = /\b(i|i'm|i've|i'd|i'll|me|my|mine|myself|we|we're|we've|our|ours|us)\b/i;
const STORY = /\b(friend|cousin|brother|sister|dad|father|uncle|barber|client|buddy|a guy|this guy|people i know)\b/i;
const BANNED = /\b(routine|keshah|link in (my )?bio|comment|follow)\b/i;
const CTA_BANNED = /\b(bio|comment|follow|thank (me|yourself) later|please)\b/i;
const RESULT_CLAIM = /\b(fixed|regrew|regrow|grew back|stopped|saved|worked for|cured|reversed)\b/i;

/** Em / en dashes to commas, spacing tidied, ends with punctuation. */
export function tidyLine(s: string): string {
  let t = String(s ?? "")
    .replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, "")
    .replace(DASHES, ", ")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/,+/g, ",")
    .trim();
  if (t && !/[.!?]$/.test(t)) t += ".";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Why a beat breaks the rules, or null when it's fine. */
export function beatProblem(beat: string): string | null {
  if (!beat) return "empty";
  if (beat.split(/\s+/).length > 24) return "too long";
  if (FIRST_PERSON.test(beat)) return "first person";
  if (STORY.test(beat)) return "story";
  if (BANNED.test(beat)) return "banned word";
  return null;
}

/** The pinned-video ending, or "" when it's missing or breaks the rules. */
export function cleanCta(raw: unknown): string {
  const t = tidyLine(String(raw ?? ""));
  if (!t || !/\bpinned\b/i.test(t)) return "";
  if (CTA_BANNED.test(t)) return "";
  if (RESULT_CLAIM.test(t) && /\b(i|my|me)\b/i.test(t)) return "";
  if (t.length > 240) return "";
  return t;
}

export interface ParsedBeats {
  /** "" when the model's hook didn't match the transcript start. */
  hook: string;
  hook_first_person: boolean;
  beats: string[];
  cta: string;
  /** "" when the model's title broke the rules (the app makes one from the hook). */
  title: string;
}

/** 2-4 words, sentence case, no punctuation; "" when it breaks the rules. */
export function cleanTitle(raw: unknown): string {
  const t = String(raw ?? "")
    .replace(DASHES, " ")
    .replace(/["“”.!?,:;]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = t.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 4 || t.length > 28) return "";
  if (FIRST_PERSON.test(t) || BANNED.test(t)) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((w) => w && !/^(uh|um)$/.test(w));

/** The full hook, or "" unless it really is the start of the transcript (word for word, filler aside). */
export function cleanHook(raw: unknown, transcript: string): string {
  const t = String(raw ?? "").replace(DASHES, ", ").replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  const hw = words(t);
  if (hw.length < 3 || hw.length > 60) return "";
  const tw = words(transcript).slice(0, hw.length + 20).join(" ");
  if (!tw.startsWith(hw.slice(0, 3).join(" "))) return "";
  const hit = hw.filter((w) => tw.includes(w)).length;
  if (hit / hw.length < 0.9) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Model output -> clean beats (3-4) + cta. Throws when fewer than 3 beats survive the rules. */
export function parseBeats(raw: string, transcript = ""): ParsedBeats {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON in model output");
  const j = JSON.parse(s.slice(start, end + 1)) as { beats?: unknown; cta?: unknown; title?: unknown; hook?: unknown; hook_first_person?: unknown };
  const list = Array.isArray(j.beats) ? j.beats.map((b) => tidyLine(String(b))) : [];
  const problems: string[] = [];
  const beats = list.filter((b) => {
    const p = beatProblem(b);
    if (p) problems.push(`${p}: ${b.slice(0, 60)}`);
    return !p;
  });
  if (beats.length < 3) throw new Error(`only ${beats.length} usable beats (${problems.join("; ").slice(0, 200)})`);
  return {
    hook: transcript ? cleanHook(j.hook, transcript) : "",
    hook_first_person: j.hook_first_person === true,
    beats: beats.slice(0, 4),
    cta: cleanCta(j.cta),
    title: cleanTitle(j.title),
  };
}

export type GenerateFn = (system: string, user: string) => Promise<string>;

const BEATS_TOOL = {
  name: "save_notes",
  description: "Save the speaking notes for this video.",
  input_schema: {
    type: "object" as const,
    properties: {
      hook: { type: "string" },
      hook_first_person: { type: "boolean" },
      title: { type: "string" },
      beats: { type: "array", items: { type: "string" } },
      cta: { type: "string" },
    },
    required: ["hook", "hook_first_person", "title", "beats", "cta"],
  },
};

/** Forced tool call, so the answer is always JSON (plain text answers sometimes came back without it). */
function anthropicGenerate(apiKey: string): GenerateFn {
  const client = new Anthropic({ apiKey });
  return async (system, user) => {
    const resp = await client.messages.create({
      model: BEATS_MODEL,
      max_tokens: 1200,
      system,
      tools: [BEATS_TOOL],
      // This model only allows "auto" here; the system prompt and the message ask for the tool call.
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: `${user}\n\nAnswer by calling ${BEATS_TOOL.name}.` }],
    });
    const call = resp.content.find((b) => b.type === "tool_use");
    if (call && call.type === "tool_use") return JSON.stringify(call.input);
    const block = resp.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : `(stop: ${resp.stop_reason})`;
  };
}

/** Beats for one video. Retries once when the output breaks the rules. No Firestore writes. */
export async function beatsFor(v: Pick<ProvenVideo, "hook_line" | "transcript">, generate: GenerateFn): Promise<ParsedBeats> {
  const user = `FIRST LINE OF THE HOOK (it may be cut short):\n${v.hook_line}\n\nORIGINAL TRANSCRIPT:\n${v.transcript.slice(0, 6000)}`;
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseBeats(await generate(BEATS_SYSTEM, attempt ? `${user}\n\nYour last answer broke a rule (${String(last).slice(0, 160)}). Follow every rule.` : user), v.transcript);
    } catch (e) {
      last = e instanceof Error ? e.message : e;
    }
  }
  throw new Error(String(last));
}

export interface BeatsRunResult {
  dry: boolean;
  /** Active videos still missing beats (before this run). */
  needing: number;
  attempted: number;
  generated: number;
  /** Of those, how many came with the original's own pinned-video ending. */
  with_cta: number;
  failed: { id: string; error: string }[];
  /** Still missing after this run (cap / deadline); run again for the rest. */
  remaining: number;
  ids?: string[];
}

/**
 * Generate beats for active videos that lack them, up to `limit`. `dry` only
 * counts. `ids` limits the run to those docs (e.g. the one just approved).
 */
export async function generateProvenBeats(opts: {
  db?: Firestore;
  limit?: number;
  dry?: boolean;
  ids?: string[];
  deadlineMs?: number;
  generate?: GenerateFn;
  now?: () => Date;
  log?: (m: string) => void;
} = {}): Promise<BeatsRunResult> {
  const db = opts.db ?? getFirebaseAdmin().db;
  const col = db.collection(PROVEN_COLLECTION);
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? ((m: string) => console.log(m));
  const limit = Math.max(0, opts.limit ?? BEATS_CRON_CAP);
  const docs = opts.ids?.length
    ? (await db.getAll(...opts.ids.map((id) => col.doc(id)))).filter((s) => s.exists)
    : (await col.where("status", "==", "active").get()).docs;
  const need = docs.map((s) => ({ id: s.id, d: s.data() as ProvenVideo & BeatsFields })).filter((x) => needsBeats(x.d));
  const out: BeatsRunResult = { dry: !!opts.dry, needing: need.length, attempted: 0, generated: 0, with_cta: 0, failed: [], remaining: need.length };
  const batch = need.slice(0, limit);
  if (opts.dry) return { ...out, ids: batch.map((x) => x.id) };

  let generate = opts.generate;
  if (!generate) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    generate = anthropicGenerate(apiKey);
  }

  const queue = [...batch];
  await Promise.all(
    Array.from({ length: Math.min(BEATS_CONCURRENCY, queue.length) }, async () => {
      for (let x = queue.shift(); x; x = queue.shift()) {
        if (opts.deadlineMs && Date.now() > opts.deadlineMs) return;
        out.attempted++;
        const at = now().toISOString();
        try {
          const r = await beatsFor(x.d, generate!);
          // Re-check inside a transaction so an edit made meanwhile is never replaced.
          const wrote = await db.runTransaction(async (tx) => {
            const cur = await tx.get(col.doc(x.id));
            if (!cur.exists) return null;
            const hasPoints = (cur.data()?.talking_points ?? []).length > 0;
            const patch: Record<string, unknown> = {};
            if (!hasPoints) Object.assign(patch, { talking_points: r.beats, talking_points_source: "auto", cta_line: r.cta });
            if (!cur.data()?.short_title && r.title) patch.short_title = r.title;
            if (!cur.data()?.hook_full && r.hook) patch.hook_full = r.hook;
            if (typeof cur.data()?.hook_first_person !== "boolean") patch.hook_first_person = r.hook_first_person;
            if (!Object.keys(patch).length) return null;
            tx.update(col.doc(x.id), { ...patch, beats: { generated_at: at, model: BEATS_MODEL } });
            return { points: !hasPoints };
          });
          if (wrote) {
            out.generated++;
            if (wrote.points && r.cta) out.with_cta++;
          }
        } catch (e) {
          const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
          const prev = x.d.beats ?? {};
          await col
            .doc(x.id)
            .update({ beats: { ...prev, attempts: (isLegacy(prev.last_error) ? 0 : (prev.attempts ?? 0)) + 1, last_error: error, last_attempt_at: at } })
            .catch(() => undefined);
          out.failed.push({ id: x.id, error });
        }
      }
    }),
  );
  out.remaining = need.length - out.generated;
  log(`proven beats: ${out.generated}/${out.attempted} generated (${out.with_cta} with the original's ending), ${out.failed.length} failed`);
  return out;
}

// ---------------------------------------------------------------- unique names

export const TITLES_SYSTEM = `You name short hair loss videos for a list in an app. Each line you get is one video format: its id and its hook.

Return names by calling save_titles with one entry per id.

Rules for each name:
- 2 to 4 words, sentence case, no punctuation, no first person, never "routine", no brand names.
- Every name must be different from every other name. Make each one say what is specific about that hook, so someone scanning the list can tell them apart. Bad: "Pinch test" for five different videos. Good: "Pinch top vs sides", "Pinch where it's thin", "Fist press check", "Scalp won't move", "Crown pinch test".
- Plain words a 5-year-old knows.`;

const TITLES_TOOL = {
  name: "save_titles",
  description: "Save one name per video format.",
  input_schema: {
    type: "object" as const,
    properties: {
      titles: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } }, required: ["id", "title"] } },
    },
    required: ["titles"],
  },
};

export interface RetitleResult {
  dry: boolean;
  formats: number;
  videos: number;
  written: number;
  titles?: Record<string, string>;
}

/**
 * Names every format (near-identical videos grouped by formatGroups) with a
 * name no other format has, and writes it to all of its videos. One call.
 */
export async function retitleFormats(opts: { db?: Firestore; dry?: boolean; generate?: (system: string, user: string) => Promise<unknown> } = {}): Promise<RetitleResult> {
  const db = opts.db ?? getFirebaseAdmin().db;
  const col = db.collection(PROVEN_COLLECTION);
  const snap = await col.where("status", "==", "active").get();
  const vids = snap.docs.map((d) => ({ id: d.id, d: d.data() as ProvenVideo & { hook_full?: string } }));
  const groups = formatGroups(vids.map((v) => ({ id: v.id, hook: v.d.hook_full || v.d.hook_line, views: v.d.views ?? 0 })));
  const leads = [...new Set(groups.values())].map((id) => vids.find((v) => v.id === id)!).filter((v) => (v.d.hook_full || v.d.hook_line || "").trim());
  const user = leads.map((v) => `${v.id}: ${(v.d.hook_full || v.d.hook_line).slice(0, 220)}`).join("\n");

  let raw: unknown;
  if (opts.generate) raw = await opts.generate(TITLES_SYSTEM, user);
  else {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: BEATS_MODEL,
      max_tokens: 6000,
      system: TITLES_SYSTEM,
      tools: [TITLES_TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: `${user}\n\nAnswer by calling ${TITLES_TOOL.name}.` }],
    });
    const call = resp.content.find((b) => b.type === "tool_use");
    if (!call || call.type !== "tool_use") throw new Error(`no titles (stop: ${resp.stop_reason})`);
    raw = call.input;
  }
  const list = Array.isArray((raw as { titles?: unknown })?.titles) ? (raw as { titles: { id: string; title: string }[] }).titles : [];
  const byFormat: Record<string, string> = {};
  const seen = new Set<string>();
  for (const t of list) {
    const clean = cleanTitle(t.title);
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    byFormat[t.id] = clean;
  }
  const out: RetitleResult = { dry: !!opts.dry, formats: leads.length, videos: vids.length, written: 0 };
  if (opts.dry) return { ...out, titles: byFormat };
  let batch = db.batch();
  let n = 0;
  for (const v of vids) {
    const title = byFormat[groups.get(v.id) ?? v.id];
    if (!title || v.d.short_title === title) continue;
    batch.update(col.doc(v.id), { short_title: title });
    out.written++;
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return { ...out, titles: byFormat };
}
