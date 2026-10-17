/**
 * Weekly content schedule, run from the 10-minute niche-scan cron using the
 * Settings/creator_portal doc that cron already reads (no extra reads idle).
 *
 * - Draft: once per week for the coming Monday, on Saturday (UTC) after that
 *   Saturday's niche scan is done, or from 23:30 UTC regardless; Sunday is a
 *   catch-up. Up to 3 tries if a run drafts nothing / errors.
 * - Push: Sunday from 00:30 UTC (06:00 IST), once per week, only when that
 *   week has drafted scripts.
 * - Manual: Settings/creator_portal.content_draft_requested = true (the next
 *   Monday, or today when it is Monday) or a Monday "YYYY-MM-DD". Fills empty
 *   slots only (a week with 10 live scripts is left as is); no push.
 *
 * State: Settings/creator_portal.content_draft { week, tries, done, count },
 * content_pushed_week.
 */
import type { Firestore } from "firebase-admin/firestore";
import { addDaysTo } from "./proven";
import { weekOfFor } from "./content";

export const DRAFT_MAX_TRIES = 3;

type Json = Record<string, unknown>;
export interface DraftState {
  week: string;
  tries: number;
  done: boolean;
  count: number;
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const isMonday = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).getUTCDay() === 1;

export function draftStateOf(raw: unknown): DraftState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Json;
  if (typeof r.week !== "string") return null;
  return { week: r.week, tries: Number(r.tries ?? 0) || 0, done: r.done === true, count: Number(r.count ?? 0) || 0 };
}

export type ContentAction = { kind: "draft"; week_of: string; manual: boolean } | { kind: "push"; week_of: string } | null;

/** What the cron should do now for content (pure). At most one action per call. */
export function contentDue(now: Date, s: Json): ContentAction {
  const req = s.content_draft_requested;
  if (req === true) return { kind: "draft", week_of: weekOfFor(utcDay(now)), manual: true };
  if (typeof req === "string" && isMonday(req)) return { kind: "draft", week_of: req, manual: true };

  const day = now.getUTCDay();
  if (day !== 6 && day !== 0) return null;
  const monday = addDaysTo(utcDay(now), day === 6 ? 2 : 1);
  const st = draftStateOf(s.content_draft);
  const mine = st && st.week === monday ? st : null;
  const drafted = !!mine && (mine.done || mine.tries >= DRAFT_MAX_TRIES);

  if (day === 0) {
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (!drafted) return { kind: "draft", week_of: monday, manual: false };
    if (minutes >= 30 && s.content_pushed_week !== monday && (mine?.count ?? 0) > 0) return { kind: "push", week_of: monday };
    return null;
  }
  if (drafted) return null;
  const satId = utcDay(now);
  const scanDone = typeof s.niche_scan_active !== "string" && typeof s.niche_scan_last === "string" && s.niche_scan_last >= satId;
  const pastDeadline = now.getUTCHours() * 60 + now.getUTCMinutes() >= 23 * 60 + 30;
  return scanDone || pastDeadline ? { kind: "draft", week_of: monday, manual: false } : null;
}

export const CONTENT_PUSH = {
  title: "10 new scripts ready",
  body: "Approve this week's scripts whenever you're free today.",
  data: { audience: "founder", type: "content" },
} as const;

/** Run the due action (drafting calls Claude; push goes to staff devices). */
export async function runContentAction(db: Firestore, action: NonNullable<ContentAction>, s: Json, now = new Date()): Promise<Json> {
  const ref = db.collection("Settings").doc("creator_portal");
  if (action.kind === "push") {
    await ref.set({ content_pushed_week: action.week_of }, { merge: true });
    const { notifyFounder } = await import("@/lib/staff");
    await notifyFounder({ ...CONTENT_PUSH, data: { ...CONTENT_PUSH.data } });
    return { content: "pushed", week_of: action.week_of };
  }
  const prev = draftStateOf(s.content_draft);
  const tries = action.manual ? 0 : prev && prev.week === action.week_of ? prev.tries + 1 : 1;
  const claim: Json = action.manual ? { content_draft_requested: false } : { content_draft: { week: action.week_of, tries, done: false, count: prev?.week === action.week_of ? prev.count : 0 } };
  await ref.set(claim, { merge: true });
  const { draftWeek } = await import("./content-writer");
  const week = await draftWeek(action.week_of, { db, now });
  const count = week.scripts.filter((x) => x.status === "draft" || x.status === "approved").length;
  const same = prev?.week === action.week_of ? prev : null;
  const done = (week.errors.length === 0 && count > 0) || !!same?.done;
  await ref.set({ content_draft: { week: action.week_of, tries: action.manual ? (same?.tries ?? 0) : tries, done, count } }, { merge: true });
  return { content: "drafted", week_of: action.week_of, count, errors: week.errors };
}
