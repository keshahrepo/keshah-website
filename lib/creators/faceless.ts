/**
 * The Scalp Report: daily faceless explainer videos for aadi.keshah.
 *
 * Each day (cron /api/cron/faceless-draft) this picks proven videos with
 * transcripts and has Claude adapt each into a narrator script plus a scene
 * plan (scene types the Remotion renderer in ~/keshah-faceless knows). The
 * plans go to FacelessVideos/{date}_{n} as "drafted"; a Modal job voices,
 * renders and uploads them to the shared drive, then marks them "uploaded".
 *
 * Settings/creator_portal: faceless_per_day (default 5), faceless_enabled (default true).
 */
import Anthropic from "@anthropic-ai/sdk";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { CONTENT_FACTS } from "./content-facts";
import { BEATS_MODEL } from "./proven-beats";
import { PROVEN_COLLECTION } from "./proven";

export const FACELESS_COLLECTION = "FacelessVideos";
export const FACELESS_DEFAULT_PER_DAY = 5;
/** A proven video isn't adapted again for this many days. */
export const FACELESS_REUSE_DAYS = 30;
const FORMATS_OK = new Set(["self-test", "explainer", "myth-bust", "doing-it-wrong", "list", "how-to-promise"]);
const SCENE_TYPES = ["big", "cards", "pinch", "head", "section", "study", "tags", "compare", "bottle", "end"] as const;

export interface FacelessSource {
  id: string;
  views: number;
  format: string;
  hook_family: string;
  transcript: string;
}

export interface FacelessSpec {
  title: string;
  caseName: string;
  script: string;
  caption: string;
  scenes: Record<string, unknown>[];
}

/** Proven videos to adapt: strongest first, one per hook family, at most `tests` self-tests. */
export function pickSources(all: FacelessSource[], usedIds: Set<string>, n: number, tests = 2): FacelessSource[] {
  const out: FacelessSource[] = [];
  const fams = new Set<string>();
  let selfTests = 0;
  for (const v of [...all].sort((a, b) => b.views - a.views)) {
    if (out.length >= n) break;
    if (usedIds.has(v.id) || !FORMATS_OK.has(v.format) || v.transcript.trim().split(/\s+/).length < 40) continue;
    const fam = v.hook_family || v.id;
    if (fams.has(fam)) continue;
    if (v.format === "self-test" && selfTests >= tests) continue;
    out.push(v);
    fams.add(fam);
    if (v.format === "self-test") selfTests++;
  }
  return out;
}

export const FACELESS_SYSTEM = `You adapt a proven hair loss video (a creator talking to camera) into a faceless explainer video: a neutral narrator voice over animated graphics, for the account @aadi.keshah.

Narration rules:
- Keep the original's hook and the order of its points, word for word where it still works without a person on camera. The hook must be the first sentence.
- Remove anything first person or personal: no "I", "my hair", "I fixed", "what do I have to lose", "I'm testing this". The narrator is neutral.
- Keep the mechanism without skipping a beat: tight scalp squeezes the blood vessels underneath, blood can't properly reach the hair, it gets thinner and falls out.
- Facts: only from this library, said with the same meaning, never their NEVER line. Replace any claim in the original that the library doesn't support (for example "minoxidil doesn't grow hair", "products don't reach your follicles", exact numbers not in the library).
- 90 to 140 words. Short spoken sentences, words a 5-year-old knows, no em dashes or en dashes, no hashtags, no emojis.
- End with one line pointing to the pinned video, e.g. "How to loosen it is in the pinned video." No "link in bio", no "follow", no "comment".
- Hedge medical facts lightly ("one small study found", "usually", "can"). Never promise regrowth or results. But never add disclaimers or caveats that kill the momentum ("that does not prove...", "this is not medical advice"). The library wording is already careful enough.
- Sound like a person talking: always use contractions (it's, here's, you're, don't, can't), short punchy sentences, a little rhythm. Never "it is", "here is", "you are".
- Keep the original's strongest lines (e.g. "It's not your genetics. It's not your shampoo.", "You can try the drugs, you can try the products, but fix this first.", "pressing, pinching, sliding"), adjusted only to remove first person.
- Don't use the word "galea" or explain the scalp layers unless the original does. Keep it simple: "your scalp gets tight".

Scene plan: 9 to 13 scenes. Each scene has "type" and "cue". "cue" is the exact first 2 to 4 words of the sentence in your script where the scene starts (copy them exactly). The first scene's cue is "". The last scene is {"type":"end","cue":"<first words of the pinned video line>"}. Something new should appear every 2 to 4 seconds of narration. Scene types (use only these, with these fields):
- {"type":"big","cue","lines":[{"text","tone"?:"tight"|"loose"|"ink"}],"dark"?:true}  1 to 3 short uppercase lines, max 16 characters each. Use dark:true at most once, for the "part nobody tells you" moment.
- {"type":"cards","cue","items":[{"title","sub"?,"tag"?,"tagTone"?:"tight"|"loose"|"ink"|"blue"|"gold"}]}  1 to 3 cards, uppercase titles under 22 characters, short tags.
- {"type":"pinch","cue","lift":0..1,"label","tone":"tight"|"loose","step"?}  fingertips pinching skin; lift 1 = lifts easily, 0.1 = stuck. label like "TOP · STUCK".
- {"type":"head","cue","labels"?:true}  head diagram, top tight in red, sides loose in green.
- {"type":"section","cue","squeeze":true|false}  scalp cross-section; squeeze:true shows the tight sheet squeezing the blood vessel.
- {"type":"study","cue","fact":"F02"}  the blood flow study counter and bars. Only when the script says the F02 line.
- {"type":"tags","cue","items":[{"text","tone"?}]}  2 to 4 pills appearing in turn, e.g. "LESS BLOOD ↓".
- {"type":"compare","cue","left":{"head","rows":[...]},"right":{"head","rows":[...]}}  two columns, 2 to 3 short rows each.
- {"type":"bottle","cue","tag"}  a minoxidil bottle with a red tag.
- {"type":"end","cue"}  the end card.

Also:
- "title": 2 to 5 words naming the video.
- "caseName": 2 to 4 uppercase words for the header, e.g. "THE TIGHT TOP".
- "caption": the post caption: one or two plain sentences plus 4 to 6 hashtags like #hairloss #scalphealth.

Answer only by calling save_video.`;

const TOOL = {
  name: "save_video",
  description: "Save the adapted faceless video.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      caseName: { type: "string" },
      script: { type: "string" },
      caption: { type: "string" },
      scenes: { type: "array", items: { type: "object" } },
    },
    required: ["title", "caseName", "script", "caption", "scenes"],
  },
};

export const factsLibrary = () => CONTENT_FACTS.map((f) => `- ${f.id}: "${f.line}" NEVER: ${f.never}`).join("\n");

export function facelessUserPrompt(src: FacelessSource, extra = "", earlier: FacelessSpec[] = []): string {
  const day = earlier.length
    ? `Videos already made today (yours must feel different: a different middle, a different fact or no fact, different scene choices; the F02 blood flow study may appear in at most 2 of the day's videos and it's already in ${earlier.filter((e) => /two and a half times/i.test(e.script)).length}):\n${earlier.map((e, i) => `${i + 1}. ${e.title}: ${e.script.slice(0, 260)}...`).join("\n")}`
    : "";
  return [
    `Fact library:\n${factsLibrary()}`,
    day,
    `Original (${src.format}, ${Math.round(src.views / 1000)}K views):\n${src.transcript.slice(0, 3000)}`,
    extra,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const BANNED = /\b(i|i'm|i've|my|me)\b|what do i have to lose|link in (my )?bio|\bfollow\b|\bcomment\b/i;

/** Problems with a spec, or [] when it's good to render. */
export function checkSpec(s: FacelessSpec): string[] {
  const p: string[] = [];
  const words = s.script.trim().split(/\s+/).length;
  if (words < 80 || words > 160) p.push(`script is ${words} words (80 to 160)`);
  if (/[—–]/.test(s.script + s.caption)) p.push("dash character");
  if (BANNED.test(s.script)) p.push("first person or a banned ask in the script");
  if (!/pinned video/i.test(s.script)) p.push("no pinned video line");
  if (/(^|[.!?]\s+)(it is|here is|you are|that is)\b|\b(do not|does not|cannot|can not)\b/i.test(s.script)) p.push("use contractions (it's, here's, you're, don't, can't, doesn't, that's)");
  if (/does ?n.t prove|not medical advice/i.test(s.script)) p.push("no momentum-killing disclaimers");
  if (!Array.isArray(s.scenes) || s.scenes.length < 6 || s.scenes.length > 15) p.push("scene count");
  const script = ` ${norm(s.script)} `;
  (s.scenes ?? []).forEach((sc, i) => {
    const type = String(sc.type ?? "");
    if (!(SCENE_TYPES as readonly string[]).includes(type)) p.push(`scene ${i + 1}: unknown type ${type}`);
    const cue = String(sc.cue ?? "");
    if (i > 0 && (!cue.trim() || !script.includes(` ${norm(cue)} `))) p.push(`scene ${i + 1}: cue not in script "${cue}"`);
    if (type === "study" && !/two and a half times less blood flow/i.test(s.script)) p.push("study scene without the F02 line");
  });
  if (s.scenes?.length && s.scenes[s.scenes.length - 1].type !== "end") p.push("last scene isn't end");
  if (!s.title?.trim() || !s.caseName?.trim() || !s.caption?.trim()) p.push("missing title, caseName or caption");
  return p;
}

export type FacelessGenerate = (system: string, user: string) => Promise<FacelessSpec>;

export function anthropicFaceless(apiKey = process.env.ANTHROPIC_API_KEY ?? ""): FacelessGenerate {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  return async (system, user) => {
    const resp = await client.messages.create({
      model: BEATS_MODEL,
      max_tokens: 8000,
      system,
      tools: [TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: `${user}\n\nAnswer by calling save_video.` }],
    });
    const call = resp.content.find((b) => b.type === "tool_use");
    if (!call || call.type !== "tool_use") throw new Error(`no save_video call (stop: ${resp.stop_reason})`);
    return call.input as FacelessSpec;
  };
}

/** Adapts one source, retrying once with the problems listed. */
export async function adaptSource(src: FacelessSource, generate: FacelessGenerate, earlier: FacelessSpec[] = []): Promise<FacelessSpec> {
  const studyUses = earlier.filter((e) => /two and a half times/i.test(e.script)).length;
  const check = (s: FacelessSpec) => [...checkSpec(s), ...(studyUses >= 2 && /two and a half times/i.test(s.script) ? ["the F02 study is already in 2 of today's videos; use a different fact or none"] : [])];
  let spec = await generate(FACELESS_SYSTEM, facelessUserPrompt(src, "", earlier));
  let problems = check(spec);
  if (problems.length) {
    spec = await generate(FACELESS_SYSTEM, facelessUserPrompt(src, `Your last attempt had these problems, fix them all: ${problems.join("; ")}`, earlier));
    problems = check(spec);
  }
  if (problems.length) throw new Error(problems.join("; "));
  return spec;
}

/** Drafts today's batch into FacelessVideos. Skips if today already has drafts. */
export async function draftFacelessDay(db: Firestore, opts: { date: string; perDay?: number; generate?: FacelessGenerate; now?: Date }): Promise<{ date: string; drafted: string[]; failed: string[]; skipped?: string }> {
  const col = db.collection(FACELESS_COLLECTION);
  const existing = await col.where("date", "==", opts.date).get();
  if (!existing.empty) return { date: opts.date, drafted: [], failed: [], skipped: "already drafted" };
  const since = new Date((opts.now ?? new Date()).getTime() - FACELESS_REUSE_DAYS * 86400000).toISOString().slice(0, 10);
  const used = new Set((await col.where("date", ">=", since).get()).docs.map((d) => String(d.data().source_id ?? "")));
  const snap = await db.collection(PROVEN_COLLECTION).where("status", "==", "active").get();
  const all: FacelessSource[] = snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, views: Number(x.views ?? 0), format: String(x.format ?? ""), hook_family: String(x.hook_family ?? ""), transcript: String(x.transcript ?? "") };
  });
  const n = opts.perDay ?? FACELESS_DEFAULT_PER_DAY;
  const picks = pickSources(all, used, n + 2); // two spares in case an adaptation fails
  const generate = opts.generate ?? anthropicFaceless();
  const drafted: string[] = [];
  const failed: string[] = [];
  const made: FacelessSpec[] = [];
  for (const src of picks) {
    if (drafted.length >= n) break;
    try {
      const spec = await adaptSource(src, generate, made);
      const id = `${opts.date}_${drafted.length + 1}`;
      await col.doc(id).set({
        id,
        date: opts.date,
        status: "drafted",
        source_id: src.id,
        source_views: src.views,
        source_format: src.format,
        ...spec,
        created_at: FieldValue.serverTimestamp(),
      });
      drafted.push(id);
      made.push(spec);
    } catch (e) {
      failed.push(`${src.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { date: opts.date, drafted, failed };
}
