/**
 * Content system storage + founder actions (rules in content.ts, drafting in
 * content-writer.ts).
 *
 *   ContentScripts/{id}       ContentScript
 *   ContentWeeks/{week_of}    ContentWeek
 *
 * approve: the script becomes a ProvenVideos idea scheduled into its week with
 * addIdeaBatch (2 ideas per full creator per day, earlier slots first).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CreatorDataError } from "./db";
import {
  SCRIPTS_COLLECTION,
  WEEKS_COLLECTION,
  changedFields,
  editPatch,
  ideaInputFromScript,
  toScript,
  weekStateOf,
  type ContentScript,
  type ContentWeek,
  type WeekState,
} from "./content";
import type { LibVideo, ScanItem } from "./content-select";
import { addIdeaBatch } from "./proven-db";
import { PROVEN_COLLECTION } from "./proven";

export function fsdb(db?: Firestore): Firestore {
  return db ?? getFirebaseAdmin().db;
}

export interface WeekPayload {
  week_of: string;
  state: WeekState;
  to_review: number;
  scripts: ContentScript[];
}

export async function getScript(id: string, opts: { db?: Firestore } = {}): Promise<ContentScript | null> {
  const s = await fsdb(opts.db).collection(SCRIPTS_COLLECTION).doc(id).get();
  return s.exists ? toScript(s.id, s.data()!) : null;
}

/** Every script of a week (all statuses), by slot. */
export async function weekScripts(weekOf: string, opts: { db?: Firestore } = {}): Promise<ContentScript[]> {
  const snap = await fsdb(opts.db).collection(SCRIPTS_COLLECTION).where("week_of", "==", weekOf).get();
  return snap.docs.map((d) => toScript(d.id, d.data())).sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id));
}

/** Scripts from `fromWeek` on (all statuses), for learning and the tests page. */
export async function scriptsSince(fromWeek: string, opts: { db?: Firestore } = {}): Promise<ContentScript[]> {
  const snap = await fsdb(opts.db).collection(SCRIPTS_COLLECTION).where("week_of", ">=", fromWeek).get();
  return snap.docs.map((d) => toScript(d.id, d.data()));
}

export async function getWeekDoc(weekOf: string, opts: { db?: Firestore } = {}): Promise<ContentWeek | null> {
  const s = await fsdb(opts.db).collection(WEEKS_COLLECTION).doc(weekOf).get();
  return s.exists ? (s.data() as ContentWeek) : null;
}

/** The contract's `week`: live scripts (draft / approved) by slot. */
export function weekPayloadFrom(weekOf: string, doc: ContentWeek | null, scripts: ContentScript[]): WeekPayload {
  const live = scripts.filter((s) => s.status === "draft" || s.status === "approved").sort((a, b) => a.slot - b.slot);
  return {
    week_of: weekOf,
    state: weekStateOf(doc?.state, live),
    to_review: live.filter((s) => s.status === "draft").length,
    scripts: live,
  };
}

export async function weekPayload(weekOf: string, opts: { db?: Firestore } = {}): Promise<WeekPayload> {
  const [doc, scripts] = await Promise.all([getWeekDoc(weekOf, opts), weekScripts(weekOf, opts)]);
  return weekPayloadFrom(weekOf, doc, scripts);
}

/** Keeps ContentWeeks/{week}.state / script_ids in step with its scripts. */
export async function syncWeek(weekOf: string, opts: { db?: Firestore } = {}): Promise<WeekPayload> {
  const db = fsdb(opts.db);
  const [doc, scripts] = await Promise.all([getWeekDoc(weekOf, { db }), weekScripts(weekOf, { db })]);
  const p = weekPayloadFrom(weekOf, doc, scripts);
  await db
    .collection(WEEKS_COLLECTION)
    .doc(weekOf)
    .set({ state: p.state === "none" && doc?.state === "drafting" ? "drafting" : p.state, script_ids: p.scripts.map((s) => s.id) }, { merge: true });
  return p;
}

// ---------------------------------------------------------------- inputs

/** The latest niche scan (Settings/creator_portal.niche_scan_last), or null. */
export async function latestScan(opts: { db?: Firestore } = {}): Promise<{ id: string; status: string; finished_at: string | null; items: { videos: ScanItem[]; accounts: ScanItem[]; hair: ScanItem[] } } | null> {
  const db = fsdb(opts.db);
  const s = (await db.collection("Settings").doc("creator_portal").get()).data() ?? {};
  const id = typeof s.niche_scan_last === "string" ? s.niche_scan_last : null;
  if (!id) return null;
  const snap = await db.collection("NicheScans").doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  const fin = d.finished_at as { toDate?: () => Date } | undefined;
  return {
    id,
    status: String(d.status ?? ""),
    finished_at: fin?.toDate ? fin.toDate().toISOString() : null,
    items: { videos: d.videos ?? [], accounts: d.accounts ?? [], hair: d.hair ?? [] },
  };
}

/** Proven library rows (only the fields the content system needs). */
export async function loadLibrary(opts: { db?: Firestore } = {}): Promise<LibVideo[]> {
  const snap = await fsdb(opts.db)
    .collection(PROVEN_COLLECTION)
    .select("status", "format", "hook_family", "views", "hook_line", "hook_full", "added_by", "test_result", "stats", "tired.flagged")
    .get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      status: x.status ?? "suggested",
      format: x.format,
      hook_family: typeof x.hook_family === "string" ? x.hook_family.trim() : undefined,
      views: Number(x.views ?? 0),
      hook_line: x.hook_line ?? "",
      ...(x.hook_full ? { hook_full: x.hook_full } : {}),
      added_by: x.added_by ?? "seed",
      test_result: x.test_result,
      stats: { remakes: 0, beat_normal: 0, judged: 0, last_remake_on: null, recent_wins: 0, ...(x.stats ?? {}) },
      tired: x.tired ?? null,
    } as LibVideo;
  });
}

// ---------------------------------------------------------------- founder actions

const hist = (kind: ContentScript["history"][number]["kind"], extra: { note?: string; changed?: string[] } = {}) => ({
  at: new Date().toISOString(),
  kind,
  ...(extra.note ? { note: extra.note.slice(0, 2000) } : {}),
  ...(extra.changed?.length ? { changed: extra.changed } : {}),
});

async function mustGet(db: Firestore, id: string): Promise<ContentScript> {
  const s = await getScript(id, { db });
  if (!s) throw new CreatorDataError("Script not found.");
  return s;
}

/** Founder edit: only the editable fields; an approved script's idea is not changed. */
export async function editScript(id: string, fields: Record<string, unknown>, opts: { db?: Firestore } = {}): Promise<ContentScript> {
  const db = fsdb(opts.db);
  const cur = await mustGet(db, id);
  let patch: Partial<ContentScript>;
  try {
    patch = editPatch(fields ?? {});
  } catch (e) {
    throw new CreatorDataError(e instanceof Error ? e.message : String(e));
  }
  const next = { ...cur, ...patch };
  const changed = changedFields(cur, next);
  if (!changed.length) return cur;
  next.history = [...cur.history, hist("edit", { changed })];
  await db.collection(SCRIPTS_COLLECTION).doc(id).set({ ...patch, history: next.history }, { merge: true });
  return next;
}

/**
 * Approve drafts: one addIdeaBatch for all of them, slots in order, into
 * their week (days already past are skipped). Already approved ones are left.
 */
export async function approveScripts(scripts: ContentScript[], opts: { db?: Firestore; now?: Date } = {}): Promise<ContentScript[]> {
  const db = fsdb(opts.db);
  const todo = scripts.filter((s) => s.status === "draft").sort((a, b) => a.slot - b.slot);
  if (!todo.length) return [];
  const weeks = new Set(todo.map((s) => s.week_of));
  const out: ContentScript[] = [];
  for (const week of weeks) {
    const list = todo.filter((s) => s.week_of === week);
    const res = await addIdeaBatch({ ideas: list.map(ideaInputFromScript), week_of: week, skip_past: true }, { db, now: opts.now });
    const batch = db.batch();
    list.forEach((s, i) => {
      const ideaId = res.ideas[i]?.id;
      const next: ContentScript = { ...s, status: "approved", ...(ideaId ? { idea_id: ideaId } : {}), history: [...s.history, hist("approve")] };
      batch.set(db.collection(SCRIPTS_COLLECTION).doc(s.id), { status: next.status, idea_id: ideaId ?? null, history: next.history }, { merge: true });
      out.push(next);
    });
    await batch.commit();
    await syncWeek(week, { db });
  }
  return out;
}

export async function approveScript(id: string, opts: { db?: Firestore; now?: Date } = {}): Promise<ContentScript> {
  const db = fsdb(opts.db);
  const cur = await mustGet(db, id);
  if (cur.status === "approved") return cur;
  if (cur.status !== "draft") throw new CreatorDataError("Only a draft can be approved.");
  return (await approveScripts([cur], { db, now: opts.now }))[0];
}

export async function approveWeek(weekOf: string, opts: { db?: Firestore; now?: Date } = {}): Promise<WeekPayload> {
  const db = fsdb(opts.db);
  await approveScripts(await weekScripts(weekOf, { db }), { db, now: opts.now });
  return syncWeek(weekOf, { db });
}
