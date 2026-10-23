/**
 * The Scalp Report: daily faceless explainer videos for aadi.keshah.
 *
 * Each day from 10:00 UTC (cron /api/cron/faceless-draft) this picks proven videos with
 * transcripts and has Claude adapt each into a narrator script plus a scene
 * plan (scene types the Remotion renderer in ~/keshah-faceless knows). The
 * plans go to FacelessVideos/{date}_{n} as "drafted"; a Modal job voices,
 * renders and uploads them to the shared drive, then marks them "uploaded".
 *
 * Settings/creator_portal: faceless_per_day (default 5), faceless_enabled (default true).
 *
 * Daily mix (pickDay): 60% new self-tests from the test bank (lib/creators/test-bank.ts,
 * each tried up to 3 times in 14 days, not two days running), 20% proven self-tests as
 * a baseline, 20% other proven formats. One main fact per video, rotated across days.
 */
import Anthropic from "@anthropic-ai/sdk";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { CONTENT_FACTS } from "./content-facts";
import { BEATS_MODEL } from "./proven-beats";
import { PROVEN_COLLECTION } from "./proven";
import { bankSourceId, ROUTINE_TECHNIQUES, TEST_BANK, type BankTest } from "./test-bank";

export const FACELESS_COLLECTION = "FacelessVideos";
export const FACELESS_DEFAULT_PER_DAY = 5;
/** A proven video isn't adapted again for this many days. */
export const FACELESS_REUSE_DAYS = 14;
const FORMATS_OK = new Set(["self-test", "explainer", "myth-bust", "doing-it-wrong", "list", "how-to-promise"]);
const SCENE_TYPES = ["big", "cards", "pinch", "head", "section", "study", "tags", "compare", "bottle", "end"] as const;

export interface FacelessSource {
  id: string;
  views: number;
  format: string;
  hook_family: string;
  transcript: string;
  /** Set when the source is a self-test idea from the bank rather than a proven video. */
  bank?: BankTest;
}

export interface FacelessSpec {
  title: string;
  caseName: string;
  script: string;
  caption: string;
  scenes: Record<string, unknown>[];
  /** The one fact the video leans on (a CONTENT_FACTS id) or "none". */
  main_fact?: string;
  /** "qoves" for the Qoves-style look (renderer src/qoves), else the Scalp Report look. */
  style?: "qoves";
  /** Qoves: new images to make for this video, referenced in scenes as "gen:<index>". */
  images?: { cast: string; pose: string }[];
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


export type DayTargets = { bank: number; proven: number; other: number };
export const dayTargets = (n: number): DayTargets => {
  const bank = Math.round(n * 0.6);
  const proven = Math.round(n * 0.2);
  return { bank, proven, other: Math.max(0, n - bank - proven) };
};

/** Bank tests as sources (format self-test, family "bank:<id>"). */
export const bankSources = (): FacelessSource[] =>
  TEST_BANK.map((t) => ({ id: bankSourceId(t.id), views: 0, format: "self-test", hook_family: `bank:${t.id}`, transcript: "", bank: t }));

/**
 * A day's picks: `need.bank` bank tests (fewest tries in the last 14 days first, at most 3,
 * none used today, yesterday's last), `need.proven` proven self-tests and `need.other`
 * other proven formats (strongest first, one per family, families from yesterday last).
 * Plus a spare of each kind in case a draft fails.
 */
export function pickDay(input: {
  proven: FacelessSource[];
  usedIds: Set<string>;
  bankUses: Map<string, number>;
  todayIds: Set<string>;
  todayFams: Set<string>;
  yesterdayFams: Set<string>;
  need: DayTargets;
  seed?: number;
}): FacelessSource[] {
  const fams = new Set(input.todayFams);
  const take = (list: FacelessSource[], k: number) => {
    const out: FacelessSource[] = [];
    for (const v of list) {
      if (out.length >= k) break;
      const fam = v.hook_family || v.id;
      if (fams.has(fam)) continue;
      out.push(v);
      fams.add(fam);
    }
    return out;
  };
  const fresh = (v: FacelessSource) => (input.yesterdayFams.has(v.hook_family || v.id) ? 1 : 0);
  const ok = (v: FacelessSource) => !input.usedIds.has(v.id) && FORMATS_OK.has(v.format) && v.transcript.trim().split(/\s+/).length >= 40;
  const byStrength = (a: FacelessSource, b: FacelessSource) => fresh(a) - fresh(b) || b.views - a.views;
  const seed = input.seed ?? 0;
  const jitter = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0) + seed) % 9973, 7);
  const bank = bankSources()
    .filter((b) => !input.todayIds.has(b.id) && (input.bankUses.get(b.id) ?? 0) < 3)
    .sort((a, b) => fresh(a) - fresh(b) || (input.bankUses.get(a.id) ?? 0) - (input.bankUses.get(b.id) ?? 0) || jitter(a.id) - jitter(b.id));
  const provenTests = input.proven.filter((v) => ok(v) && v.format === "self-test").sort(byStrength);
  const others = input.proven.filter((v) => ok(v) && v.format !== "self-test").sort(byStrength);
  const a = take(bank, input.need.bank + (input.need.bank ? 1 : 0));
  const b = take(provenTests, input.need.proven + (input.need.proven ? 1 : 0));
  const c = take(others, input.need.other + (input.need.other ? 1 : 0));
  // Interleave so a partial day still has a mix: bank, bank, proven, other, ...
  const out: FacelessSource[] = [];
  const queues = [a, a, a, b, c];
  const total = a.length + b.length + c.length;
  for (let guard = 0; out.length < total && guard < 200; guard++) {
    const q = queues[guard % queues.length];
    const v = q.shift();
    if (v) out.push(v);
  }
  return out;
}

export const FACELESS_SYSTEM = `You adapt a proven hair loss video (a creator talking to camera) into a faceless explainer video: a neutral narrator voice over animated graphics, for the account @aadi.keshah.

Narration rules:
- Keep the original's hook and the order of its points, word for word where it still works without a person on camera. The hook must be the first sentence.
- Remove anything first person or personal: no "I", "my hair", "I fixed", "what do I have to lose", "I'm testing this". The narrator is neutral.
- Keep the mechanism without skipping a beat, but in one or two short sentences: tight scalp squeezes the blood vessels underneath, blood can't properly reach the hair, it gets thinner and falls out.
- One main fact per video: pick ONE fact from the library (or none) and build the middle around it. Prefer facts not in the "recently used" list. Put its id in "main_fact" ("none" if you use no fact). The F02 blood flow study may appear in at most 2 of a day's videos.
- The fix must sound like a full routine, never just a few moves: name 2 or 3 example techniques as a glimpse, chosen from: ${ROUTINE_TECHNIQUES.join(", ")}. Then make clear it's a full daily routine (scalp work and neck work, in a specific order, building up week by week as the scalp loosens). Never give the exact steps, order, durations or how much pressure; that's what the pinned video is for.
- Facts: only from this library, said with the same meaning, never their NEVER line. Replace any claim in the original that the library doesn't support (for example "minoxidil doesn't grow hair", "products don't reach your follicles", exact numbers not in the library).
- 90 to 140 words. Short spoken sentences, words a 5-year-old knows, no em dashes or en dashes, no hashtags, no emojis.
- End with one or two lines pointing to the pinned video that play on the viewer's doubts (is it actually tight, does this work, how to fix it), in fresh wording each video (never reuse the sentence shape of today's earlier endings, e.g. not "Not sure if... The pinned video shows you how to check, and how to fix it." every time), e.g. "Not sure if yours is actually tight, or if this even works? The pinned video shows you how to check, and how to fix it." No "link in bio", no "follow", no "comment".
- Hedge medical facts lightly ("one small study found", "usually", "can"). Never promise regrowth or results. But never add disclaimers or caveats that kill the momentum ("that does not prove...", "this is not medical advice"). The library wording is already careful enough.
- Sound like a person talking: always use contractions (it's, here's, you're, don't, can't), short punchy sentences, a little rhythm. Never "it is", "here is", "you are".
- Keep the original's strongest lines (e.g. "It's not your genetics. It's not your shampoo.", "You can try the drugs, you can try the products, but fix this first."), adjusted only to remove first person. If the original lists moves like "pressing, pinching, sliding", keep them as examples inside the full-routine framing above.

When the input is a SELF-TEST IDEA instead of an original video, write a fresh script in the same voice:
- First sentence: the test, as a command the viewer can do right now (you may tighten the wording).
- Then the fail result, and that it could be why they're losing hair or going bald (hedge with "could", "may", "usually"; never "will").
- For face, jaw and neck tests, add one bridge sentence: tension there pulls on the same tight layer over the top of the head, or usually comes with a tight scalp. Keep it plain and hedged.
- Then the mechanism (one or two sentences), the one main fact, the full-routine fix, and the pinned video line, all per the rules above.
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


// ---------------------------------------------------------------- Qoves style

/** Photoreal library images already made (public/qoves/<key>.png in ~/keshah-faceless). */
export const QOVES_LIBRARY = [
  "man1_base", "man1_pinch_side", "man1_pinch_top", "man1_massage", "man1_stage1", "man1_stage2", "man1_stage3", "man1_stage4",
  "man2_base", "man2_pinch_top", "man2_press", "man2_pinch", "man2_slide",
  "woman1_base", "woman1_pinch_top", "crown_topdown",
  "man3_base", "man4_base", "woman2_base", "man5_base", "man6_base",
] as const;
/** The audience is mostly white and Indian men in their 20s to 40s, plus women: lead with those cast members. */
export const QOVES_CAST: Record<string, string> = {
  man1: "white man around 30, dark hair, early receding hairline (has hair loss stage images man1_stage1..4)",
  man2: "white man around 35, light brown hair thinning on top",
  man5: "Indian man in his late 20s, black hair, receding hairline",
  man6: "East Asian man in his early 30s, black hair thinning on top",
  woman1: "woman around 30, dark hair pulled back, slightly widening centre part",
  woman2: "woman around 40, shoulder-length hair, thinning along the part",
  man3: "white man around 45, greying, clearly balding on top (use rarely)",
  man4: "Black man in his mid 20s, receding hairline (use rarely)",
};
/**
 * Who leads each video, in order (10 a day): about half white men, two Indian, two women, one East Asian,
 * matching the audience. Picked in code, because the writer left to itself over-picks one person.
 */
export const QOVES_LEAD_ROTATION = ["man1", "man2", "man5", "woman1", "man1", "man2", "woman2", "man6", "man1", "man5"] as const;
export const qovesLead = (date: string, i: number) =>
  QOVES_LEAD_ROTATION[(Number(date.replace(/-/g, "")) * 3 + i) % QOVES_LEAD_ROTATION.length];
export const leadPrompt = (lead: string) =>
  `CAST FOR THIS VIDEO: ${lead} (${QOVES_CAST[lead]}). Every person shown is ${lead}: their library photos and every new photo ("cast":"${lead}"). The only exceptions: the man1_stage1..4 hair loss stages, crown_topdown, and a celebrity opener.`;
const QOVES_TYPES = ["portrait", "pair", "stages", "diagram", "heat", "chart", "chips", "trio", "text", "cta", "celeb"] as const;

/**
 * Public figures with real photos of their hairline over the years (public/qoves/celeb/<slug>/ in
 * ~/keshah-faceless, Wikimedia Commons, credits.json there). About half the Qoves videos open on one.
 * Only what's visible is ever said: never treatments, causes, health, or that they use anything.
 */
export const QOVES_CELEBS: { slug: string; name: string; years: number[]; note: string }[] = [];

const narrationRules = () => FACELESS_SYSTEM.slice(FACELESS_SYSTEM.indexOf("Narration rules:"), FACELESS_SYSTEM.indexOf("Scene plan:"))
  .replace(/- End with one or two lines pointing to the pinned video[^\n]*\n/, "")
  .replace(/When the input is a SELF-TEST IDEA[\s\S]*$/, "");

export const QOVES_SYSTEM = () => `You adapt a proven hair loss video, or a new self-test idea, into a calm, premium explainer in the style of Qoves Studio: a neutral narrator over photoreal studio portraits (muted blue-grey background, black sweaters), quiet thin titles, small mono labels, simple white diagrams. For the account @aadi.keshah.

${narrationRules()}
- End with ONE sentence, Qoves-style, that offers the answer to their doubt: the link in bio has an app that checks if their scalp is tight and shows how to loosen it. Fresh wording each video (e.g. "Want to check if yours is tight? The link in bio has an app that checks it, and shows you how to loosen it."). Never mention a pinned video. No "follow", no "comment".

When the input is a SELF-TEST IDEA instead of an original video, write a fresh script in the same voice:
- First sentence: the test, as a command the viewer can do right now (you may tighten the wording).
- Then the fail result, and that it could be why they're losing hair or going bald (hedge with "could", "may", "usually"; never "will").
- For face, jaw and neck tests, add one bridge sentence: tension there pulls on the same tight layer over the top of the head, or usually comes with a tight scalp. Keep it plain and hedged.
- Then the mechanism (one or two sentences), the one main fact, the full-routine fix, and the closing link in bio line.

Scene plan: 8 to 13 scenes. Each scene has "type" and "cue" (the exact first 2 to 4 words of the sentence where it starts; the first scene's cue is ""). Something new every 2 to 4 seconds. The LAST scene is {"type":"cta","cue":"<first words of the closing link in bio sentence>"}.

Pictures: an image field is either "lib:<key>" (an existing photo) or "gen:<n>" (an entry of "images", made for this video; counting starts at 0, so the first new photo is "gen:0").
Existing photos: ${QOVES_LIBRARY.join(", ")}.
Cast (each video names its one cast member; use only them): ${Object.entries(QOVES_CAST).map(([k, v]) => `${k} (${v})`).join("; ")}.
"images": up to 3 new photos, each {"cast":"<cast id>","pose":"<ONE simple hand action in a few words, e.g. pressing their fingertips into the muscles between their neck and shoulders; no extra details about head angle or expression>"}. Ask for one whenever the test shows a body action the library doesn't have (traps, jaw, ears, neck tilts, hair pulls, eyebrows...). Hands must be simple and natural.

Scene types (only these, with these fields):
- {"type":"portrait","cue","img","title"?,"label"?,"tags"?:[...]}  one big photo. title 2 to 5 words, sentence case. label short, e.g. "Step 1 · the side". tags: up to 4 short pills.
- {"type":"pair","cue","title"?,"left":{"src","label"},"right":{"src","label"}}  two photos side by side (e.g. "Moves freely" vs "Barely moves").
- {"type":"stages","cue","title"?,"imgs":["lib:man1_stage1","lib:man1_stage2","lib:man1_stage3","lib:man1_stage4"],"labels":["Stage 1","Stage 2","Stage 3","Stage 4"]}  hairline getting worse (labelled AI visualization automatically). Only man1's stages exist.
- {"type":"diagram","cue","title"?,"squeeze"?:true}  scalp cross-section with flowing blood; squeeze:true shows the tight layer squeezing the vessels.
- {"type":"heat","cue","img":"lib:crown_topdown","title"?,"tag"?,"note"?}  top of the head with tension glowing where hair thins. Pair with F01.
- {"type":"chart","cue","title"?,"bars":[{"label":"Full hair","value":2.5},{"label":"Going bald","value":1}],"tag":"Klemp et al · 1989","note":"Small study"}  only when the script says the F02 line.
- {"type":"chips","cue","title"?,"items":[...],"strike"?:true,"img"?}  2 to 5 short pills (e.g. "Your genes", "Your shampoo"), strike:true crosses them out.
- {"type":"trio","cue","title"?,"imgs":[{"src","label"},{"src","label"},{"src","label"}]}  three photos, e.g. example techniques.
- {"type":"text","cue","lines":[...]}  1 or 2 short italic lines for a quiet beat.
- {"type":"cta","cue"}  the close (app screens, real results, "Link in bio"). Always last.
- {"type":"celeb","cue","celeb":"<slug>","title"?}  real photos of a public figure's hairline over the years, one after another with the years. ONLY when the input names a celebrity for this video.

Also: "title" (2 to 5 words naming the video), "caseName" (same as title, uppercase), "caption" (one or two plain sentences plus 4 to 6 hashtags), "main_fact" (fact id or "none"), "images" ([] if none).

Answer only by calling save_video.`;

/** Writers sometimes count new photos from 1: when no scene uses gen:0, shift every gen ref down by one. */
export function normalizeGenRefs(s: FacelessSpec): FacelessSpec {
  const json = JSON.stringify(s.scenes ?? []);
  const n = (s.images ?? []).length;
  const refs = [...json.matchAll(/"gen:(\d+)"/g)].map((m) => Number(m[1]));
  if (!n || !refs.length || refs.includes(0) || Math.max(...refs) !== n) return s;
  return { ...s, scenes: JSON.parse(json.replace(/"gen:(\d+)"/g, (_, d) => `"gen:${Number(d) - 1}"`)) };
}

/** The celebrity block added to a writer prompt when a video opens on a public figure. */
export function celebPrompt(c: { slug: string; name: string; years: number[]; note: string }): string {
  return `CELEBRITY FOR THIS VIDEO: ${c.name} (slug "${c.slug}", real photos from ${c.years.join(", ")}; visible: ${c.note}).
Open on them: the FIRST scene is {"type":"celeb","cue":"","celeb":"${c.slug}"} (an optional short title). You may name them once in the hook, neutrally, about what's visible (e.g. "Look at ${c.name}'s hairline over the years."), then go straight to the viewer's own test. Never say anything about their scalp, health, causes, treatments or products, and never connect them to the app or the closing line.`;
}

/** Problems with a Qoves spec, or [] when it's good to render. */
export function checkQovesSpec(s: FacelessSpec): string[] {
  const p: string[] = [];
  const words = s.script.trim().split(/\s+/).length;
  if (words < 80 || words > 165) p.push(`script is ${words} words (80 to 165)`);
  if (/[—–]/.test(s.script + s.caption)) p.push("dash character");
  if (/\b(i|i'm|i've|me)\b|what do i have to lose|\bfollow\b|\bcomment\b|pinned video/i.test(s.script)) p.push("first person, pinned video or a banned ask in the script");
  if (!/link in (the )?bio/i.test(s.script)) p.push("no link in bio line");
  if (/(^|[.!?]\s+)(it is|here is|you are|that is)\b|\b(do not|does not|cannot|can not)\b/i.test(s.script)) p.push("use contractions (it's, here's, you're, don't, can't, doesn't, that's)");
  if (/does ?n.t prove|not medical advice/i.test(s.script)) p.push("no momentum-killing disclaimers");
  const imgs = Array.isArray(s.images) ? s.images : [];
  if (imgs.length > 3) p.push("at most 3 new images");
  imgs.forEach((im, i) => {
    if (!QOVES_CAST[im?.cast]) p.push(`images[${i}]: unknown cast "${im?.cast}"`);
    if (!String(im?.pose ?? "").trim()) p.push(`images[${i}]: missing pose`);
  });
  const ref = (v: unknown, where: string) => {
    const r = String(v ?? "");
    if (r.startsWith("lib:")) {
      if (!(QOVES_LIBRARY as readonly string[]).includes(r.slice(4))) p.push(`${where}: unknown photo ${r}`);
    } else if (r.startsWith("gen:")) {
      const n = Number(r.slice(4));
      if (!Number.isInteger(n) || n < 0 || n >= imgs.length) p.push(`${where}: ${r} has no matching images entry`);
    } else p.push(`${where}: image must be lib:<key> or gen:<n>, got "${r}"`);
  };
  const scenes = Array.isArray(s.scenes) ? s.scenes : [];
  if (scenes.length < 7 || scenes.length > 15) p.push("scene count");
  const script = ` ${norm(s.script)} `;
  scenes.forEach((sc, i) => {
    const type = String(sc.type ?? "");
    const at = `scene ${i + 1}`;
    if (!(QOVES_TYPES as readonly string[]).includes(type)) p.push(`${at}: unknown type ${type}`);
    const cue = String(sc.cue ?? "");
    if (i > 0 && (!cue.trim() || !script.includes(` ${norm(cue)} `))) p.push(`${at}: cue not in script "${cue}"`);
    if (type === "portrait" || type === "heat") ref(sc.img, at);
    if (type === "chips" && sc.img) ref(sc.img, at);
    if (type === "pair") {
      ref((sc.left as { src?: string })?.src, `${at} left`);
      ref((sc.right as { src?: string })?.src, `${at} right`);
    }
    if (type === "trio") ((sc.imgs as { src?: string }[]) ?? []).forEach((x, k) => ref(x?.src, `${at} img ${k + 1}`));
    if (type === "stages") ((sc.imgs as string[]) ?? []).forEach((x, k) => ref(x, `${at} img ${k + 1}`));
    if (type === "chart" && !/two and a half times less blood flow/i.test(s.script)) p.push("chart scene without the F02 line");
    if (type === "celeb") {
      if (!QOVES_CELEBS.some((c) => c.slug === sc.celeb)) p.push(`${at}: unknown celebrity "${String(sc.celeb)}"`);
      if (i >= scenes.length - 2) p.push(`${at}: a celebrity can't be next to the closing line`);
    }
  });
  if (scenes.length && scenes[scenes.length - 1].type !== "cta") p.push("last scene isn't cta");
  if (!s.title?.trim() || !s.caption?.trim()) p.push("missing title or caption");
  if (s.main_fact !== undefined && s.main_fact !== "none" && !CONTENT_FACTS.some((f) => f.id === s.main_fact || f.id.startsWith(`${s.main_fact}_`))) p.push(`main_fact "${s.main_fact}" isn't a library id or "none"`);
  return p;
}

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
      main_fact: { type: "string", description: "The one library fact id the video leans on, or \"none\"." },
      images: { type: "array", items: { type: "object" }, description: "Qoves style only: new photos to make, [{cast, pose}]." },
    },
    required: ["title", "caseName", "script", "caption", "scenes"],
  },
};

export const factsLibrary = () => CONTENT_FACTS.map((f) => `- ${f.id}: "${f.line}" NEVER: ${f.never}`).join("\n");

export function facelessUserPrompt(src: FacelessSource, extra = "", earlier: FacelessSpec[] = [], recentFacts: string[] = []): string {
  const day = earlier.length
    ? `Videos already made today (yours must feel different: a different middle, a different fact or no fact, different scene choices; the F02 blood flow study may appear in at most 2 of the day's videos and it's already in ${earlier.filter((e) => /two and a half times/i.test(e.script)).length}):\n${earlier.map((e, i) => `${i + 1}. ${e.title}: ${e.script.slice(0, 260)}...`).join("\n")}`
    : "";
  return [
    `Fact library:\n${factsLibrary()}`,
    day,
    recentFacts.length ? `Recently used main facts (pick a different one if you can): ${[...new Set(recentFacts)].join(", ")}` : "",
    src.bank
      ? `SELF-TEST IDEA (not a proven video; write a fresh script):\nTest: ${src.bank.test}\nFail result: ${src.bank.fail}\nArea: ${src.bank.area}`
      : `Original (${src.format}, ${Math.round(src.views / 1000)}K views):\n${src.transcript.slice(0, 3000)}`,
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
  if (s.main_fact !== undefined && s.main_fact !== "none" && !CONTENT_FACTS.some((f) => f.id === s.main_fact || f.id.startsWith(`${s.main_fact}_`))) p.push(`main_fact "${s.main_fact}" isn't a library id or "none"`);
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
export async function adaptSource(src: FacelessSource, generate: FacelessGenerate, earlier: FacelessSpec[] = [], recentFacts: string[] = [], style?: "qoves", celeb?: (typeof QOVES_CELEBS)[number], lead?: string): Promise<FacelessSpec> {
  const studyUses = earlier.filter((e) => /two and a half times/i.test(e.script)).length;
  const base = style === "qoves" ? checkQovesSpec : checkSpec;
  const system = style === "qoves" ? QOVES_SYSTEM() : FACELESS_SYSTEM;
  const celebExtra = [celeb ? celebPrompt(celeb) : "", lead ? leadPrompt(lead) : ""].filter(Boolean).join("\n\n");
  const check = (s: FacelessSpec) => [
    ...base(s),
    ...(studyUses >= 2 && /two and a half times/i.test(s.script) ? ["the F02 study is already in 2 of today's videos; use a different fact or none"] : []),
    ...(lead ? (s.images ?? []).filter((im) => im?.cast !== lead).map((im) => `new photo of "${im?.cast}": every new photo must be "cast":"${lead}"`) : []),
    ...(lead ? [...new Set(JSON.stringify(s.scenes ?? []).match(/lib:(?:man[1-6]|woman[12])_(?!stage)[a-z_]+/g) ?? [])].filter((r) => !r.startsWith(`lib:${lead}_`)).map((r) => `${r} shows someone else: use ${lead}'s photos only`) : []),
    ...(celeb && !(s.scenes ?? []).some((x) => x.type === "celeb" && x.celeb === celeb.slug) ? [`open on the celebrity: first scene {"type":"celeb","celeb":"${celeb.slug}"}`] : []),
  ];
  const fix = (sp: FacelessSpec) => (style === "qoves" ? normalizeGenRefs(sp) : sp);
  let spec = fix(await generate(system, facelessUserPrompt(src, celebExtra, earlier, recentFacts)));
  let problems = check(spec);
  if (problems.length) {
    spec = fix(await generate(system, facelessUserPrompt(src, `${celebExtra}\n\nYour last attempt had these problems, fix them all: ${problems.join("; ")}`, earlier, recentFacts)));
    problems = check(spec);
  }
  if (problems.length) throw new Error(problems.join("; "));
  return style === "qoves" ? { ...spec, style: "qoves", images: spec.images ?? [] } : spec;
}

/** Drafts today's batch into FacelessVideos, in chunks: fills what's missing until `deadlineMs`, so a later call carries on. */
export async function draftFacelessDay(
  db: Firestore,
  opts: { date: string; perDay?: number; generate?: FacelessGenerate; now?: Date; deadlineMs?: number; style?: "qoves"; tag?: string },
): Promise<{ date: string; drafted: string[]; failed: string[]; total: number; complete: boolean }> {
  const col = db.collection(FACELESS_COLLECTION);
  const n = opts.perDay ?? FACELESS_DEFAULT_PER_DAY;
  // tag: an extra batch for the same day (e.g. "Qoves"), stored as date "<date> <tag>" with its own Drive folder.
  const dayKey = opts.tag ? `${opts.date} ${opts.tag}` : opts.date;
  const idBase = opts.tag ? `${opts.date}-${opts.tag.toLowerCase().replace(/[^a-z0-9]+/g, "")}` : opts.date;
  const today = (await col.where("date", "==", dayKey).get()).docs;
  const made: FacelessSpec[] = today.map((d) => d.data() as FacelessSpec);
  if (today.length >= n) return { date: opts.date, drafted: [], failed: [], total: today.length, complete: true };
  const nowMs = (opts.now ?? new Date()).getTime();
  const since = new Date(nowMs - FACELESS_REUSE_DAYS * 86400000).toISOString().slice(0, 10);
  const recent = (await col.where("date", ">=", since).get()).docs.map((d) => d.data());
  const used = new Set(recent.map((d) => String(d.source_id ?? "")));
  const bankUses = new Map<string, number>();
  recent.forEach((d) => {
    const id = String(d.source_id ?? "");
    if (id.startsWith("bank_")) bankUses.set(id, (bankUses.get(id) ?? 0) + 1);
  });
  const yesterday = new Date(Date.parse(opts.date + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  const yDocs = recent.filter((d) => d.date === yesterday);
  const yesterdayFams = new Set(yDocs.map((d) => String(d.source_family ?? "")));
  const recentFacts = [...yDocs, ...today.map((d) => d.data())].map((d) => String(d.main_fact ?? "")).filter((f) => f && f !== "none");
  const snap = await db.collection(PROVEN_COLLECTION).where("status", "==", "active").get();
  const all: FacelessSource[] = snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, views: Number(x.views ?? 0), format: String(x.format ?? ""), hook_family: String(x.hook_family ?? ""), transcript: String(x.transcript ?? "") };
  });
  const todayFams = new Set(today.map((d) => String(d.data().source_family ?? "")));
  const t = dayTargets(n);
  const isBank = (d: FirebaseFirestore.DocumentData) => String(d.source_id ?? "").startsWith("bank_");
  const madeBank = today.filter((d) => isBank(d.data())).length;
  const madeProven = today.filter((d) => !isBank(d.data()) && d.data().source_format === "self-test").length;
  const madeOther = today.length - madeBank - madeProven;
  const picks = pickDay({
    proven: all,
    usedIds: used,
    bankUses,
    todayIds: new Set(today.map((d) => String(d.data().source_id ?? ""))),
    todayFams,
    yesterdayFams,
    need: { bank: Math.max(0, t.bank - madeBank), proven: Math.max(0, t.proven - madeProven), other: Math.max(0, t.other - madeOther) },
    seed: Number(opts.date.replace(/-/g, "")) % 997,
  });
  const generate = opts.generate ?? anthropicFaceless();
  const drafted: string[] = [];
  const failed: string[] = [];
  let next = today.length;
  for (const src of picks) {
    if (next >= n) break;
    if (opts.deadlineMs && Date.now() > opts.deadlineMs) break;
    try {
      // About half the Qoves videos open on a public figure, rotating through the library.
      const celeb = opts.style === "qoves" && QOVES_CELEBS.length && next % 2 === 0 ? QOVES_CELEBS[(Number(opts.date.replace(/-/g, "")) + next) % QOVES_CELEBS.length] : undefined;
      const lead = opts.style === "qoves" ? qovesLead(opts.date, next) : undefined;
      const spec = await adaptSource(src, generate, made, recentFacts, opts.style, celeb, lead);
      const id = `${idBase}_${next + 1}`;
      await col.doc(id).set({
        id,
        date: dayKey,
        status: "drafted",
        source_id: src.id,
        source_views: src.views,
        source_format: src.format,
        source_family: src.hook_family,
        ...(src.bank ? { source_test: src.bank.test, source_area: src.bank.area } : {}),
        ...spec,
        created_at: FieldValue.serverTimestamp(),
      });
      drafted.push(id);
      made.push(spec);
      if (spec.main_fact && spec.main_fact !== "none") recentFacts.push(spec.main_fact);
      next++;
    } catch (e) {
      failed.push(`${src.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const outOfPicks = picks.length === 0 || (drafted.length + failed.length >= picks.length);
  return { date: dayKey, drafted, failed, total: next, complete: next >= n || outOfPicks };
}
