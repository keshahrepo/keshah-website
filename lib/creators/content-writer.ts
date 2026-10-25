/**
 * Drafting the founder's weekly scripts with Claude (same SDK, key and model
 * as proven-beats.ts: @anthropic-ai/sdk, ANTHROPIC_API_KEY, BEATS_MODEL).
 *
 *   draftWeek(week_of)       10 scripts (WEEK_MIX), 4 parallel calls, one per source
 *   rejectScript(id, why)    marks it rejected and drafts one replacement for the same slot
 *   voiceEdit(id, note)      rewrites a draft from the founder's spoken note
 *   weekVoice(week, note)    the same note applied to every draft of the week
 *
 * Every answer is validated (content.ts parseScripts) and retried once with
 * the problems listed.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Firestore } from "firebase-admin/firestore";
import { CreatorDataError } from "./db";
import {
  SCRIPTS_COLLECTION,
  SCRIPTS_PER_WEEK,
  WEEKS_COLLECTION,
  WEEK_MIX,
  changedFields,
  parseScripts,
  type CleanScript,
  type ContentScript,
  type ScriptReference,
  type ScriptSource,
} from "./content";
import { CONTENT_FACTS, factById } from "./content-facts";
import {
  adaptCandidates,
  familyRollups,
  formatRollups,
  rejectionLessons,
  revivalFormats,
  risingFamilies,
  scanItems,
  strongFamilies,
  tally,
  type ScanItem,
} from "./content-select";
import { fsdb, getScript, latestScan, loadLibrary, scriptsSince, syncWeek, weekPayload, weekScripts, type WeekPayload } from "./content-db";
import { BEATS_MODEL } from "./proven-beats";
import { CONTENT_SYSTEM } from "./content-prompt";

export { CONTENT_SYSTEM };
import { PROVEN_COLLECTION, addDaysTo, type ProvenVideo } from "./proven";
import { CREATOR_TESTED_BANK_IDS, TEST_BANK, type BankTest } from "./test-bank";
import type { YyyyMmDd } from "./types";

export const CONTENT_MODEL = BEATS_MODEL;


const SCRIPT_PROPS = {
  slot: { type: "integer" },
  title: { type: "string" },
  format: { type: "string" },
  hook_family: { type: "string" },
  first_frame: { type: "string" },
  on_screen_text: { type: "string" },
  hook: { type: "string" },
  points: { type: "array", items: { type: "string" } },
  cta_1: { type: "string" },
  beat: { type: "string" },
  cta_2: { type: "string" },
  fact_id: { type: ["string", "null"] },
  reference_url: { type: ["string", "null"] },
};

const TOOL = {
  name: "save_scripts",
  description: "Save the scripts.",
  input_schema: {
    type: "object" as const,
    properties: {
      scripts: {
        type: "array",
        items: { type: "object", properties: SCRIPT_PROPS, required: ["slot", "title", "format", "hook_family", "first_frame", "on_screen_text", "hook", "points", "cta_1", "beat", "cta_2", "fact_id"] },
      },
    },
    required: ["scripts"],
  },
};

export type GenerateFn = (system: string, user: string) => Promise<string>;

/** Forced-ish tool call like proven-beats.ts (this model only allows tool_choice "auto"). */
export function anthropicGenerate(apiKey = process.env.ANTHROPIC_API_KEY ?? ""): GenerateFn {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  return async (system, user) => {
    const resp = await client.messages.create({
      model: CONTENT_MODEL,
      max_tokens: 16000,
      system,
      tools: [TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: `${user}\n\nAnswer by calling ${TOOL.name}.` }],
    });
    const call = resp.content.find((b) => b.type === "tool_use");
    if (call && call.type === "tool_use") return JSON.stringify(call.input);
    const block = resp.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : `(stop: ${resp.stop_reason})`;
  };
}

// ---------------------------------------------------------------- context

export interface WriterContext {
  week_of: YyyyMmDd;
  /** Proven library rollups (text for the prompt). */
  library: string;
  /** Families for new angles, formats for revivals. */
  strong_families: { family: string; format: string; median_views: number; recent: number; example_hook: string }[];
  revival_formats: string[];
  /** Past tests and rejections (text for the prompt). */
  learnings: string;
  /** Scan items allowed for the adapted slots. */
  scan: ScanItem[];
  /** Test-bank self-tests creators haven't had yet, in bank order (the new self-test slots use these first). */
  bank_tests: BankTest[];
}

const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

export const factsBlock = () =>
  CONTENT_FACTS.map((f) => `- ${f.id}: "${f.line}" NEVER: ${f.never}`).join("\n");

const scanBlock = (items: ScanItem[]) =>
  items
    .map((v, i) =>
      [
        `${i + 1}. ${v.url} (@${v.handle}, ${v.platform}, ${v.niche}, ${k(v.views || (v.likes ?? 0) * 20)} views)`,
        `   caption: ${(v.caption ?? "").slice(0, 200)}`,
        v.transcript?.trim() ? `   transcript: ${v.transcript.trim().slice(0, 900)}` : "   transcript: (none)",
      ].join("\n"),
    )
    .join("\n");

/** Instructions for one source's slots. */
export function sourceBrief(source: ScriptSource, ctx: WriterContext): string {
  switch (source) {
    case "adapted":
      return `These scripts ADAPT viral videos from next-door niches (list below) to our scalp tension message. Pick the strongest relevant videos, one per script, all different. Keep what made the original work (its test, its setup, its hook shape); when it has a transcript, start from its hook. Set reference_url to the exact url you adapted.\n\nVideos you may adapt:\n${scanBlock(ctx.scan) || "(none this week: write strong self-tests instead and set reference_url to null)"}`;
    case "new-self-test":
      if (ctx.bank_tests.length) {
        return `These are NEW self-tests, one per test below, IN THIS ORDER (the first script is test 1, and so on). The hook is that test as a command the viewer does right now at second 0 (tighten the wording if needed), then the fail result. For face, jaw and neck tests, add one hedged bridge: tension there pulls on the same tight layer over the top of the head, or usually comes with a tight scalp. Set reference_url to null.\n\nTests:\n${ctx.bank_tests.map((t, i) => `${i + 1}. [${t.area}] ${t.test} Fail: ${t.fail}.`).join("\n")}`;
      }
      return "These are NEW self-tests: a physical test the viewer can do right now at second 0 (something they touch, press, move or look at), with a clear fail state. Not one already in the library. Set reference_url to null.";
    case "new-angle":
      return `These are NEW ANGLES on strong proven hook families: same core idea, a fresh setup, wording and test. Use one family per script, all different, and keep that family name as hook_family. Set reference_url to null.\n\nFamilies (median views of the originals, videos remade in the last 3 weeks):\n${ctx.strong_families.map((f) => `- "${f.family}" (${f.format}, median ${k(f.median_views)}, ${f.recent} recent): e.g. "${f.example_hook.slice(0, 160)}"`).join("\n")}`;
    case "revival":
      return `These REVIVE strong formats creators haven't used much lately. Use these formats, one per script: ${ctx.revival_formats.join(", ")}. Authority story: someone with a reason to know (a hairdresser, a barber, a doctor friend) said something. Drawing explainer: the creator draws the scalp and the squeezed blood vessels. Third-person personal story: "my friend", "this guy". Myth-bust: a common belief, then why it's wrong. Set reference_url to null.`;
  }
}

export function userPrompt(source: ScriptSource, slots: number[], ctx: WriterContext, extra = ""): string {
  return [
    `Week of ${ctx.week_of}. Write ${slots.length} script(s), slots ${slots.join(", ")}, source "${source}".`,
    sourceBrief(source, ctx),
    `Fact library (the only facts you may use):\n${factsBlock()}`,
    `Proven library:\n${ctx.library}`,
    `What we learned from past weeks:\n${ctx.learnings || "(nothing yet)"}`,
    extra,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Text summaries for the prompt, from Firestore. */
export async function buildContext(weekOf: YyyyMmDd, opts: { db?: Firestore } = {}): Promise<WriterContext> {
  const db = fsdb(opts.db);
  const today = addDaysTo(weekOf, -2);
  const [lib, scan, past] = await Promise.all([loadLibrary({ db }), latestScan({ db }), scriptsSince(addDaysTo(weekOf, -84), { db })]);
  const fams = familyRollups(lib, today);
  const formats = formatRollups(lib, today);
  const strong = strongFamilies(fams);
  const rising = risingFamilies(fams).slice(0, 5);
  const tired = fams.filter((f) => f.tired).slice(0, 10);
  const library = [
    `Formats (active videos, median views, remade in the last 3 weeks): ${formats.map((f) => `${f.format} ${f.count} / ${k(f.median_views)} / ${f.recent}`).join("; ")}`,
    `Tired families (avoid): ${tired.map((f) => `"${f.family}"`).join(", ") || "none"}`,
    `Rising families (recent remakes beat creators' normal): ${rising.map((f) => `"${f.family}"`).join(", ") || "none"}`,
    `Top families: ${[...fams].sort((a, b) => b.median_views - a.median_views).slice(0, 12).map((f) => `"${f.family}" (${f.format}, ${k(f.median_views)})`).join("; ")}`,
  ].join("\n");

  // Past tests: approved scripts whose idea has a result.
  const ideaIds = past.filter((s) => s.idea_id).map((s) => s.idea_id!);
  const ideas = new Map<string, Pick<ProvenVideo, "test_result" | "test">>();
  for (let i = 0; i < ideaIds.length; i += 100) {
    const snaps = await db.getAll(...ideaIds.slice(i, i + 100).map((id) => db.collection(PROVEN_COLLECTION).doc(id)));
    for (const s of snaps) if (s.exists) ideas.set(s.id, { test_result: s.get("test_result"), test: s.get("test") });
  }
  const judged = past
    .filter((s) => s.idea_id && ideas.get(s.idea_id)?.test_result)
    .map((s) => ({ s, r: ideas.get(s.idea_id!)!.test_result!, best: ideas.get(s.idea_id!)!.test?.best_views ?? null }));
  const line = (rows: { key: string; tested: number; won: number }[]) => rows.map((r) => `${r.key} ${r.won}/${r.tested}`).join(", ") || "none yet";
  const learnings = [
    `Wins by format: ${line(tally(judged, (x) => x.s.format, (x) => x.r === "promoted"))}`,
    `Wins by source: ${line(tally(judged, (x) => x.s.source, (x) => x.r === "promoted"))}`,
    judged.length ? `Recent results:\n${judged.slice(0, 15).map((x) => `- ${x.r === "promoted" ? "WON" : x.r.toUpperCase()} "${x.s.title}" (${x.s.format}, ${x.s.source}, best ${x.best == null ? "?" : k(x.best)}): ${x.s.hook}`).join("\n")}` : "",
    (() => {
      const r = rejectionLessons(past);
      return r.length ? `Rejected by the founder (learn from the reasons):\n${r.map((x) => `- "${x.title}": ${x.hook} REASON: ${x.reason}`).join("\n")}` : "";
    })(),
  ]
    .filter(Boolean)
    .join("\n");

  const used = new Set(past.map((s) => s.reference?.url).filter((u): u is string => !!u));
  // Bank tests already given to creators (any week, any status but replaced) or already proven with creators.
  const bankUsed = new Set([...CREATOR_TESTED_BANK_IDS, ...past.filter((s) => s.bank_id && s.status !== "replaced").map((s) => s.bank_id!)]);
  return {
    week_of: weekOf,
    library,
    strong_families: strong.map((f) => ({ family: f.family, format: f.format, median_views: f.median_views, recent: f.recent, example_hook: f.top.hook })),
    revival_formats: revivalFormats(formats),
    learnings,
    scan: adaptCandidates(scanItems(scan?.items ?? null), used),
    bank_tests: TEST_BANK.filter((t) => !bankUsed.has(t.id)),
  };
}

// ---------------------------------------------------------------- drafting

export interface Drafted extends CleanScript {
  reference: ScriptReference | null;
}

/** Ask, validate, retry once with the problems. Adapted scripts must name a listed url (or none when the list is empty). */
export async function draftSlots(source: ScriptSource, slots: number[], ctx: WriterContext, generate: GenerateFn, extra = ""): Promise<Drafted[]> {
  const user = userPrompt(source, slots, ctx, extra);
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await generate(CONTENT_SYSTEM, attempt ? `${user}\n\nYour last answer broke these rules, fix them:\n- ${problems.join("\n- ")}` : user);
    const r = parseScripts(raw, slots);
    if (!r.ok) {
      problems = r.problems;
      continue;
    }
    const refs = referencesOf(raw, source, ctx.scan);
    if (!refs.ok) {
      problems = refs.problems;
      continue;
    }
    return r.scripts.map((s, i) => ({ ...s, reference: refs.refs[i] ?? null }));
  }
  throw new Error(`${source} slots ${slots.join(",")}: ${problems.slice(0, 6).join("; ")}`.slice(0, 500));
}

function referencesOf(raw: string, source: ScriptSource, scan: ScanItem[]): { ok: true; refs: (ScriptReference | null)[] } | { ok: false; problems: string[] } {
  if (source !== "adapted" || !scan.length) return { ok: true, refs: [] };
  let list: { reference_url?: unknown }[] = [];
  try {
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    list = typeof j.scripts === "string" ? JSON.parse(j.scripts) : j.scripts;
  } catch {
    return { ok: false, problems: ["output is not valid JSON"] };
  }
  const byUrl = new Map(scan.map((v) => [v.url, v]));
  const refs: ScriptReference[] = [];
  const problems: string[] = [];
  list.forEach((x, i) => {
    const v = byUrl.get(String(x?.reference_url ?? ""));
    if (!v) problems.push(`script ${i + 1}: reference_url must be one of the listed video urls`);
    else refs.push({ url: v.url, handle: v.handle, views: v.views || 0, platform: v.platform });
  });
  if (new Set(refs.map((r) => r.url)).size !== refs.length) problems.push("each adapted script needs a different video");
  return problems.length ? { ok: false, problems } : { ok: true, refs };
}

/** Slots grouped by source, in slot order. */
export function slotGroups(mix: readonly ScriptSource[] = WEEK_MIX): { source: ScriptSource; slots: number[] }[] {
  const out: { source: ScriptSource; slots: number[] }[] = [];
  mix.forEach((source, i) => {
    const g = out.find((x) => x.source === source);
    if (g) g.slots.push(i + 1);
    else out.push({ source, slots: [i + 1] });
  });
  return out;
}

const newScriptId = (weekOf: string, slot: number) => `${weekOf}_s${String(slot).padStart(2, "0")}_${Math.random().toString(36).slice(2, 8)}`;

export function toContentScript(d: Drafted, weekOf: YyyyMmDd, source: ScriptSource, nowIso: string, extra: Partial<ContentScript> = {}): ContentScript {
  const f = factById(d.fact_id);
  return {
    id: newScriptId(weekOf, d.slot),
    week_of: weekOf,
    slot: d.slot,
    source,
    format: d.format,
    hook_family: d.hook_family,
    title: d.title,
    first_frame: d.first_frame,
    on_screen_text: d.on_screen_text,
    hook: d.hook,
    points: d.points,
    cta_1: d.cta_1,
    beat: d.beat,
    cta_2: d.cta_2,
    fact: f ? { id: f.id, line: f.line, source: f.source } : null,
    photo: null,
    reference: d.reference,
    status: "draft",
    history: [{ at: nowIso, kind: "drafted" }],
    ...extra,
  };
}

/**
 * The week's 10 scripts. Skips a week that already has live scripts (unless
 * `force`). Groups that fail are left out and the week records the error;
 * whatever was drafted is kept.
 */
export async function draftWeek(
  weekOf: YyyyMmDd,
  opts: { db?: Firestore; generate?: GenerateFn; force?: boolean; now?: Date } = {},
): Promise<WeekPayload & { errors: string[] }> {
  const db = fsdb(opts.db);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf) || new Date(`${weekOf}T00:00:00Z`).getUTCDay() !== 1) throw new CreatorDataError("week_of must be a Monday (YYYY-MM-DD).");
  const nowIso = (opts.now ?? new Date()).toISOString();
  const existing = await weekScripts(weekOf, { db });
  const live = existing.filter((s) => s.status === "draft" || s.status === "approved");
  const wref = db.collection(WEEKS_COLLECTION).doc(weekOf);
  if (live.length >= SCRIPTS_PER_WEEK && !opts.force) return { ...(await weekPayload(weekOf, { db })), errors: [] };
  const prev = (await wref.get()).data() ?? {};
  await wref.set({ state: "drafting", draft_started_at: nowIso, draft_attempts: Number(prev.draft_attempts ?? 0) + 1, script_ids: prev.script_ids ?? [], drafted_at: prev.drafted_at ?? null, pushed_at: prev.pushed_at ?? null }, { merge: true });

  const generate = opts.generate ?? anthropicGenerate();
  const ctx = await buildContext(weekOf, { db });
  const filled = new Set(opts.force ? [] : live.map((s) => s.slot));
  const groups = slotGroups()
    .map((g) => ({ ...g, slots: g.slots.filter((s) => !filled.has(s)) }))
    .filter((g) => g.slots.length);
  const errors: string[] = [];
  const results = await Promise.all(
    groups.map((g) => {
      // New self-tests take the next unused bank tests, one per slot, and remember which.
      const bank = g.source === "new-self-test" ? ctx.bank_tests.slice(0, g.slots.length) : [];
      const gctx = bank.length ? { ...ctx, bank_tests: bank } : { ...ctx, bank_tests: [] };
      return draftSlots(g.source, g.slots, gctx, generate).then(
        (list) => list.map((d, i) => toContentScript(d, weekOf, g.source, nowIso, bank[i] ? { bank_id: bank[i].id } : {})),
        (e) => {
          errors.push(e instanceof Error ? e.message : String(e));
          return [] as ContentScript[];
        },
      );
    }),
  );
  const batch = db.batch();
  if (opts.force) for (const s of live.filter((x) => x.status === "draft")) batch.set(db.collection(SCRIPTS_COLLECTION).doc(s.id), { status: "replaced" }, { merge: true });
  for (const s of results.flat()) batch.set(db.collection(SCRIPTS_COLLECTION).doc(s.id), s);
  batch.set(wref, { drafted_at: nowIso, draft_error: errors.join(" | ").slice(0, 1500) }, { merge: true });
  await batch.commit();
  const week = await syncWeek(weekOf, { db });
  return { ...week, errors };
}

/** Reject a draft and draft one replacement (same slot and source) that avoids the reason. */
export async function rejectScript(
  id: string,
  reason: string,
  opts: { db?: Firestore; generate?: GenerateFn; now?: Date } = {},
): Promise<{ script: ContentScript; replacement: ContentScript | null }> {
  const db = fsdb(opts.db);
  const cur = await getScript(id, { db });
  if (!cur) throw new CreatorDataError("Script not found.");
  if (cur.status === "approved") throw new CreatorDataError("This script is already approved.");
  const nowIso = (opts.now ?? new Date()).toISOString();
  const why = String(reason ?? "").trim().slice(0, 1000);
  let replacement: ContentScript | null = null;
  try {
    const ctx = await buildContext(cur.week_of, { db });
    // An adapted replacement may not reuse the rejected video.
    if (cur.reference) ctx.scan = ctx.scan.filter((v) => v.url !== cur.reference!.url);
    const extra = `The founder REJECTED this script for slot ${cur.slot}${why ? ` because: "${why}"` : " (no reason given)"}. Write a different one that fixes that.\nRejected script: ${JSON.stringify({ title: cur.title, hook: cur.hook, points: cur.points, cta_2: cur.cta_2 })}`;
    const [d] = await draftSlots(cur.source, [cur.slot], ctx, opts.generate ?? anthropicGenerate(), extra);
    replacement = toContentScript(d, cur.week_of, cur.source, nowIso, { replaces: cur.id });
  } catch (e) {
    console.error("content replacement failed:", e);
  }
  const script: ContentScript = {
    ...cur,
    status: replacement ? "replaced" : "rejected",
    ...(why ? { reject_reason: why } : {}),
    history: [...cur.history, { at: nowIso, kind: "reject", ...(why ? { note: why } : {}) }],
  };
  const batch = db.batch();
  batch.set(db.collection(SCRIPTS_COLLECTION).doc(id), { status: script.status, reject_reason: why || null, history: script.history }, { merge: true });
  if (replacement) batch.set(db.collection(SCRIPTS_COLLECTION).doc(replacement.id), replacement);
  await batch.commit();
  await syncWeek(cur.week_of, { db });
  return { script, replacement };
}

/** Rewrite one draft from the founder's note (status stays draft); records which fields changed. */
export async function voiceEdit(
  id: string,
  note: string,
  opts: { db?: Firestore; generate?: GenerateFn; now?: Date; ctx?: WriterContext } = {},
): Promise<{ script: ContentScript; changed: string[] }> {
  const db = fsdb(opts.db);
  const cur = await getScript(id, { db });
  if (!cur) throw new CreatorDataError("Script not found.");
  const n = String(note ?? "").trim().slice(0, 2000);
  if (!n) throw new CreatorDataError("Say what to change.");
  const ctx = opts.ctx ?? (await buildContext(cur.week_of, { db }));
  if (cur.reference) ctx.scan = [{ url: cur.reference.url, handle: cur.reference.handle, platform: cur.reference.platform, views: cur.reference.views, niche: "hair", caption: "" }];
  const extra = `REWRITE this existing script following the founder's note. Change only what the note asks for (and what it forces), keep everything else word for word.${cur.reference ? ` Keep reference_url "${cur.reference.url}".` : ""}\nFounder's note: "${n}"\nCurrent script: ${JSON.stringify({ slot: cur.slot, title: cur.title, format: cur.format, hook_family: cur.hook_family, first_frame: cur.first_frame, on_screen_text: cur.on_screen_text, hook: cur.hook, points: cur.points, cta_1: cur.cta_1, beat: cur.beat, cta_2: cur.cta_2, fact_id: cur.fact?.id ?? null })}`;
  const [d] = await draftSlots(cur.source, [cur.slot], ctx, opts.generate ?? anthropicGenerate(), extra);
  const f = factById(d.fact_id);
  const next: ContentScript = {
    ...cur,
    title: d.title,
    format: d.format,
    hook_family: d.hook_family,
    first_frame: d.first_frame,
    on_screen_text: d.on_screen_text,
    hook: d.hook,
    points: d.points,
    cta_1: d.cta_1,
    beat: d.beat,
    cta_2: d.cta_2,
    fact: f ? { id: f.id, line: f.line, source: f.source } : null,
  };
  const changed = changedFields(cur, next);
  next.history = [...cur.history, { at: (opts.now ?? new Date()).toISOString(), kind: "voice", note: n, ...(changed.length ? { changed } : {}) }];
  const { id: _id, ...doc } = next;
  void _id;
  await db.collection(SCRIPTS_COLLECTION).doc(id).set(doc);
  return { script: next, changed };
}

/** The founder's note applied to every draft of the week (one at a time; a failure leaves that draft as it was). */
export async function weekVoice(weekOf: string, note: string, opts: { db?: Firestore; generate?: GenerateFn; now?: Date } = {}): Promise<WeekPayload> {
  const db = fsdb(opts.db);
  const drafts = (await weekScripts(weekOf, { db })).filter((s) => s.status === "draft");
  if (!drafts.length) return weekPayload(weekOf, { db });
  const ctx = await buildContext(weekOf as YyyyMmDd, { db });
  const generate = opts.generate ?? anthropicGenerate();
  const queue = [...drafts];
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        await voiceEdit(s.id, note, { db, generate, now: opts.now, ctx: { ...ctx, scan: [...ctx.scan] } }).catch((e) => console.error("week voice failed:", s!.id, e));
      }
    }),
  );
  return weekPayload(weekOf, { db });
}
