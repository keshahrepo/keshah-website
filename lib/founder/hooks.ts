/**
 * Founder app Content tab: the core script's hooks (lib/creators/script-core.ts).
 * Every hook is a ProvenVideos doc with a `core` field: testing (given as one of
 * the day's 2 new hooks), proven (given as one of the 3 proven ones) or retired.
 * Performance counts only core-era remakes (from CORE_START), each measured
 * against the remaking creator's normal views.
 */

import { randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CORE_START, PROVEN_COLLECTION, coreReferenceViews, type CoreHookStatus, type ProvenRemake } from "@/lib/creators/proven";
import { toProven } from "@/lib/creators/proven-db";
import { coreLines } from "@/lib/creators/script-core";
import type { ScriptLine } from "@/lib/creators/proven";

export { CORE_START };
/** A testing hook with a post at this many views is ready for a call right away. */
export const HOOK_READY_VIEWS = 100_000;
/** Judged posts a testing hook needs before Promote / Retire is suggested (or one post at HOOK_READY_VIEWS). */
export const HOOK_READY_JUDGED = 6;

export interface FounderHook {
  id: string;
  text: string;
  status: CoreHookStatus;
  /** The original (proven) or the reference video (new), null when none. */
  video_url: string | null;
  /** Views of that original; 0 for a reference we don't track. */
  original_views: number;
  added_at: string;
  /** Core-era posts of this hook, how many are old enough to judge, and their median views vs each creator's normal. */
  posts: number;
  judged: number;
  vs_normal: number | null;
  best_views: number | null;
  /** A testing hook ready for a call: enough judged posts, or one post at 100K+. */
  ready: boolean;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Performance from a hook's remakes (pure, tested). */
export function hookPerformance(remakes: Pick<ProvenRemake, "date" | "judged" | "ratio" | "views">[], start = CORE_START) {
  const rs = remakes.filter((r) => r.date >= start);
  const judged = rs.filter((r) => r.judged && r.ratio != null);
  const best = rs.flatMap((r) => [r.views.tiktok, r.views.instagram]).filter((v): v is number => typeof v === "number");
  const vs = median(judged.map((r) => r.ratio!));
  return {
    posts: rs.length,
    judged: judged.length,
    vs_normal: vs == null ? null : Math.round(vs * 100) / 100,
    best_views: best.length ? Math.max(...best) : null,
  };
}

const db = (d?: Firestore) => d ?? getFirebaseAdmin().db;

export async function listHooks(opts: { db?: Firestore } = {}): Promise<FounderHook[]> {
  const fs = db(opts.db);
  const snap = await fs.collection(PROVEN_COLLECTION).where("core.status", "in", ["testing", "proven", "retired"]).get();
  const out = await Promise.all(
    snap.docs.map(async (d) => {
      const v = toProven(d.data());
      if (!v.core) return null;
      const remakes = await d.ref.collection("remakes").where("date", ">=", CORE_START).get();
      const perf = hookPerformance(remakes.docs.map((r) => r.data() as ProvenRemake));
      const hook: FounderHook = {
        id: d.id,
        text: v.core.text,
        status: v.core.status,
        video_url: v.core.reference?.url || v.source_url || v.reference_url || null,
        original_views: coreReferenceViews(v),
        added_at: v.core.added_at,
        ...perf,
        ready: v.core.status === "testing" && (perf.judged >= HOOK_READY_JUDGED || (perf.best_views ?? 0) >= HOOK_READY_VIEWS),
      };
      return hook;
    }),
  );
  const order: Record<CoreHookStatus, number> = { testing: 0, proven: 1, retired: 2 };
  return out
    .filter((h): h is FounderHook => !!h)
    .sort((a, b) => order[a.status] - order[b.status] || Number(b.ready) - Number(a.ready) || (b.vs_normal ?? -1) - (a.vs_normal ?? -1) || b.original_views - a.original_views);
}

export class HookInputError extends Error {}

function cleanUrl(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (!/^https?:\/\/\S+$/i.test(s)) throw new HookInputError("That link doesn't look right.");
  return s;
}

/** A new hook the founder typed: tested as one of the day's new hooks from tomorrow. */
export async function addHook(input: { text?: unknown; reference_url?: unknown }, opts: { db?: Firestore; now?: Date } = {}): Promise<string> {
  const text = typeof input.text === "string" ? input.text.trim().replace(/\s+/g, " ") : "";
  if (text.length < 10) throw new HookInputError("Write the hook and its verdict.");
  if (text.length > 600) throw new HookInputError("That's too long for a hook.");
  const reference_url = cleanUrl(input.reference_url);
  const now = (opts.now ?? new Date()).toISOString();
  const id = `hook_${now.slice(0, 10).replace(/-/g, "")}_${randomBytes(4).toString("hex")}`;
  await db(opts.db)
    .collection(PROVEN_COLLECTION)
    .doc(id)
    .create({
      source_url: null,
      platform: null,
      handle: null,
      posted_at: null,
      views: 0,
      caption: "",
      transcript: "",
      hook_line: text,
      hook_full: text,
      status: "active",
      added_by: "founder_idea",
      created_at: now,
      approved_at: now,
      remake_count: 0,
      last_used_at: null,
      ...(reference_url ? { reference_url } : {}),
      core: { text, status: "testing", added_at: now },
    });
  return id;
}

/** Promote a testing hook (given as proven from tomorrow), retire one, or bring a retired one back to testing. */
export async function setHookStatus(id: string, action: "promote" | "retire" | "restore", opts: { db?: Firestore; now?: Date } = {}): Promise<void> {
  const ref = db(opts.db).collection(PROVEN_COLLECTION).doc(id);
  const snap = await ref.get();
  const core = snap.exists ? toProven(snap.data()!).core : undefined;
  if (!core) throw new HookInputError("That hook doesn't exist.");
  const now = (opts.now ?? new Date()).toISOString();
  if (action === "promote") {
    if (core.status !== "testing") throw new HookInputError("Only a hook in testing can be promoted.");
    await ref.update({ "core.status": "proven", "core.promoted_at": now, status: "active" });
  } else if (action === "retire") {
    if (core.status === "retired") return;
    await ref.update({ "core.status": "retired", "core.retired_at": now });
  } else {
    if (core.status !== "retired") return;
    await ref.update({ "core.status": "testing", "core.retired_at": null });
  }
}

/** The full script a creator would get for this hook (`version` picks another rotation of the lines). */
export async function previewHook(id: string, version = 0, opts: { db?: Firestore } = {}): Promise<ScriptLine[]> {
  const snap = await db(opts.db).collection(PROVEN_COLLECTION).doc(id).get();
  const core = snap.exists ? toProven(snap.data()!).core : undefined;
  if (!core) throw new HookInputError("That hook doesn't exist.");
  return coreLines(core.text, id, `preview|${version}`, version % 5, core);
}
