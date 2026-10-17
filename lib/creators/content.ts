/**
 * Content system: the founder's weekly new scripts (pure rules, no Firestore).
 * Storage + jobs: content-db.ts; drafting with Claude: content-writer.ts;
 * the founder app's Content page: lib/founder/content.ts.
 *
 *   ContentScripts/{id}       ContentScript (contract "Script")
 *   ContentWeeks/{week_of}    ContentWeek { state, script_ids, drafted_at, pushed_at }
 *
 * A week is 10 scripts for the Monday it runs: 3 adapted from the latest
 * niche scan, 3 new self-tests, 2 new angles on strong proven hook families,
 * 2 revivals of strong under-used formats. On approve a script becomes a
 * ProvenVideos idea scheduled into that week (addIdeaBatch semantics).
 */
import { factById } from "./content-facts";
import { PROVEN_FORMATS, addDaysTo, type ProvenFormat } from "./proven";
import type { YyyyMmDd } from "./types";

export const SCRIPTS_COLLECTION = "ContentScripts";
export const WEEKS_COLLECTION = "ContentWeeks";
export const SCRIPTS_PER_WEEK = 10;

export type ScriptSource = "new-self-test" | "adapted" | "new-angle" | "revival";
export const SCRIPT_SOURCES: readonly ScriptSource[] = ["new-self-test", "adapted", "new-angle", "revival"];
export type ScriptStatus = "draft" | "approved" | "rejected" | "replaced";
export type HistoryKind = "drafted" | "voice" | "edit" | "reject" | "approve";

export interface ScriptPhoto {
  point: 1 | 2 | 3;
  url: string;
  caption: string;
}

export interface ScriptReference {
  url: string;
  handle: string;
  views: number;
  platform: "tiktok" | "instagram";
}

export interface ContentScript {
  id: string;
  week_of: YyyyMmDd;
  slot: number;
  source: ScriptSource;
  format: ProvenFormat;
  hook_family: string;
  title: string;
  first_frame: string;
  on_screen_text: string;
  hook: string;
  points: [string, string, string];
  cta_1: string;
  beat: string;
  cta_2: string;
  fact: { id: string; line: string; source: string } | null;
  photo: ScriptPhoto | null;
  reference: ScriptReference | null;
  status: ScriptStatus;
  reject_reason?: string;
  replaces?: string;
  history: { at: string; kind: HistoryKind; note?: string; changed?: string[] }[];
  idea_id?: string;
}

export type WeekState = "none" | "drafting" | "ready" | "approved";

export interface ContentWeek {
  state: WeekState;
  script_ids: string[];
  drafted_at: string | null;
  pushed_at: string | null;
  /** Drafting bookkeeping (the cron retries a failed draft). */
  draft_started_at?: string | null;
  draft_error?: string;
  draft_attempts?: number;
}

/** Slot -> source for a week of 10. */
export const WEEK_MIX: readonly ScriptSource[] = [
  "adapted", "adapted", "adapted",
  "new-self-test", "new-self-test", "new-self-test",
  "new-angle", "new-angle",
  "revival", "revival",
];

export const sourceForSlot = (slot: number): ScriptSource => WEEK_MIX[slot - 1] ?? "new-self-test";

/** Formats a revival may bring back. */
export const REVIVAL_FORMATS: readonly ProvenFormat[] = ["authority-story", "explainer", "personal-story", "myth-bust"];

/** The Monday a week's scripts run for, from any day: Monday itself stays, any other day -> the next Monday. */
export function weekOfFor(day: YyyyMmDd): YyyyMmDd {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return dow === 1 ? day : addDaysTo(day, (8 - dow) % 7);
}

/** The approve "cta" for the creator app: cta_1, the beat, cta_2 as three paragraphs. */
export const scriptCta = (s: Pick<ContentScript, "cta_1" | "beat" | "cta_2">): string =>
  [s.cta_1, s.beat, s.cta_2].map((x) => x.trim()).filter(Boolean).join("\n\n");

// ---------------------------------------------------------------- validation

const DASH = /[—–]/;
const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** Text fields that are read aloud or shown. */
export const TEXT_FIELDS = ["title", "first_frame", "on_screen_text", "hook", "cta_1", "beat", "cta_2"] as const;

/** Banned phrases (the writing rules). Lowercase match. */
export const BANNED_PHRASES = [
  "link in bio", "link in my bio", "comment below", "comment yes", "follow me", "follow for", "hit follow",
  "not selling anything", "i'm not paid", "not getting paid", "not sponsored", "i fixed my hair", "i regrew", "my hair grew back",
];

export interface RawScript {
  slot?: unknown;
  title?: unknown;
  format?: unknown;
  hook_family?: unknown;
  first_frame?: unknown;
  on_screen_text?: unknown;
  hook?: unknown;
  points?: unknown;
  cta_1?: unknown;
  beat?: unknown;
  cta_2?: unknown;
  fact_id?: unknown;
}

export interface CleanScript {
  slot: number;
  title: string;
  format: ProvenFormat;
  hook_family: string;
  first_frame: string;
  on_screen_text: string;
  hook: string;
  points: [string, string, string];
  cta_1: string;
  beat: string;
  cta_2: string;
  fact_id: string | null;
}

/** Problems with one model script ([] = usable). */
export function scriptProblems(raw: RawScript): string[] {
  const p: string[] = [];
  for (const k of [...TEXT_FIELDS, "hook_family"] as const) if (!str(raw[k])) p.push(`missing ${k}`);
  const points = Array.isArray(raw.points) ? raw.points.map(str) : [];
  if (points.length !== 3 || points.some((x) => !x)) p.push("points must be exactly 3 non-empty strings");
  if (!(PROVEN_FORMATS as readonly string[]).includes(str(raw.format))) p.push(`unknown format "${str(raw.format)}"`);
  const all = [...TEXT_FIELDS.map((k) => str(raw[k])), ...points, str(raw.hook_family)];
  if (all.some((t) => DASH.test(t))) p.push("em dash or en dash used");
  const low = all.join(" ").toLowerCase();
  for (const b of BANNED_PHRASES) if (low.includes(b)) p.push(`banned phrase "${b}"`);
  const ost = str(raw.on_screen_text);
  if (ost && ost !== ost.toLowerCase()) p.push("on_screen_text must be lowercase");
  const fid = raw.fact_id == null || raw.fact_id === "" ? null : str(raw.fact_id);
  if (fid && !factById(fid)) p.push(`unknown fact id "${fid}"`);
  if (!/pinned/i.test(str(raw.cta_1)) || !/watch this first/i.test(str(raw.cta_1))) p.push('cta_1 must point to "my pinned video, the one that says watch this first"');
  // Spoken length: about 30-45 seconds (roughly 75-140 words at talking speed).
  const words = [str(raw.hook), ...points, str(raw.cta_1), str(raw.beat), str(raw.cta_2)].join(" ").split(/\s+/).filter(Boolean).length;
  if (words < 60 || words > 170) p.push(`spoken length ${words} words (want about 75-140)`);
  return p;
}

export function cleanScript(raw: RawScript, slot: number): CleanScript {
  const points = (raw.points as unknown[]).map(str) as [string, string, string];
  const fid = raw.fact_id == null || raw.fact_id === "" ? null : str(raw.fact_id);
  return {
    slot,
    title: str(raw.title).slice(0, 60),
    format: str(raw.format) as ProvenFormat,
    hook_family: str(raw.hook_family).slice(0, 120),
    first_frame: str(raw.first_frame),
    on_screen_text: str(raw.on_screen_text),
    hook: str(raw.hook),
    points,
    cta_1: str(raw.cta_1),
    beat: str(raw.beat),
    cta_2: str(raw.cta_2),
    fact_id: fid,
  };
}

/**
 * The model's answer ({ scripts: [...] }) -> clean scripts for `slots`, or the
 * problems found. Also rejects two scripts with the same cta_2 or beat.
 */
export function parseScripts(raw: unknown, slots: number[]): { ok: true; scripts: CleanScript[] } | { ok: false; problems: string[] } {
  let j: unknown = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    try {
      j = a >= 0 && b > a ? JSON.parse(s.slice(a, b + 1)) : null;
    } catch {
      return { ok: false, problems: ["output is not valid JSON"] };
    }
  }
  let list = (j as { scripts?: unknown })?.scripts;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      /* handled below */
    }
  }
  if (!Array.isArray(list)) return { ok: false, problems: ['no "scripts" array'] };
  if (list.length !== slots.length) return { ok: false, problems: [`wanted ${slots.length} scripts, got ${list.length}`] };
  const problems: string[] = [];
  list.forEach((r, i) => scriptProblems((r ?? {}) as RawScript).forEach((x) => problems.push(`script ${i + 1}: ${x}`)));
  if (problems.length) return { ok: false, problems };
  const scripts = list.map((r, i) => cleanScript(r as RawScript, slots[i]));
  const dup = (k: "cta_2" | "beat") => new Set(scripts.map((s) => s[k].toLowerCase())).size !== scripts.length;
  if (dup("cta_2")) problems.push("two scripts share the same cta_2");
  if (dup("beat")) problems.push("two scripts share the same beat");
  return problems.length ? { ok: false, problems } : { ok: true, scripts };
}

/** Fields a founder edit may change. */
export const EDITABLE_FIELDS = [
  "title", "format", "hook_family", "first_frame", "on_screen_text", "hook", "points", "cta_1", "beat", "cta_2", "fact", "photo",
] as const;

/** Which of `fields` differ between two versions (points compared as a list). */
export function changedFields(a: Partial<ContentScript>, b: Partial<ContentScript>, fields: readonly string[] = EDITABLE_FIELDS): string[] {
  return fields.filter((f) => JSON.stringify((a as Record<string, unknown>)[f] ?? null) !== JSON.stringify((b as Record<string, unknown>)[f] ?? null));
}

/** A founder's edit fields -> a clean patch (unknown / invalid fields dropped). Throws on an em dash or a bad fact id. */
export function editPatch(fields: Record<string, unknown>): Partial<ContentScript> {
  const out: Partial<ContentScript> = {};
  for (const k of ["title", "hook_family", "first_frame", "on_screen_text", "hook", "cta_1", "beat", "cta_2"] as const) {
    if (k in fields) {
      const v = str(fields[k]);
      if (DASH.test(v)) throw new Error(`No em dashes (${k}).`);
      out[k] = k === "on_screen_text" ? v.toLowerCase() : v;
    }
  }
  if ("format" in fields) {
    const f = str(fields.format);
    if (!(PROVEN_FORMATS as readonly string[]).includes(f)) throw new Error(`Unknown format "${f}".`);
    out.format = f as ProvenFormat;
  }
  if ("points" in fields) {
    const p = Array.isArray(fields.points) ? fields.points.map(str) : [];
    if (p.length !== 3 || p.some((x) => !x)) throw new Error("points must be 3 lines.");
    if (p.some((x) => DASH.test(x))) throw new Error("No em dashes (points).");
    out.points = p as [string, string, string];
  }
  if ("fact" in fields) {
    const f = fields.fact as { id?: unknown } | null;
    if (f == null) out.fact = null;
    else {
      const hit = factById(str(f.id));
      if (!hit) throw new Error("Unknown fact.");
      out.fact = { id: hit.id, line: hit.line, source: hit.source };
    }
  }
  if ("photo" in fields) {
    const ph = fields.photo as { point?: unknown; url?: unknown; caption?: unknown } | null;
    if (ph == null) out.photo = null;
    else {
      const point = Number(ph.point);
      const url = str(ph.url);
      if (![1, 2, 3].includes(point) || !/^https:\/\//.test(url)) throw new Error("photo needs point 1-3 and an https url.");
      out.photo = { point: point as 1 | 2 | 3, url, caption: str(ph.caption) };
    }
  }
  return out;
}

// ---------------------------------------------------------------- approve

/** What an approved script becomes on the idea doc (addIdeaBatch input). */
export function ideaInputFromScript(s: ContentScript): {
  hook_line: string;
  talking_points: string[];
  reference_url?: string;
  idea_text: string;
  id_prefix: string;
  script: {
    hook_full: string;
    cta_line: string;
    short_title: string;
    header_text: string;
    first_frame: string;
    on_screen_text: string;
    photo?: ScriptPhoto;
    format: ProvenFormat;
    hook_family: string;
    content_script_id: string;
  };
} {
  return {
    hook_line: s.hook,
    talking_points: [...s.points],
    ...(s.reference?.url ? { reference_url: s.reference.url } : {}),
    idea_text: `${s.title} (${s.source}, week of ${s.week_of})`,
    id_prefix: `c${s.week_of.replace(/-/g, "")}s${String(s.slot).padStart(2, "0")}`,
    script: {
      hook_full: s.hook,
      cta_line: scriptCta(s),
      short_title: s.title,
      // Older app builds show header_text as the on-screen text.
      header_text: s.on_screen_text,
      first_frame: s.first_frame,
      on_screen_text: s.on_screen_text,
      ...(s.photo ? { photo: s.photo } : {}),
      format: s.format,
      hook_family: s.hook_family,
      content_script_id: s.id,
    },
  };
}

/** The script with defaults (older / partial docs never crash readers). */
export function toScript(id: string, d: Record<string, unknown>): ContentScript {
  const pts = Array.isArray(d.points) ? d.points.map(String) : [];
  return {
    id,
    week_of: String(d.week_of ?? ""),
    slot: Number(d.slot ?? 0),
    source: (SCRIPT_SOURCES as readonly string[]).includes(String(d.source)) ? (d.source as ScriptSource) : "new-self-test",
    format: (PROVEN_FORMATS as readonly string[]).includes(String(d.format)) ? (d.format as ProvenFormat) : "other",
    hook_family: String(d.hook_family ?? ""),
    title: String(d.title ?? ""),
    first_frame: String(d.first_frame ?? ""),
    on_screen_text: String(d.on_screen_text ?? ""),
    hook: String(d.hook ?? ""),
    points: [pts[0] ?? "", pts[1] ?? "", pts[2] ?? ""],
    cta_1: String(d.cta_1 ?? ""),
    beat: String(d.beat ?? ""),
    cta_2: String(d.cta_2 ?? ""),
    fact: (d.fact as ContentScript["fact"]) ?? null,
    photo: (d.photo as ScriptPhoto | null) ?? null,
    reference: (d.reference as ScriptReference | null) ?? null,
    status: (["draft", "approved", "rejected", "replaced"].includes(String(d.status)) ? d.status : "draft") as ScriptStatus,
    ...(typeof d.reject_reason === "string" ? { reject_reason: d.reject_reason } : {}),
    ...(typeof d.replaces === "string" ? { replaces: d.replaces } : {}),
    history: Array.isArray(d.history) ? (d.history as ContentScript["history"]) : [],
    ...(typeof d.idea_id === "string" ? { idea_id: d.idea_id } : {}),
  };
}

/** A week's state from its scripts (the stored state wins while drafting). */
export function weekStateOf(stored: WeekState | undefined, scripts: Pick<ContentScript, "status">[]): WeekState {
  if (stored === "drafting" && !scripts.length) return "drafting";
  const live = scripts.filter((s) => s.status === "draft" || s.status === "approved");
  if (!live.length) return stored === "drafting" ? "drafting" : "none";
  return live.every((s) => s.status === "approved") ? "approved" : "ready";
}
